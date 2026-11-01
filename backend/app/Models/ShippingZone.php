<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShippingZone extends Model
{
    protected $fillable = [
        'name', 'division', 'district', 'inside_dhaka', 'base_fee',
        'free_shipping_threshold', 'estimated_days_min', 'estimated_days_max', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'inside_dhaka' => 'boolean',
            'is_active' => 'boolean',
            'base_fee' => 'decimal:2',
            'free_shipping_threshold' => 'decimal:2',
        ];
    }
}
