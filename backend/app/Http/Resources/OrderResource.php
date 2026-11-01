<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'order_number' => $this->order_number,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'status_tone' => $this->status->tone(),
            'payment_status' => $this->payment_status->value,
            'payment_status_label' => $this->payment_status->label(),
            'payment_status_tone' => $this->payment_status->tone(),
            'payment_method' => $this->payment_method,
            'payment_method_name' => $this->paymentMethod?->name ?? strtoupper($this->payment_method),
            'payment_fee' => $this->payment_fee,
            'payment' => app(\App\Services\PaymentService::class)->instructionsFor($this->resource),
            'subtotal' => $this->subtotal,
            'discount_total' => $this->discount_total,
            'shipping_total' => $this->shipping_total,
            'tax_total' => $this->tax_total,
            'grand_total' => $this->grand_total,
            'coupon_code' => $this->coupon_code,
            'shipping_address' => $this->shipping_address,
            'customer_note' => $this->customer_note,
            'placed_at' => $this->placed_at?->toIso8601String(),
            'confirmed_at' => $this->confirmed_at?->toIso8601String(),
            'shipped_at' => $this->shipped_at?->toIso8601String(),
            'delivered_at' => $this->delivered_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'paid_at' => $this->paid_at?->toIso8601String(),
            'cancel_reason' => $this->cancel_reason,
            'customer' => $this->whenLoaded('user', fn () => [
                'id' => $this->user->id, 'name' => $this->user->name, 'email' => $this->user->email, 'phone' => $this->user->phone,
            ]),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'seller_order_id' => $item->seller_order_id,
                'product_id' => $item->product_id,
                'variant_id' => $item->variant_id,
                'product_name' => $item->product_name,
                'variant_name' => $item->variant_name,
                'sku' => $item->sku,
                'unit_price' => $item->unit_price,
                'quantity' => $item->quantity,
                'discount_amount' => $item->discount_amount,
                'line_total' => $item->line_total,
                'image_url' => $item->product_snapshot['image_url'] ?? null,
                'can_review' => in_array($this->status->value, ['delivered', 'completed'], true)
                    && ! \App\Models\Review::where('user_id', $this->user_id)->where('order_item_id', $item->id)->exists(),
                'return_requested' => $item->returnRequests()->exists(),
            ])),
            'seller_orders' => $this->whenLoaded('sellerOrders', fn () => $this->sellerOrders->map(fn ($so) => [
                'id' => $so->id,
                'store' => ['id' => $so->store->id, 'name' => $so->store->name],
                'status' => $so->status->value,
                'status_label' => $so->status->label(),
                'status_tone' => $so->status->tone(),
                'subtotal' => $so->subtotal,
                'discount_total' => $so->discount_total,
                'shipping_total' => $so->shipping_total,
                'commission_rate' => $so->commission_rate,
                'commission_amount' => $so->commission_amount,
                'seller_payable' => $so->seller_payable,
                'items' => $so->relationLoaded('items') ? $so->items->map(fn ($i) => [
                    'id' => $i->id, 'product_name' => $i->product_name, 'variant_name' => $i->variant_name,
                    'sku' => $i->sku, 'quantity' => $i->quantity, 'unit_price' => $i->unit_price,
                    'line_total' => $i->line_total, 'image_url' => $i->product_snapshot['image_url'] ?? null,
                ]) : [],
                'shipments' => $so->relationLoaded('shipments') ? $so->shipments->map(fn ($s) => [
                    'id' => $s->id, 'courier_name' => $s->courier_name, 'tracking_number' => $s->tracking_number,
                    'status' => $s->status, 'shipped_at' => $s->shipped_at?->toIso8601String(),
                    'delivered_at' => $s->delivered_at?->toIso8601String(),
                    'events' => $s->relationLoaded('trackingEvents') ? $s->trackingEvents->map(fn ($e) => [
                        'status' => $e->status, 'location' => $e->location, 'note' => $e->note,
                        'happened_at' => $e->happened_at?->toIso8601String(),
                    ]) : [],
                ]) : [],
            ])),
            'status_history' => $this->whenLoaded('statusHistory', fn () => $this->statusHistory->map(fn ($h) => [
                'from_status' => $h->from_status, 'to_status' => $h->to_status,
                'actor_type' => $h->actor_type, 'actor' => $h->actor?->name,
                'note' => $h->note, 'created_at' => $h->created_at?->toIso8601String(),
            ])),
            'returns' => $this->whenLoaded('returns', fn () => $this->returns->map(fn ($r) => [
                'id' => $r->id, 'return_number' => $r->return_number, 'status' => $r->status->value,
                'status_label' => $r->status->label(), 'quantity' => $r->quantity,
                'refund_amount' => $r->refund_amount, 'reason' => $r->reason,
                'created_at' => $r->created_at?->toIso8601String(),
            ])),
            'payment_transactions' => $this->whenLoaded('paymentTransactions', fn () => $this->paymentTransactions->map(fn ($p) => [
                'id' => $p->id, 'provider' => $p->provider, 'method_code' => $p->method_code,
                'method_name' => $p->metadata['method_name'] ?? $p->provider,
                'type' => $p->type, 'amount' => $p->amount,
                'status' => $p->status, 'collected_at' => $p->collected_at?->toIso8601String(),
                'submitted_at' => $p->submitted_at?->toIso8601String(),
                'reference' => $p->provider_ref,
            ])),
            'receipt' => $this->whenLoaded('receipts', function () {
                $receipt = $this->receipts->sortByDesc('id')->first();

                if (! $receipt) {
                    return null;
                }

                return [
                    'number' => $receipt->receipt_number,
                    'type' => $receipt->type,
                    'type_label' => $receipt->typeLabel(),
                    'amount' => $receipt->amount,
                    'currency' => $receipt->currency,
                    'issued_at' => $receipt->issued_at?->toIso8601String(),
                    'url' => app(\App\Services\ReceiptService::class)->url($receipt),
                ];
            }),
        ];
    }
}
