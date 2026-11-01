<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\SellerOrder;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly NotificationService $notifications,
        private readonly AuditService $audit,
        private readonly SmsService $sms,
        private readonly WebhookService $webhooks,
        private readonly ReceiptService $receipts,
    ) {}

    public function transitionSellerOrder(SellerOrder $sellerOrder, OrderStatus $to, User $actor, ?string $note = null): SellerOrder
    {
        $previous = $sellerOrder->status;

        $result = DB::transaction(function () use ($sellerOrder, $to, $actor, $note) {
            $sellerOrder = SellerOrder::whereKey($sellerOrder->id)->lockForUpdate()->firstOrFail();
            $sellerOrder->load('order', 'items.variant');
            $from = $sellerOrder->status;

            if ($from === $to) {
                return $sellerOrder;
            }

            $this->assertTransitionAllowed($from, $to, $actor, $sellerOrder);

            if ($to === OrderStatus::Shipped) {
                foreach ($sellerOrder->items as $item) {
                    if ($item->variant) {
                        $this->inventory->commit($item->variant, $item->quantity, $sellerOrder->order, $actor);
                    }
                }
            }

            $sellerOrder->update(['status' => $to->value]);

            $sellerOrder->order->statusHistory()->create([
                'seller_order_id' => $sellerOrder->id,
                'from_status' => $from->value,
                'to_status' => $to->value,
                'actor_id' => $actor->id,
                'actor_type' => $actor->isStaff() ? 'staff' : ($actor->isSeller() ? 'seller' : 'customer'),
                'note' => $note,
            ]);

            if ($to === OrderStatus::Delivered) {
                $sellerOrder->commission?->update(['status' => 'earned']);
                $sellerOrder->order->update(['delivered_at' => $sellerOrder->order->delivered_at ?? now()]);
            }
            if ($to === OrderStatus::Completed) {
                $sellerOrder->order->update(['completed_at' => now()]);
            }
            if ($to === OrderStatus::Shipped) {
                $sellerOrder->order->update(['shipped_at' => $sellerOrder->order->shipped_at ?? now()]);
            }

            $this->syncOrderStatus($sellerOrder->order);

            $labels = [
                OrderStatus::Confirmed->value => 'confirmed',
                OrderStatus::Processing->value => 'being processed',
                OrderStatus::ReadyToShip->value => 'ready to ship',
                OrderStatus::Shipped->value => 'shipped',
                OrderStatus::Delivered->value => 'delivered',
                OrderStatus::Completed->value => 'completed',
            ];
            if (isset($labels[$to->value])) {
                $emailEvent = match ($to) {
                    OrderStatus::Confirmed => 'order_confirmed',
                    OrderStatus::Processing => 'order_processing',
                    OrderStatus::ReadyToShip => 'order_ready_to_ship',
                    OrderStatus::Shipped => 'order_shipped',
                    OrderStatus::Delivered => 'order_delivered',
                    OrderStatus::Completed => 'order_completed',
                    default => 'order_status',
                };
                $this->notifications->send(
                    $sellerOrder->order->user_id,
                    'order.status',
                    'Order update',
                    "Your order {$sellerOrder->order->order_number} is now {$labels[$to->value]}.",
                    "/account/orders/{$sellerOrder->order->order_number}",
                    [
                        'order_number' => $sellerOrder->order->order_number,
                        'status' => $to->label(),
                        'message' => "Order {$sellerOrder->order->order_number} is now {$labels[$to->value]}.",
                    ],
                    $emailEvent,
                );
            }

            $this->audit->log('seller_order.status_changed', $sellerOrder, ['status' => $from->value], ['status' => $to->value, 'note' => $note]);

            return $sellerOrder->fresh(['order', 'items', 'store']);
        });

        if ($previous !== $result->status) {
            $order = $result->order;
            $smsEvent = match ($result->status) {
                OrderStatus::Confirmed => 'order_confirmed',
                OrderStatus::Processing => 'order_processing',
                OrderStatus::Shipped => 'order_shipped',
                OrderStatus::Delivered => 'order_delivered',
                OrderStatus::Completed => 'order_completed',
                default => null,
            };

            if ($smsEvent) {
                $this->sms->sendEvent($order->user_id, $smsEvent, [
                    'order_number' => $order->order_number,
                    'status' => $result->status->label(),
                    'store_name' => $result->store?->name ?? '',
                ], $order);
            }

            $this->webhooks->dispatch('order.status_changed', [
                'order_number' => $order->order_number,
                'order_id' => $order->id,
                'seller_order_id' => $result->id,
                'status' => $result->status->value,
                'store' => $result->store?->name,
            ]);
        }

        return $result;
    }

    public function syncOrderStatus(Order $order): void
    {
        $order->load('sellerOrders');
        $sellerOrders = $order->sellerOrders;
        if ($sellerOrders->isEmpty()) {
            return;
        }

        $active = $sellerOrders->filter(fn ($so) => $so->status !== OrderStatus::Cancelled);
        if ($active->isEmpty()) {
            $order->update(['status' => OrderStatus::Cancelled->value, 'cancelled_at' => $order->cancelled_at ?? now()]);

            return;
        }

        $rank = [
            OrderStatus::PendingConfirmation->value => 1,
            OrderStatus::Confirmed->value => 2,
            OrderStatus::Processing->value => 3,
            OrderStatus::ReadyToShip->value => 4,
            OrderStatus::Shipped->value => 5,
            OrderStatus::Delivered->value => 6,
            OrderStatus::Completed->value => 7,
            OrderStatus::ReturnRequested->value => 6,
            OrderStatus::Returned->value => 7,
        ];
        $lowest = $active->sortBy(fn ($so) => $rank[$so->status->value] ?? 1)->first();
        $newStatus = $lowest->status;

        if ($active->every(fn ($so) => $so->status === OrderStatus::Completed)) {
            $newStatus = OrderStatus::Completed;
        } elseif ($active->every(fn ($so) => in_array($so->status, [OrderStatus::Delivered, OrderStatus::Completed], true))) {
            $newStatus = OrderStatus::Delivered;
        } elseif ($active->every(fn ($so) => in_array($so->status, [OrderStatus::Shipped, OrderStatus::Delivered, OrderStatus::Completed], true))) {
            $newStatus = OrderStatus::Shipped;
        }

        $order->update(['status' => $newStatus->value]);
    }

    public function markCodCollected(Order $order, User $actor, ?string $reference = null): Order
    {
        $order = DB::transaction(function () use ($order, $actor, $reference) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($order->payment_status === PaymentStatus::Paid) {
                throw ValidationException::withMessages(['payment' => 'This order is already marked as paid.']);
            }
            if (! in_array($order->status, [OrderStatus::Delivered, OrderStatus::Completed], true)) {
                throw ValidationException::withMessages(['payment' => 'COD can only be collected after successful delivery.']);
            }

            $order->update([
                'payment_status' => PaymentStatus::Paid->value,
                'paid_at' => now(),
            ]);
            $order->paymentTransactions()->create([
                'provider' => 'cod',
                'provider_ref' => $reference,
                'method_code' => 'cod',
                'type' => 'payment',
                'amount' => $order->grand_total,
                'status' => 'collected',
                'collected_by' => $actor->id,
                'collected_at' => now(),
            ]);

            $receipt = $this->receipts->forOrder($order->fresh(), 'payment', $order->paymentTransactions()->latest()->first());

            $order->statusHistory()->create([
                'from_status' => $order->status->value,
                'to_status' => $order->status->value,
                'actor_id' => $actor->id,
                'actor_type' => 'staff',
                'note' => 'COD payment collected'.($reference ? " (ref: {$reference})" : ''),
            ]);

            $this->notifications->send($order->user_id, 'payment.collected', 'Payment recorded',
                "Cash payment of ৳{$order->grand_total} was recorded for order {$order->order_number}.",
                "/account/orders/{$order->order_number}",
                [
                    'order_number' => $order->order_number,
                    'amount' => '৳'.Money::of($order->grand_total),
                    'payment_method' => 'Cash on Delivery',
                    'receipt_url' => $this->receipts->url($receipt),
                ],
                'payment_collected');
            $this->audit->log('order.cod_collected', $order, ['payment_status' => PaymentStatus::CodPending->value], ['payment_status' => PaymentStatus::Paid->value]);

            return $order->fresh(['paymentTransactions']);
        });

        $this->sms->sendEvent($order->user_id, 'payment_received', [
            'order_number' => $order->order_number,
            'amount' => Money::of($order->grand_total),
        ], $order);

        $this->webhooks->dispatch('payment.collected', [
            'order_number' => $order->order_number,
            'order_id' => $order->id,
            'amount' => $order->grand_total,
            'method' => 'cod',
            'reference' => $reference,
        ]);

        return $order;
    }

    public function confirmReceipt(Order $order, User $customer): Order
    {
        return DB::transaction(function () use ($order, $customer) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->user_id !== $customer->id) {
                throw ValidationException::withMessages(['order' => 'You do not own this order.']);
            }
            if ($order->status !== OrderStatus::Delivered) {
                throw ValidationException::withMessages(['order' => 'You can only confirm receipt of a delivered order.']);
            }

            $order->load('sellerOrders');
            foreach ($order->sellerOrders as $sellerOrder) {
                if ($sellerOrder->status === OrderStatus::Delivered) {
                    $this->transitionSellerOrder($sellerOrder, OrderStatus::Completed, $customer, 'Customer confirmed receipt');
                }
            }

            $order->update(['status' => OrderStatus::Completed->value, 'completed_at' => now()]);

            return $order->fresh();
        });
    }

    private function assertTransitionAllowed(OrderStatus $from, OrderStatus $to, User $actor, SellerOrder $sellerOrder): void
    {
        $forward = [
            OrderStatus::PendingConfirmation->value => [OrderStatus::Confirmed],
            OrderStatus::Confirmed->value => [OrderStatus::Processing],
            OrderStatus::Processing->value => [OrderStatus::ReadyToShip],
            OrderStatus::ReadyToShip->value => [OrderStatus::Shipped],
            OrderStatus::Shipped->value => [OrderStatus::Delivered],
            OrderStatus::Delivered->value => [OrderStatus::Completed],
        ];

        if (! in_array($to, $forward[$from->value] ?? [], true)) {
            throw ValidationException::withMessages([
                'status' => "An order cannot move from {$from->label()} to {$to->label()}.",
            ]);
        }

        if ($actor->isStaff()) {
            return;
        }

        if ($actor->isSeller()) {
            $ownsStore = $sellerOrder->store?->seller?->user_id === $actor->id;
            if (! $ownsStore || $to === OrderStatus::Completed) {
                throw ValidationException::withMessages(['status' => 'You are not authorized to make this order transition.']);
            }

            return;
        }

        if ($to === OrderStatus::Completed && $actor->id === $sellerOrder->order->user_id) {
            return;
        }

        throw ValidationException::withMessages(['status' => 'You are not authorized to make this order transition.']);
    }

}
