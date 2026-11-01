<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Review;

class ProductRatingService
{
    public function refresh(Product $product): void
    {
        $stats = $product->reviews()->where('status', 'approved')
            ->selectRaw('COUNT(*) as total, COALESCE(AVG(rating), 0) as average')->first();

        $product->update([
            'rating_count' => (int) ($stats->total ?? 0),
            'rating_avg' => round((float) ($stats->average ?? 0), 2),
        ]);

        $store = $product->store;
        if ($store) {
            $approvedReviews = Review::whereHas('product', fn ($q) => $q->where('store_id', $store->id))
                ->where('status', 'approved');

            $store->update([
                'rating_count' => (int) (clone $approvedReviews)->count(),
                'rating_avg' => round((float) (clone $approvedReviews)->avg('rating'), 2),
            ]);
        }
    }
}
