<?php

namespace App\Http\Resources;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $base = (new ProductResource($this->resource))->toArray($request);
        $promo = $this->relationLoaded('promotions')
            ? $this->promotions->filter(fn ($p) => $p->is_active
                && (! $p->product_id || $p->product_id === $this->id)
                && (! $p->category_id || $p->category_id === $this->category_id)
                && (! $p->store_id || $p->store_id === $this->store_id)
                && $p->starts_at->isPast() && $p->ends_at->isFuture())
                ->max(fn ($p) => (float) $p->value)
            : 0;

        $variants = $this->variants->where('is_active', true)->map(function ($v) use ($promo) {
            $price = Money::of($v->price);
            $effective = $promo ? Money::sub($price, Money::percent($price, $promo)) : $price;
            $stock = $v->inventory ? max(0, $v->inventory->quantity - $v->inventory->reserved_quantity) : 0;

            return [
                'id' => $v->id, 'name' => $v->name, 'sku' => $v->sku,
                'price' => $price, 'effective_price' => $effective,
                'compare_at_price' => $v->compare_at_price ? Money::of($v->compare_at_price) : null,
                'stock' => $stock, 'is_active' => $v->is_active, 'weight_grams' => $v->weight_grams,
            ];
        })->values();

        return array_merge($base, [
            'description' => $this->description,
            'specifications' => $this->specifications ?? [],
            'attributes' => $this->whenLoaded('attributes', fn () => $this->attributes->map(fn ($a) => [
                'name' => $a->name, 'values' => $a->values,
            ])),
            'variants' => $variants,
            'store' => $this->whenLoaded('store', fn () => [
                'id' => $this->store->id, 'name' => $this->store->name, 'slug' => $this->store->slug,
                'description' => $this->store->description, 'logo_path' => $this->store->logo_path,
                'rating_avg' => (float) $this->store->rating_avg, 'rating_count' => (int) $this->store->rating_count,
                'status' => $this->store->status,
            ]),
            'review_summary' => $this->relationLoaded('reviews') ? [
                'average' => round((float) ($this->reviews->avg('rating') ?? 0), 2),
                'count' => $this->reviews->count(),
                'breakdown' => collect([5, 4, 3, 2, 1])->mapWithKeys(fn ($r) => [
                    $r => $this->reviews->where('rating', $r)->count(),
                ]),
            ] : null,
        ]);
    }
}
