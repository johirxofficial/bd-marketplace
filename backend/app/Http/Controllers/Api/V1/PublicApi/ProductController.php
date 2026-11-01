<?php

namespace App\Http\Controllers\Api\V1\PublicApi;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductDetailResource;
use App\Http\Resources\ProductResource;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'string', 'max:140'],
            'brand' => ['nullable', 'string', 'max:500'],
            'min_price' => ['nullable', 'numeric', 'min:0'],
            'max_price' => ['nullable', 'numeric', 'min:0'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'availability' => ['nullable', 'in:in_stock,all'],
            'sort' => ['nullable', 'in:relevance,newest,price_asc,price_desc,rating,popular'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:48'],
        ]);

        $query = Product::visible()
            ->with(['images', 'variants.inventory', 'store', 'category', 'brand', 'promotions']);

        if (! empty($validated['search'])) {
            $search = trim($validated['search']);
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%")
                    ->orWhere('short_description', 'like', "%{$search}%");
            });
        }

        if (! empty($validated['category'])) {
            $category = Category::where('slug', $validated['category'])->first();
            if ($category) {
                $ids = $category->children()->pluck('id')->push($category->id);
                foreach ($category->children as $child) {
                    $ids = $ids->merge($child->children()->pluck('id'));
                }
                $query->whereIn('category_id', $ids->unique());
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        if (! empty($validated['brand'])) {
            $slugs = array_filter(explode(',', $validated['brand']));
            $ids = Brand::whereIn('slug', $slugs)->pluck('id');
            $query->whereIn('brand_id', $ids);
        }

        if (! empty($validated['min_price'])) {
            $query->whereHas('variants', fn ($q) => $q->where('price', '>=', $validated['min_price']));
        }
        if (! empty($validated['max_price'])) {
            $query->whereHas('variants', fn ($q) => $q->where('price', '<=', $validated['max_price']));
        }
        if (! empty($validated['rating'])) {
            $query->where('rating_avg', '>=', $validated['rating']);
        }
        if (($validated['availability'] ?? '') === 'in_stock') {
            $query->inStock();
        }

        $query = match ($validated['sort'] ?? 'relevance') {
            'newest' => $query->latest(),
            'price_asc' => $query->orderBy('base_price', 'asc'),
            'price_desc' => $query->orderBy('base_price', 'desc'),
            'rating' => $query->orderByDesc('rating_avg')->orderByDesc('rating_count'),
            'popular' => $query->orderByDesc('sold_count'),
            default => $query->orderByDesc('is_featured')->orderByDesc('sold_count')->orderByDesc('rating_avg'),
        };

        $products = $query->paginate($validated['per_page'] ?? 12)->withQueryString();

        return ProductResource::collection($products)->response();
    }

    public function show(string $slug): JsonResponse
    {
        $product = Product::visible()
            ->where('slug', $slug)
            ->with([
                'images', 'variants.inventory', 'store', 'category.parent', 'brand', 'promotions', 'attributes',
                'reviews' => fn ($q) => $q->where('status', 'approved')->latest()->limit(20),
            ])
            ->firstOrFail();

        return response()->json(['product' => new ProductDetailResource($product)]);
    }

    public function related(string $slug): JsonResponse
    {
        $product = Product::visible()->where('slug', $slug)->firstOrFail();
        $related = Product::visible()
            ->where('category_id', $product->category_id)
            ->where('id', '!=', $product->id)
            ->with(['images', 'variants.inventory', 'store', 'category', 'brand', 'promotions'])
            ->inStock()->limit(8)->get();

        return response()->json(['products' => ProductResource::collection($related)]);
    }

    public function filters(): JsonResponse
    {
        return response()->json([
            'categories' => Category::where('is_active', true)->whereNull('parent_id')
                ->with(['children' => fn ($q) => $q->where('is_active', true)])->orderBy('sort_order')->get(),
            'brands' => Brand::where('is_active', true)->orderBy('name')->get(['id', 'name', 'slug']),
            'price_range' => [
                'min' => (float) Product::visible()->min('base_price'),
                'max' => (float) Product::visible()->max('base_price'),
            ],
        ]);
    }
}
