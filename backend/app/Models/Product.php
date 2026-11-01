<?php

namespace App\Models;

use App\Enums\ProductStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'store_id', 'category_id', 'brand_id', 'name', 'slug', 'sku',
        'short_description', 'description', 'specifications', 'base_price',
        'compare_at_price', 'status', 'rejection_reason', 'is_featured',
        'rating_avg', 'rating_count', 'sold_count', 'created_by', 'approved_by', 'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'specifications' => 'array',
            'base_price' => 'decimal:2',
            'compare_at_price' => 'decimal:2',
            'rating_avg' => 'decimal:2',
            'is_featured' => 'boolean',
            'approved_at' => 'datetime',
            'status' => ProductStatus::class,
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }

    public function primaryImage(): HasOne
    {
        return $this->hasOne(ProductImage::class)->where('is_primary', true);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class);
    }

    public function attributes(): HasMany
    {
        return $this->hasMany(ProductAttribute::class);
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function approvedReviews(): HasMany
    {
        return $this->hasMany(Review::class)->where('status', 'approved');
    }

    public function promotions(): HasMany
    {
        return $this->hasMany(Promotion::class);
    }

    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('status', ProductStatus::Approved->value);
    }

    public function scopeVisible(Builder $query): Builder
    {
        return $query->approved()->whereHas('store', fn ($q) => $q->where('status', 'active'))
            ->whereHas('store.seller', fn ($q) => $q->where('status', 'approved'));
    }

    public function scopeInStock(Builder $query): Builder
    {
        return $query->whereHas('variants', fn ($q) => $q->where('is_active', true)
            ->whereHas('inventory', fn ($i) => $i->whereColumn('quantity', '>', 'reserved_quantity')));
    }

    public function getImageUrlAttribute(): string
    {
        $path = $this->relationLoaded('images')
            ? ($this->images->firstWhere('is_primary', true) ?? $this->images->first())?->path
            : $this->primaryImage?->path;

        return $path ? url('/media/'.$path) : asset('/images/placeholder-product.svg');
    }
}
