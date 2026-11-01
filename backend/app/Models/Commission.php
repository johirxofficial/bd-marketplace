<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Commission extends Model
{
    protected $fillable = ['seller_order_id', 'store_id', 'order_id', 'rate', 'amount', 'status'];

    protected function casts(): array
    {
        return ['rate' => 'decimal:2', 'amount' => 'decimal:2'];
    }

    public function sellerOrder(): BelongsTo
    {
        return $this->belongsTo(SellerOrder::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
