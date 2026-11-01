<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Models\Address;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PlatformSetting;
use App\Models\SellerOrder;
use App\Models\User;
use App\Plugins\Hook;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CheckoutService
{
    public function __construct(
        private readonly PricingService $pricing,
        private readonly InventoryService $inventory,
        private readonly AuditService $audit,
        private readonly NotificationService $notifications,
        private readonly PaymentService $payments,
        private readonly SmsService $sms,
        private readonly WebhookService $webhooks,
        private readonly ReceiptService $receipts,
    ) {}

    public function placeOrder(
        User $user,
        Cart $cart,
        Address $address,
        ?Coupon $coupon,
        ?string $idempotencyKey,
        ?string $note,
        string $paymentMethodCode = 'cod',
        array $paymentInput = [],
    ): Order {
        if ($paymentMethodCode === 'cod' && ! PlatformSetting::get('cod_enabled', true)) {
            throw ValidationException::withMessages(['payment_method' => 'Cash on Delivery is currently unavailable.']);
        }

        $method = $this->payments->resolve($paymentMethodCode);

        if ($idempotencyKey) {
            $existing = Order::where('idempotency_key', $idempotencyKey)->where('user_id', $user->id)->first();
            if ($existing) {
                return $existing->load($this->orderRelations());
            }
        }

        $created = false;

        try {
            $order = DB::transaction(function () use ($user, $cart, $address, $coupon, $idempotencyKey, $note, $method, $paymentInput, &$created) {
                $lockedCart = Cart::whereKey($cart->id)->lockForUpdate()->firstOrFail();
                $lockedCart->load(['items.variant.product.store.seller', 'items.product']);
                if ($lockedCart->items->isEmpty()) {
                    throw ValidationException::withMessages(['cart' => 'Your cart is empty.']);
                }

                $quote = $this->pricing->quote($lockedCart, $address, $coupon, $method->code);
                if ($quote['coupon_error']) {
                    throw ValidationException::withMessages(['coupon' => $quote['coupon_error']]);
                }
                if (empty($quote['items'])) {
                    throw ValidationException::withMessages(['cart' => 'No available items in your cart.']);
                }
                if (! $method->acceptsAmount($quote['grand_total'])) {
                    throw ValidationException::withMessages([
                        'payment_method' => 'This payment method is not available for the order total of ৳'.$quote['grand_total'].'.',
                    ]);
                }

                foreach (collect($quote['items'])->sortBy('variant_id') as $line) {
                    if ($line['quantity'] > $line['available_stock']) {
                        throw ValidationException::withMessages([
                            'cart' => "Only {$line['available_stock']} unit(s) of {$line['product_name']} are available.",
                        ]);
                    }
                }

                if ($coupon) {
                    $coupon = Coupon::whereKey($coupon->id)->lockForUpdate()->firstOrFail();
                    $this->pricing->validateCoupon($coupon, $lockedCart, $quote['subtotal']);
                }

                $order = Order::create([
                    'order_number' => $this->newOrderNumber(),
                    'user_id' => $user->id,
                    'status' => OrderStatus::PendingConfirmation->value,
                    'payment_status' => $this->payments->initialStatus($method)->value,
                    'payment_method' => $method->code,
                    'subtotal' => $quote['subtotal'],
                    'discount_total' => $quote['discount_total'],
                    'shipping_total' => $quote['shipping_total'],
                    'tax_total' => $quote['tax_total'],
                    'payment_fee' => $quote['payment_fee'],
                    'grand_total' => $quote['grand_total'],
                    'coupon_id' => $coupon?->id,
                    'coupon_code' => $coupon?->code,
                    'shipping_address' => $address->toSnapshot(),
                    'billing_address' => $address->toSnapshot(),
                    'customer_note' => $note,
                    'idempotency_key' => $idempotencyKey,
                    'placed_at' => now(),
                ]);

                $sellerGroups = collect($quote['stores'])->keyBy('store_id');
                $now = now();

                foreach ($sellerGroups as $storeId => $group) {
                    $firstLine = $group['items'][0];
                    $store = $lockedCart->items->firstWhere('product.store_id', $storeId)?->product?->store;
                    if (! $store || $store->status !== 'active' || $store->seller?->status !== 'approved') {
                        throw ValidationException::withMessages(['cart' => 'One of the sellers in your cart is not currently accepting orders.']);
                    }

                    $sellerOrder = SellerOrder::create([
                        'order_id' => $order->id,
                        'store_id' => $storeId,
                        'seller_id' => $store->seller->user_id,
                        'status' => OrderStatus::PendingConfirmation->value,
                        'subtotal' => $group['subtotal'],
                        'discount_total' => $group['discount_total'],
                        'shipping_total' => $group['shipping_total'],
                        'commission_rate' => $group['commission_rate'],
                        'commission_amount' => $group['commission_amount'],
                        'seller_payable' => $group['seller_payable'],
                    ]);

                    foreach ($group['items'] as $line) {
                        $variant = $lockedCart->items->firstWhere('variant_id', $line['variant_id'])->variant;
                        OrderItem::create([
                            'order_id' => $order->id,
                            'seller_order_id' => $sellerOrder->id,
                            'store_id' => $storeId,
                            'product_id' => $line['product_id'],
                            'variant_id' => $line['variant_id'],
                            'product_name' => $line['product_name'],
                            'variant_name' => $line['variant_name'],
                            'sku' => $line['sku'],
                            'unit_price' => $line['unit_price'],
                            'quantity' => $line['quantity'],
                            'discount_amount' => $line['discount_total'],
                            'line_total' => $line['line_total'],
                            'commission_rate' => $line['commission_rate'],
                            'commission_amount' => Money::percent($line['line_total'], $line['commission_rate']),
                            'product_snapshot' => [
                                'name' => $line['product_name'],
                                'variant' => $line['variant_name'],
                                'sku' => $line['sku'],
                                'image_url' => $line['image_url'],
                                'unit_price' => $line['unit_price'],
                                'store_name' => $line['store_name'],
                            ],
                        ]);

                        $this->inventory->reserve($variant, $line['quantity'], $order);
                    }

                    $sellerOrder->commission()->create([
                        'store_id' => $storeId,
                        'order_id' => $order->id,
                        'rate' => $group['commission_rate'],
                        'amount' => $group['commission_amount'],
                        'status' => 'pending',
                    ]);
                }

                $this->payments->createForOrder($order, $method, $paymentInput);
                $receipt = $this->receipts->forOrder($order);

                $noteText = match (true) {
                    $method->isCod() => 'Order placed with Cash on Delivery.',
                    $method->isManual() && ! empty($paymentInput['transaction_id']) => "Order placed with {$method->name}; payment reference submitted for verification.",
                    $method->isManual() => "Order placed with {$method->name}; payment verification pending.",
                    default => "Order placed with {$method->name}; awaiting online payment.",
                };

                $order->statusHistory()->create([
                    'from_status' => null,
                    'to_status' => OrderStatus::PendingConfirmation->value,
                    'actor_id' => $user->id,
                    'actor_type' => 'customer',
                    'note' => $noteText,
                ]);

                if ($coupon) {
                    $coupon->increment('used_count');
                }

                $lockedCart->items()->delete();
                $lockedCart->update(['coupon_id' => null]);

                $paymentNote = $method->isCod()
                    ? 'Payment: Cash on Delivery.'
                    : "Payment: {$method->name}.";

                $this->notifications->send(
                    $user, 'order.placed', 'Order placed',
                    "Your order {$order->order_number} has been placed. {$paymentNote}",
                    "/account/orders/{$order->order_number}",
                    [
                        'order_number' => $order->order_number,
                        'amount' => '৳'.Money::of($order->grand_total),
                        'payment_method' => $method->name,
                        'receipt_url' => $this->receipts->url($receipt),
                    ],
                    'order_placed',
                );

                foreach ($order->sellerOrders as $sellerOrder) {
                    $this->notifications->send(
                        $sellerOrder->seller_id, 'order.new', 'New order received',
                        "New order {$order->order_number} for {$sellerOrder->store->name}.",
                        "/seller/orders/{$sellerOrder->id}",
                        [
                            'order_number' => $order->order_number,
                            'amount' => '৳'.Money::of($order->grand_total),
                            'payment_method' => $method->name,
                        ],
                        'order_new_seller',
                    );
                }

                $this->audit->log('order.placed', $order, [], [
                    'order_number' => $order->order_number,
                    'grand_total' => $order->grand_total,
                    'payment_method' => $method->code,
                ]);

                $created = true;

                return $order->load($this->orderRelations());
            }, 3);
        } catch (\Illuminate\Database\QueryException $e) {
            if ($idempotencyKey && $this->isDuplicate($e)) {
                $existing = Order::where('idempotency_key', $idempotencyKey)->where('user_id', $user->id)->first();
                if ($existing) {
                    return $existing->load($this->orderRelations());
                }
            }
            throw $e;
        }

        if ($created) {
            Hook::doAction('order.placed', $order);

            $this->sms->sendEvent($order->user_id, 'order_placed', [
                'order_number' => $order->order_number,
                'amount' => Money::of($order->grand_total),
                'payment_method' => $method->name,
            ], $order);

            $this->webhooks->dispatch('order.placed', [
                'order_number' => $order->order_number,
                'order_id' => $order->id,
                'grand_total' => $order->grand_total,
                'payment_method' => $method->code,
                'items_count' => $order->items->sum('quantity'),
            ]);
        }

        return $order;
    }

    public function cancel(Order $order, User $actor, string $reason): Order
    {
        return DB::transaction(function () use ($order, $actor, $reason) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $order->load('sellerOrders.items.variant');

            if ($order->status === OrderStatus::Cancelled) {
                return $order;
            }

            $blocked = $order->sellerOrders->contains(fn (SellerOrder $so) => in_array($so->status, [
                OrderStatus::Shipped, OrderStatus::Delivered, OrderStatus::Completed,
                OrderStatus::ReturnRequested, OrderStatus::Returned,
            ], true));
            if ($blocked) {
                throw ValidationException::withMessages(['order' => 'This order can no longer be cancelled because at least one parcel has shipped.']);
            }

            foreach ($order->sellerOrders as $sellerOrder) {
                foreach ($sellerOrder->items as $item) {
                    if ($item->variant) {
                        $this->inventory->release($item->variant, $item->quantity, $order, $actor);
                    }
                }
                $sellerOrder->update(['status' => OrderStatus::Cancelled->value]);
                $sellerOrder->commission?->update(['status' => 'reversed']);
            }

            $order->update([
                'status' => OrderStatus::Cancelled->value,
                'cancelled_at' => now(),
                'cancel_reason' => $reason,
                'payment_status' => $order->payment_status === PaymentStatus::Paid
                    ? PaymentStatus::Refunded->value
                    : PaymentStatus::Failed->value,
            ]);

            if ($order->coupon_id) {
                Coupon::whereKey($order->coupon_id)->where('used_count', '>', 0)->decrement('used_count');
            }

            $order->statusHistory()->create([
                'from_status' => $order->getOriginal('status'),
                'to_status' => OrderStatus::Cancelled->value,
                'actor_id' => $actor->id,
                'actor_type' => $actor->isStaff() ? 'staff' : 'customer',
                'note' => $reason,
            ]);

            $this->notifications->send($order->user_id, 'order.cancelled', 'Order cancelled',
                "Order {$order->order_number} has been cancelled. Reason: {$reason}",
                "/account/orders/{$order->order_number}",
                ['order_number' => $order->order_number, 'reason' => $reason],
                'order_cancelled');
            foreach ($order->sellerOrders as $sellerOrder) {
                $this->notifications->send($sellerOrder->seller_id, 'order.cancelled', 'Order cancelled',
                    "Order {$order->order_number} was cancelled.", "/seller/orders/{$sellerOrder->id}",
                    ['order_number' => $order->order_number, 'reason' => $reason],
                    'order_cancelled');
            }

            $this->sms->sendEvent($order->user_id, 'order_cancelled', [
                'order_number' => $order->order_number,
                'reason' => $reason,
            ], $order);

            $this->webhooks->dispatch('order.status_changed', [
                'order_number' => $order->order_number,
                'order_id' => $order->id,
                'status' => OrderStatus::Cancelled->value,
                'reason' => $reason,
            ]);

            $this->audit->log('order.cancelled', $order, [], ['reason' => $reason]);

            return $order->fresh($this->orderRelations());
        });
    }

    public function newOrderNumber(): string
    {
        do {
            $number = 'BDP-'.now()->format('ymd').'-'.strtoupper(Str::random(6));
        } while (Order::where('order_number', $number)->exists());

        return $number;
    }

    public function orderRelations(): array
    {
        return [
            'items', 'sellerOrders.store', 'sellerOrders.items', 'sellerOrders.shipments.trackingEvents',
            'statusHistory.actor', 'paymentTransactions', 'paymentMethod', 'receipts',
        ];
    }

    private function isDuplicate(\Illuminate\Database\QueryException $e): bool
    {
        return in_array($e->getCode(), ['23000', '23505'], true) || str_contains($e->getMessage(), 'Duplicate entry');
    }
}
