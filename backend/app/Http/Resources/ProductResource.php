<?php

namespace App\Http\Resources;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $variants = $this->relationLoaded('variants') ? $this->variants->where('is_active', true) : collect();
        $minPrice = $variants->min(fn ($v) => (float) $v->price) ?? (float) $this->base_price;
        $maxCompare = $variants->max(fn ($v) => (float) ($v->compare_at_price ?? 0)) ?: (float) ($this->compare_at_price ?? 0);
        $stock = $variants->sum(fn ($v) => $v->inventory ? max(0, $v->inventory->quantity - $v->inventory->reserved_quantity) : 0);
        $promo = $this->relationLoaded('promotions')
            ? $this->promotions->filter(fn ($p) => $p->is_active
                && (! $p->product_id || $p->product_id === $this->id)
                && (! $p->category_id || $p->category_id === $this->category_id)
                && (! $p->store_id || $p->store_id === $this->store_id)
                && $p->starts_at->isPast() && $p->ends_at->isFuture())
                ->max(fn ($p) => (float) $p->value)
            : 0;
        $effective = $promo ? Money::sub(Money::of($minPrice), Money::percent($minPrice, $promo)) : Money::of($minPrice);
        $compare = $promo ? Money::of($minPrice) : ($maxCompare > $minPrice ? Money::of($maxCompare) : null);

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'sku' => $this->sku,
            'short_description' => $this->short_description,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'status_tone' => $this->status->tone(),
            'rejection_reason' => $this->rejection_reason,
            'image_url' => $this->image_url,
            'images' => $this->whenLoaded('images', fn () => $this->images->map(fn ($i) => [
                'id' => $i->id, 'path' => $i->path, 'url' => $i->url, 'alt_text' => $i->alt_text, 'is_primary' => $i->is_primary,
            ])),
            'price' => Money::of($minPrice),
            'effective_price' => $effective,
            'compare_at_price' => $compare,
            'discount_percent' => $promo ? round($promo) : ($compare && (float) $compare > 0 ? (int) round((1 - $minPrice / (float) $compare) * 100) : 0),
            'rating_avg' => (float) $this->rating_avg,
            'rating_count' => (int) $this->rating_count,
            'sold_count' => (int) $this->sold_count,
            'in_stock' => $stock > 0,
            'stock' => $stock,
            'stock_total' => $stock,
            'is_featured' => (bool) $this->is_featured,
            'store' => $this->whenLoaded('store', fn () => [
                'id' => $this->store->id, 'name' => $this->store->name, 'slug' => $this->store->slug,
            ]),
            'category' => $this->whenLoaded('category', fn () => [
                'id' => $this->category->id, 'name' => $this->category->name, 'slug' => $this->category->slug,
            ]),
            'brand' => $this->whenLoaded('brand', fn () => $this->brand ? [
                'id' => $this->brand->id, 'name' => $this->brand->name, 'slug' => $this->brand->slug,
            ] : null),
            'variants' => $this->whenLoaded('variants', fn () => $variants->map(fn ($v) => [
                'id' => $v->id,
                'name' => $v->name,
                'sku' => $v->sku,
                'price' => Money::of($v->price),
                'compare_at_price' => $v->compare_at_price ? Money::of($v->compare_at_price) : null,
                'stock' => $v->inventory ? max(0, $v->inventory->quantity - $v->inventory->reserved_quantity) : 0,
            ])->values()),
        ];
    }
}
