<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Receipt extends Model
{
    protected $fillable = [
        'receipt_number', 'public_token', 'order_id', 'user_id', 'payment_transaction_id',
        'type', 'status', 'amount', 'currency', 'meta', 'issued_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'meta' => 'array',
            'issued_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function paymentTransaction(): BelongsTo
    {
        return $this->belongsTo(PaymentTransaction::class);
    }

    public function typeLabel(): string
    {
        return match ($this->type) {
            'payment' => 'Payment receipt',
            'refund' => 'Refund receipt',
            default => 'Order receipt',
        };
    }
}
