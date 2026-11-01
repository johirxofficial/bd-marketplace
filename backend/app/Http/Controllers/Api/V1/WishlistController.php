<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\Wishlist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WishlistController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $wishlists = $request->user()->wishlist()
            ->with(['product.images', 'product.variants.inventory', 'product.store', 'product.category', 'product.brand', 'product.promotions'])
            ->latest()->get();

        return response()->json([
            'items' => $wishlists->filter(fn ($w) => $w->product && $w->product->status->value === 'approved')->map(fn ($w) => [
                'id' => $w->id,
                'product' => new ProductResource($w->product),
            ])->values(),
        ]);
    }

    public function store(Request $request, Product $product): JsonResponse
    {
        abort_unless($product->status->value === 'approved', 404);
        $wishlist = Wishlist::firstOrCreate(['user_id' => $request->user()->id, 'product_id' => $product->id]);

        return response()->json(['message' => 'Saved to wishlist.', 'wishlist_id' => $wishlist->id], 201);
    }

    public function destroy(Request $request, Product $product): JsonResponse
    {
        Wishlist::where('user_id', $request->user()->id)->where('product_id', $product->id)->delete();

        return response()->json(['message' => 'Removed from wishlist.']);
    }
}
