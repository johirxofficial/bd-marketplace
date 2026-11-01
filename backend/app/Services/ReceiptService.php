<?php

namespace App\Services;

use App\Models\Order;
use App\Models\PaymentTransaction;
use App\Models\PlatformSetting;
use App\Models\Receipt;
use App\Models\Refund;
use App\Models\ReturnRequest;
use App\Support\Money;
use Illuminate\Support\Str;

class ReceiptService
{
    /**
     * Issue (or return) the order-level receipt. Safe to call repeatedly.
     */
    public function forOrder(Order $order, string $type = 'order', ?PaymentTransaction $transaction = null): Receipt
    {
        $order->loadMissing(['items', 'user', 'paymentMethod']);

        $existing = Receipt::where('order_id', $order->id)
            ->where('type', $type)
            ->when($transaction, fn ($q) => $q->where('payment_transaction_id', $transaction->id))
            ->when(! $transaction, fn ($q) => $q->whereNull('payment_transaction_id'))
            ->first();

        if ($existing) {
            return $existing;
        }

        $amount = $type === 'payment' && $transaction
            ? $transaction->amount
            : $order->grand_total;

        return Receipt::create([
            'receipt_number' => $this->nextNumber(),
            'public_token' => Str::random(48),
            'order_id' => $order->id,
            'user_id' => $order->user_id,
            'payment_transaction_id' => $transaction?->id,
            'type' => $type,
            'status' => 'issued',
            'amount' => $amount,
            'currency' => 'BDT',
            'issued_at' => now(),
            'meta' => [
                'snapshot' => $this->snapshot($order, $transaction),
            ],
        ]);
    }

    /**
     * Refunds can happen more than once per order, so each one gets a receipt.
     */
    public function forRefund(ReturnRequest $return, Refund $refund): Receipt
    {
        $order = $return->order()->firstOrFail();
        $order->loadMissing(['items', 'user', 'paymentMethod']);

        return Receipt::create([
            'receipt_number' => $this->nextNumber(),
            'public_token' => Str::random(48),
            'order_id' => $order->id,
            'user_id' => $order->user_id,
            'payment_transaction_id' => null,
            'type' => 'refund',
            'status' => 'issued',
            'amount' => $refund->amount,
            'currency' => 'BDT',
            'issued_at' => now(),
            'meta' => [
                'return_number' => $return->return_number,
                'refund_id' => $refund->id,
                'snapshot' => $this->snapshot($order),
            ],
        ]);
    }

    public function url(Receipt $receipt, bool $public = true): string
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $url = $base.'/receipts/'.$receipt->receipt_number;

        return $public ? $url.'?token='.$receipt->public_token : $url;
    }

    public function findByToken(string $receiptNumber, string $token): ?Receipt
    {
        $receipt = Receipt::where('receipt_number', $receiptNumber)->first();

        if (! $receipt || ! hash_equals($receipt->public_token, $token)) {
            return null;
        }

        return $receipt;
    }

    /**
     * Present a receipt as stable, printable data.
     *
     * @return array<string, mixed>
     */
    public function data(Receipt $receipt): array
    {
        $receipt->loadMissing(['order.items', 'order.user', 'order.paymentMethod', 'paymentTransaction']);
        $order = $receipt->order;
        $snapshot = $receipt->meta['snapshot'] ?? $this->snapshot($order, $receipt->paymentTransaction);
        $logo = $snapshot['store']['logo_path'] ?? null;

        return [
            'receipt' => [
                'number' => $receipt->receipt_number,
                'type' => $receipt->type,
                'type_label' => $receipt->typeLabel(),
                'status' => $receipt->status,
                'amount' => $receipt->amount,
                'currency' => $receipt->currency,
                'issued_at' => $receipt->issued_at?->toIso8601String(),
                'token' => $receipt->public_token,
                'url' => $this->url($receipt),
            ],
            'store' => array_merge($snapshot['store'] ?? [], [
                'logo_url' => $logo ? url('/media/'.ltrim($logo, '/')) : null,
            ]),
            'order' => $snapshot['order'] ?? [],
            'customer' => $snapshot['customer'] ?? [],
            'shipping' => $snapshot['shipping'] ?? [],
            'items' => $snapshot['items'] ?? [],
            'totals' => $snapshot['totals'] ?? [],
            'payment' => $snapshot['payment'] ?? [],
            'meta' => [
                'return_number' => $receipt->meta['return_number'] ?? null,
                'refund_id' => $receipt->meta['refund_id'] ?? null,
            ],
            'notes' => [
                'footer' => PlatformSetting::get('footer_text', ''),
                'return_policy' => PlatformSetting::get('return_policy', ''),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function snapshot(Order $order, ?PaymentTransaction $transaction = null): array
    {
        $method = $order->paymentMethod;

        $items = $order->items->map(fn ($item) => [
            'name' => $item->product_name,
            'variant' => $item->variant_name,
            'sku' => $item->sku,
            'store_name' => $item->product_snapshot['store_name'] ?? null,
            'quantity' => $item->quantity,
            'unit_price' => $item->unit_price,
            'line_total' => $item->line_total,
        ])->values()->all();

        return [
            'store' => [
                'name' => (string) PlatformSetting::get('store_name', config('app.name', 'Marketplace')),
                'tagline' => (string) PlatformSetting::get('tagline', ''),
                'support_email' => (string) PlatformSetting::get('support_email', ''),
                'support_phone' => (string) PlatformSetting::get('support_phone', ''),
                'support_address' => (string) PlatformSetting::get('support_address', ''),
                'website' => rtrim((string) config('app.frontend_url', config('app.url')), '/'),
                'logo_path' => PlatformSetting::get('store_logo_path'),
            ],
            'order' => [
                'number' => $order->order_number,
                'status' => $order->status->value,
                'status_label' => $order->status->label(),
                'payment_status' => $order->payment_status->value,
                'payment_status_label' => $order->payment_status->label(),
                'payment_method' => $method?->name ?? strtoupper((string) $order->payment_method),
                'placed_at' => $order->placed_at?->toIso8601String(),
                'paid_at' => $order->paid_at?->toIso8601String(),
                'customer_note' => $order->customer_note,
            ],
            'customer' => [
                'name' => $order->user?->name,
                'email' => $order->user?->email,
                'phone' => $order->user?->phone,
            ],
            'shipping' => [
                'name' => $order->shipping_address['recipient_name'] ?? null,
                'phone' => $order->shipping_address['phone'] ?? null,
                'address' => $order->shipping_address['street_address'] ?? null,
                'area' => $order->shipping_address['area'] ?? null,
                'district' => $order->shipping_address['district'] ?? null,
                'division' => $order->shipping_address['division'] ?? null,
                'postcode' => $order->shipping_address['postcode'] ?? null,
            ],
            'items' => $items,
            'totals' => [
                'subtotal' => $order->subtotal,
                'discount' => $order->discount_total,
                'shipping' => $order->shipping_total,
                'tax' => $order->tax_total,
                'payment_fee' => $order->payment_fee,
                'grand_total' => $order->grand_total,
                'coupon_code' => $order->coupon_code,
                'formatted_grand_total' => '৳'.Money::of($order->grand_total),
            ],
            'payment' => [
                'method' => $method?->name ?? strtoupper((string) $order->payment_method),
                'reference' => $transaction?->provider_ref,
                'transaction_status' => $transaction?->status,
                'paid_at' => $transaction?->collected_at?->toIso8601String() ?? $order->paid_at?->toIso8601String(),
            ],
        ];
    }

    private function nextNumber(): string
    {
        do {
            $number = 'RCPT-'.now()->format('ymd').'-'.strtoupper(Str::random(6));
        } while (Receipt::where('receipt_number', $number)->exists());

        return $number;
    }
}
