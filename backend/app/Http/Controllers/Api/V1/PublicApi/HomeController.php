<?php

namespace App\Http\Controllers\Api\V1\PublicApi;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Banner;
use App\Models\Brand;
use App\Models\Category;
use App\Models\PlatformSetting;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\Store;
use Illuminate\Http\JsonResponse;

class HomeController extends Controller
{
    public function index(): JsonResponse
    {
        $products = Product::visible()
            ->with(['images', 'variants.inventory', 'store', 'category', 'brand', 'promotions'])
            ->withCount('variants');

        $banners = Banner::where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->orderBy('sort_order')->get();

        $flashPromotions = Promotion::live()
            ->whereNotNull('product_id')
            ->with(['product' => fn ($q) => $q->visible()->with(['images', 'variants.inventory', 'store', 'category', 'brand', 'promotions'])])
            ->get()
            ->filter(fn ($p) => $p->product)
            ->map(fn ($p) => ['promotion' => [
                'id' => $p->id, 'name' => $p->name, 'value' => $p->value,
                'ends_at' => $p->ends_at->toIso8601String(),
            ], 'product' => new ProductResource($p->product)]);

        $categories = Category::whereNull('parent_id')->where('is_active', true)
            ->with(['children' => fn ($q) => $q->where('is_active', true), 'children.children' => fn ($q) => $q->where('is_active', true)])
            ->orderBy('sort_order')->get();

        $stores = Store::where('status', 'active')
            ->withCount(['products' => fn ($q) => $q->where('status', 'approved')])
            ->having('products_count', '>', 0)
            ->orderByDesc('rating_avg')->limit(6)->get();

        return response()->json([
            'banners' => $banners,
            'categories' => $categories,
            'brands' => Brand::where('is_active', true)->whereHas('products', fn ($q) => $q->visible())->orderBy('name')->get(),
            'featured' => ProductResource::collection((clone $products)->where('is_featured', true)->latest()->limit(10)->get()),
            'new_arrivals' => ProductResource::collection((clone $products)->latest()->limit(10)->get()),
            'best_sellers' => ProductResource::collection((clone $products)->orderByDesc('sold_count')->limit(10)->get()),
            'flash_sales' => $flashPromotions->values(),
            'stores' => $stores->map(fn ($s) => [
                'id' => $s->id, 'name' => $s->name, 'slug' => $s->slug,
                'description' => $s->description, 'logo_path' => $s->logo_path,
                'rating_avg' => (float) $s->rating_avg, 'rating_count' => $s->rating_count,
                'products_count' => $s->products_count,
            ]),
            'settings' => [
                'store_name' => PlatformSetting::get('store_name', 'BD Marketplace'),
                'support_phone' => PlatformSetting::get('support_phone', ''),
                'support_email' => PlatformSetting::get('support_email', ''),
                'announcement' => \App\Plugins\Hook::applyFilters('home.announcement', PlatformSetting::get('announcement', '')),
                'currency' => 'BDT',
                'currency_symbol' => '৳',
            ],
        ]);
    }
}
