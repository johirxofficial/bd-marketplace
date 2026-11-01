<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOneThrough;

class Store extends Model
{
    protected $fillable = [
        'seller_id', 'name', 'slug', 'description', 'logo_path', 'banner_path',
        'status', 'rating_avg', 'rating_count',
    ];

    protected function casts(): array
    {
        return ['rating_avg' => 'decimal:2'];
    }

    public function seller(): BelongsTo
    {
        return $this->belongsTo(SellerProfile::class, 'seller_id');
    }

    public function sellerUser(): HasOneThrough
    {
        return $this->hasOneThrough(User::class, SellerProfile::class, 'id', 'user_id', 'seller_id', 'id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(SellerOrder::class);
    }

    public function settlements(): HasMany
    {
        return $this->hasMany(SellerSettlement::class);
    }
}
