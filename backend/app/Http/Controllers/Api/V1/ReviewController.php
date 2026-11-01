<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReviewRequest;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ReviewController extends Controller
{
    public function index(Product $product): JsonResponse
    {
        $reviews = $product->reviews()->where('status', 'approved')->with('user:id,name')->latest()->paginate(10);

        return response()->json([
            'reviews' => $reviews->through(fn ($r) => [
                'id' => $r->id, 'rating' => $r->rating, 'title' => $r->title, 'comment' => $r->comment,
                'reviewer' => $r->user?->name ? mb_substr($r->user->name, 0, 1).'***' : 'Customer',
                'seller_reply' => $r->seller_reply, 'created_at' => $r->created_at?->toIso8601String(),
            ]),
            'summary' => [
                'average' => round((float) $product->reviews()->where('status', 'approved')->avg('rating'), 2),
                'count' => $product->reviews()->where('status', 'approved')->count(),
            ],
        ]);
    }

    public function store(ReviewRequest $request, Product $product): JsonResponse
    {
        $item = OrderItem::with('order')->findOrFail($request->integer('order_item_id'));
        $order = $item->order;
        if (! $order || $order->user_id !== $request->user()->id || $item->product_id !== $product->id) {
            throw ValidationException::withMessages(['order_item_id' => 'You can only review a product you purchased.']);
        }
        if (! in_array($order->status->value, ['delivered', 'completed'], true)) {
            throw ValidationException::withMessages(['order_item_id' => 'You can review after the order is delivered.']);
        }
        if (Review::where('user_id', $request->user()->id)->where('product_id', $product->id)->exists()) {
            throw ValidationException::withMessages(['order_item_id' => 'You have already reviewed this product.']);
        }

        $review = Review::create([
            'product_id' => $product->id,
            'user_id' => $request->user()->id,
            'order_item_id' => $item->id,
            'rating' => $request->integer('rating'),
            'title' => $request->input('title'),
            'comment' => $request->input('comment'),
            'status' => 'pending',
        ]);

        return response()->json([
            'message' => 'Thank you. Your review will appear after moderation.',
            'review' => ['id' => $review->id, 'status' => $review->status],
        ], 201);
    }
}
