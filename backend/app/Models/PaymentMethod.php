<?php

namespace App\Models;

use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PaymentMethod extends Model
{
    protected $fillable = [
        'code', 'name', 'provider', 'type', 'mode', 'description', 'instructions',
        'logo_path', 'enabled', 'sort_order', 'fee_amount', 'fee_percent',
        'min_amount', 'max_amount', 'config',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'fee_amount' => 'decimal:2',
            'fee_percent' => 'decimal:2',
            'min_amount' => 'decimal:2',
            'max_amount' => 'decimal:2',
            'config' => 'encrypted:array',
        ];
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'payment_method', 'code');
    }

    public function isManual(): bool
    {
        return in_array($this->type, ['mfs', 'qr'], true);
    }

    public function isCod(): bool
    {
        return $this->type === 'cod';
    }

    public function isHosted(): bool
    {
        return $this->type === 'hosted';
    }

    public function feeFor(string|int|float $amount): string
    {
        return Money::add($this->fee_amount ?? 0, Money::percent($amount, $this->fee_percent ?? 0));
    }

    public function acceptsAmount(string|int|float $amount): bool
    {
        $value = Money::of($amount);

        if ($this->min_amount !== null && bccomp($value, Money::of($this->min_amount), 2) < 0) {
            return false;
        }

        if ($this->max_amount !== null && bccomp($value, Money::of($this->max_amount), 2) > 0) {
            return false;
        }

        return true;
    }

    /**
     * Only configuration safe for the customer-facing API.
     */
    public function publicConfig(): array
    {
        $config = $this->config ?: [];

        return array_filter([
            'merchant_number' => $config['merchant_number'] ?? null,
            'merchant_name' => $config['merchant_name'] ?? null,
            'account_type' => $config['account_type'] ?? null,
            'bank_name' => $config['bank_name'] ?? null,
            'biller_id' => $config['biller_id'] ?? null,
            'biller_name' => $config['biller_name'] ?? null,
            'qr_merchant_name' => $config['qr_merchant_name'] ?? null,
            'qr_merchant_city' => $config['qr_merchant_city'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');
    }
}
