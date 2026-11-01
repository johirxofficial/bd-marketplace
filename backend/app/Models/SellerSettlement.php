<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SellerSettlement extends Model
{
    protected $fillable = [
        'store_id', 'period_start', 'period_end', 'gross_sales', 'commission_total',
        'refund_total', 'adjustments', 'net_payable', 'status', 'approved_by',
        'approved_at', 'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'gross_sales' => 'decimal:2',
            'commission_total' => 'decimal:2',
            'refund_total' => 'decimal:2',
            'adjustments' => 'decimal:2',
            'net_payable' => 'decimal:2',
            'approved_at' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(SellerPayout::class, 'settlement_id');
    }

    public function orders(): HasMany
    {
        return $this->hasMany(SellerOrder::class, 'settlement_id');
    }
}
