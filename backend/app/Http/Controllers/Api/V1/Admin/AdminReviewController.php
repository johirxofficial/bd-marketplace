<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Review;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\ProductRatingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminReviewController extends Controller
{
    public function __construct(
        private readonly ProductRatingService $ratings,
        private readonly AuditService $audit,
        private readonly NotificationService $notifications,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $reviews = Review::with(['product:id,name,slug', 'user:id,name,email'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('rating'), fn ($q) => $q->where('rating', $request->integer('rating')))
            ->latest()->paginate(20);

        return response()->json(['reviews' => $reviews->through(fn ($r) => [
            'id' => $r->id, 'rating' => $r->rating, 'title' => $r->title, 'comment' => $r->comment,
            'status' => $r->status, 'product' => $r->product?->only(['id', 'name', 'slug']),
            'customer' => $r->user?->only(['id', 'name', 'email']),
            'created_at' => $r->created_at?->toIso8601String(),
        ])]);
    }

    public function update(Request $request, Review $review): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'pending'])],
            'seller_reply' => ['nullable', 'string', 'max:2000'],
        ]);
        $review->update([
            'status' => $data['status'],
            'seller_reply' => $data['seller_reply'] ?? $review->seller_reply,
            'replied_at' => isset($data['seller_reply']) ? now() : $review->replied_at,
        ]);
        $this->ratings->refresh($review->product);
        $this->notifications->send($review->user_id, 'review.'.$data['status'], 'Review '.$data['status'],
            'Your review for '.$review->product?->name.' is now '.$data['status'].'.',
            '/account/notifications',
            ['message' => 'Review for '.$review->product?->name],
            'review_'.$data['status']);
        $this->audit->log('review.status_changed', $review, [], ['status' => $data['status']]);

        return response()->json(['message' => 'Review updated.', 'review' => $review->fresh()]);
    }
}
