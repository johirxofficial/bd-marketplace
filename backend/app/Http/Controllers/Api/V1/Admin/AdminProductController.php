<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductDetailResource;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\WebhookService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminProductController extends Controller
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly NotificationService $notifications,
        private readonly WebhookService $webhooks,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $products = Product::with(['images', 'variants.inventory', 'store', 'category', 'brand', 'promotions'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('store_id'), fn ($q) => $q->where('store_id', $request->integer('store_id')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', '%'.$request->string('search').'%')->orWhere('sku', 'like', '%'.$request->string('search').'%')))
            ->latest()->paginate(15);

        return ProductResource::collection($products)->response();
    }

    public function show(Product $product): JsonResponse
    {
        $product->load(['images', 'variants.inventory', 'store', 'category', 'brand', 'promotions', 'attributes', 'reviews.user:id,name']);

        return response()->json(['product' => new ProductDetailResource($product), 'seller' => $product->store?->seller?->user]);
    }

    public function updateStatus(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'archived', 'pending'])],
            'reason' => ['nullable', 'string', 'max:1000'],
            'is_featured' => ['sometimes', 'boolean'],
        ]);

        $old = ['status' => $product->status->value, 'is_featured' => $product->is_featured];
        $product->update([
            'status' => $data['status'],
            'rejection_reason' => $data['status'] === 'rejected' ? ($data['reason'] ?? 'Product did not meet marketplace guidelines.') : null,
            'is_featured' => $request->has('is_featured') ? $request->boolean('is_featured') : $product->is_featured,
            'approved_by' => $data['status'] === 'approved' ? $request->user()->id : $product->approved_by,
            'approved_at' => $data['status'] === 'approved' ? now() : $product->approved_at,
        ]);

        $emailEvent = match ($data['status']) {
            'approved' => 'product_approved',
            'rejected' => 'product_rejected',
            default => 'product_moderation',
        };

        $this->notifications->send(
            $product->store->seller->user_id,
            'product.'.$data['status'],
            'Product '.$data['status'],
            "{$product->name} is now {$data['status']}.".((($data['reason'] ?? null)) ? " Reason: {$data['reason']}" : ''),
            '/seller/products',
            ['message' => $product->name, 'reason' => $data['reason'] ?? ''],
            $emailEvent,
        );
        $this->audit->log('product.status_changed', $product, $old, ['status' => $data['status'], 'reason' => $data['reason'] ?? null]);

        if ($data['status'] === 'approved') {
            $this->webhooks->dispatch('product.approved', [
                'product_id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'store_id' => $product->store_id,
                'store_name' => $product->store?->name,
            ]);
        }

        return response()->json(['message' => 'Product status updated.', 'product' => new ProductResource($product->fresh(['images', 'variants.inventory', 'store', 'category', 'brand', 'promotions']))]);
    }
}
