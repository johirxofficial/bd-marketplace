<?php

namespace App\Http\Controllers\Api\V1\Seller;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Services\AuditService;
use App\Services\InventoryService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SellerProductController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly InventoryService $inventory,
        private readonly NotificationService $notifications,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $store = $this->sellerStore($request);
        $products = Product::where('store_id', $store->id)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', '%'.$request->string('search').'%')->orWhere('sku', 'like', '%'.$request->string('search').'%')))
            ->with(['images', 'variants.inventory', 'category', 'brand', 'promotions'])
            ->latest()->paginate(15);

        return ProductResource::collection($products)->additional(['meta' => ['store' => $store->name]])->response();
    }

    public function store(ProductRequest $request): JsonResponse
    {
        $store = $this->sellerStore($request);
        $this->assertSkusAvailable($request->input('variants', []));

        $product = DB::transaction(function () use ($request, $store) {
            $data = $request->validated();
            $status = $request->input('status') === 'draft' ? 'draft' : 'pending';
            $product = Product::create([
                'store_id' => $store->id,
                'category_id' => $data['category_id'],
                'brand_id' => $data['brand_id'] ?? null,
                'name' => $data['name'],
                'slug' => $this->uniqueSlug($data['name'], 'product'),
                'sku' => $this->uniqueSku($data['variants'][0]['sku'] ?? strtoupper(Str::random(8))),
                'short_description' => $data['short_description'] ?? null,
                'description' => $data['description'],
                'specifications' => $this->specifications($data['specifications'] ?? []),
                'base_price' => $data['base_price'],
                'compare_at_price' => $data['compare_at_price'] ?? null,
                'status' => $status,
                'created_by' => $request->user()->id,
            ]);
            $this->syncVariants($product, $data['variants'], $request->user()->id);
            $this->syncImages($product, $data['images'] ?? []);

            return $product;
        });

        $this->notifyModerators($product);
        $this->audit->log('product.created', $product, [], ['name' => $product->name, 'status' => $product->status->value]);

        return response()->json([
            'message' => $product->status->value === 'pending' ? 'Product submitted for review.' : 'Draft saved.',
            'product' => new ProductResource($product->load(['images', 'variants.inventory', 'category', 'brand', 'promotions'])),
        ], 201);
    }

    public function show(Request $request, Product $product): JsonResponse
    {
        $this->owner($request, $product);
        $product->load(['images', 'variants.inventory', 'category', 'brand', 'promotions', 'attributes']);

        $payload = (new ProductResource($product))->toArray($request);

        return response()->json(['product' => array_merge($payload, [
            'description' => $product->description,
            'specifications' => $product->specifications ?? [],
        ])]);
    }

    public function update(ProductRequest $request, Product $product): JsonResponse
    {
        $this->owner($request, $product);
        $variants = $request->input('variants', []);
        $this->assertSkusAvailable($variants, $product->id);

        DB::transaction(function () use ($request, $product, $variants) {
            $data = $request->validated();
            $old = $product->only(['name', 'status', 'base_price']);
            $status = $request->input('status') === 'draft' ? 'draft' : 'pending';
            $product->update([
                'category_id' => $data['category_id'],
                'brand_id' => $data['brand_id'] ?? null,
                'name' => $data['name'],
                'short_description' => $data['short_description'] ?? null,
                'description' => $data['description'],
                'specifications' => $this->specifications($data['specifications'] ?? []),
                'base_price' => $data['base_price'],
                'compare_at_price' => $data['compare_at_price'] ?? null,
                'status' => $status,
                'rejection_reason' => null,
            ]);
            $this->syncVariants($product, $variants, $request->user()->id);
            $this->syncImages($product, $data['images'] ?? []);
            $this->audit->log('product.updated', $product, $old, ['name' => $product->name, 'status' => $status]);
        });

        $this->notifyModerators($product->fresh());

        return response()->json([
            'message' => 'Product updated and submitted for review.',
            'product' => new ProductResource($product->fresh(['images', 'variants.inventory', 'category', 'brand', 'promotions'])),
        ]);
    }

    public function destroy(Request $request, Product $product): JsonResponse
    {
        $this->owner($request, $product);
        $product->update(['status' => 'archived']);
        $this->audit->log('product.archived', $product, [], ['status' => 'archived']);

        return response()->json(['message' => 'Product archived. Historical orders are preserved.']);
    }

    private function syncVariants(Product $product, array $variants, int $userId): void
    {
        $keptIds = [];
        $prices = [];
        foreach ($variants as $v) {
            $variant = isset($v['id']) ? $product->variants()->whereKey($v['id'])->first() : null;
            if (! $variant && isset($v['id'])) {
                throw ValidationException::withMessages(['variants' => 'One of the variants does not belong to this product.']);
            }
            $payload = [
                'name' => $v['name'],
                'sku' => $v['sku'],
                'price' => $v['price'],
                'compare_at_price' => $v['compare_at_price'] ?? null,
                'weight_grams' => $v['weight_grams'] ?? 0,
                'is_active' => $v['is_active'] ?? true,
            ];
            if ($variant) {
                $variant->update($payload);
            } else {
                $variant = $product->variants()->create($payload);
                Inventory::create(['variant_id' => $variant->id, 'quantity' => 0, 'reserved_quantity' => 0]);
            }
            Inventory::firstOrCreate(['variant_id' => $variant->id], ['quantity' => 0, 'reserved_quantity' => 0]);
            $this->inventory->adjust($variant, (int) $v['stock'], 'Seller stock update', \App\Models\User::find($userId));
            $keptIds[] = $variant->id;
            $prices[] = (float) $v['price'];
        }

        $product->variants()->whereNotIn('id', $keptIds)->each(function (ProductVariant $variant) {
            $variant->update(['is_active' => false]);
        });
        if ($prices) {
            $product->update(['base_price' => min($prices)]);
        }
    }

    private function syncImages(Product $product, array $paths): void
    {
        if (empty($paths)) {
            return;
        }
        $product->images()->delete();
        foreach (array_values(array_unique($paths)) as $index => $path) {
            if (! str_starts_with($path, 'products/') || ! is_file(storage_path('app/uploads/'.$path))) {
                throw ValidationException::withMessages(['images' => 'One of the image paths is invalid.']);
            }
            ProductImage::create([
                'product_id' => $product->id,
                'path' => $path,
                'alt_text' => $product->name,
                'sort_order' => $index,
                'is_primary' => $index === 0,
            ]);
        }
    }

    private function assertSkusAvailable(array $variants, ?int $productId = null): void
    {
        $skus = collect($variants)->pluck('sku')->filter()->unique();
        $existing = ProductVariant::whereIn('sku', $skus)
            ->when($productId, fn ($q) => $q->where('product_id', '!=', $productId))
            ->pluck('sku');
        if ($existing->isNotEmpty()) {
            throw ValidationException::withMessages(['variants' => 'These SKUs are already in use: '.$existing->implode(', ')]);
        }
    }

    private function specifications(array $rows): array
    {
        return collect($rows)->filter(fn ($r) => ! empty($r['name']) && isset($r['value']))
            ->mapWithKeys(fn ($r) => [$r['name'] => $r['value']])->all();
    }

    private function uniqueSlug(string $name, string $type): string
    {
        $base = Str::slug($name) ?: $type;
        $slug = $base;
        $i = 2;
        while (Product::withTrashed()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    private function uniqueSku(string $sku): string
    {
        $base = preg_replace('/[^A-Za-z0-9-]/', '', strtoupper($sku)) ?: 'SKU';
        $value = $base;
        $i = 2;
        while (Product::withTrashed()->where('sku', $value)->exists()) {
            $value = $base.'-'.$i++;
        }

        return $value;
    }

    private function notifyModerators(Product $product): void
    {
        if ($product->status->value !== 'pending') {
            return;
        }
        $staff = \App\Models\User::whereHas('role', fn ($q) => $q->whereIn('name', ['admin', 'manager']))->get();
        $this->notifications->sendMany($staff, 'product.moderation', 'Product awaiting review',
            "{$product->name} was submitted by {$product->store->name}.", '/admin/products');
    }

    private function sellerStore(Request $request)
    {
        $profile = $request->user()->sellerProfile;
        abort_unless($profile && $profile->status === 'approved' && $profile->store, 403, 'Your seller account is not approved.');
        abort_unless($profile->store->status === 'active', 403, 'Your store is not active.');

        return $profile->store;
    }

    private function owner(Request $request, Product $product): void
    {
        abort_unless($product->store_id === $this->sellerStore($request)->id, 403, 'You do not have access to this product.');
    }
}
