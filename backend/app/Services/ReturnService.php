<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Enums\ReturnStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Refund;
use App\Models\ReturnRequest;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ReturnService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly NotificationService $notifications,
        private readonly AuditService $audit,
        private readonly WebhookService $webhooks,
        private readonly ReceiptService $receipts,
    ) {}

    public function request(Order $order, OrderItem $item, int $quantity, string $reason, ?string $description, User $customer): ReturnRequest
    {
        if ($order->user_id !== $customer->id) {
            throw ValidationException::withMessages(['order' => 'You do not own this order.']);
        }
        if (! in_array($order->status, [OrderStatus::Delivered, OrderStatus::Completed], true)) {
            throw ValidationException::withMessages(['order' => 'Returns can only be requested for delivered orders.']);
        }
        if ($item->order_id !== $order->id) {
            throw ValidationException::withMessages(['order_item_id' => 'This item does not belong to the selected order.']);
        }
        if ($quantity < 1 || $quantity > $item->quantity) {
            throw ValidationException::withMessages(['quantity' => 'Invalid return quantity.']);
        }

        $already = ReturnRequest::where('order_item_id', $item->id)
            ->whereNotIn('status', [ReturnStatus::Rejected->value])
            ->sum('quantity');
        if ($already + $quantity > $item->quantity) {
            throw ValidationException::withMessages(['quantity' => 'The requested return quantity exceeds the purchased quantity.']);
        }

        $refundAmount = Money::of(((float) $item->line_total / max(1, $item->quantity)) * $quantity);

        $return = DB::transaction(function () use ($order, $item, $quantity, $reason, $description, $customer, $refundAmount) {
            $return = ReturnRequest::create([
                'return_number' => 'RET-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                'order_id' => $order->id,
                'seller_order_id' => $item->seller_order_id,
                'order_item_id' => $item->id,
                'user_id' => $customer->id,
                'quantity' => $quantity,
                'reason' => $reason,
                'description' => $description,
                'status' => ReturnStatus::Requested->value,
                'refund_amount' => $refundAmount,
            ]);

            $order->statusHistory()->create([
                'seller_order_id' => $item->seller_order_id,
                'from_status' => $order->status->value,
                'to_status' => 'return_requested',
                'actor_id' => $customer->id,
                'actor_type' => 'customer',
                'note' => 'Return requested: '.$reason,
            ]);

            $sellerOrder = $item->sellerOrder;
            if ($sellerOrder && $sellerOrder->status !== OrderStatus::ReturnRequested) {
                $sellerOrder->update(['status' => OrderStatus::ReturnRequested->value]);
            }

            $this->notifications->send($item->sellerOrder->seller_id, 'return.requested', 'New return request',
                "Return {$return->return_number} was requested for order {$order->order_number}.",
                "/seller/returns",
                ['return_number' => $return->return_number, 'order_number' => $order->order_number, 'reason' => $reason],
                'return_requested_seller');
            $this->notifications->send($customer->id, 'return.requested', 'Return request received',
                "We received your return request {$return->return_number}. The seller will review it.",
                "/account/orders/{$order->order_number}",
                ['return_number' => $return->return_number, 'order_number' => $order->order_number, 'reason' => $reason],
                'return_requested');
            $this->audit->log('return.requested', $return, [], ['order' => $order->order_number, 'quantity' => $quantity]);

            return $return;
        });

        $return->load('orderItem', 'order', 'sellerOrder');

        $this->webhooks->dispatch('return.requested', [
            'return_id' => $return->id,
            'return_number' => $return->return_number,
            'order_number' => $return->order?->order_number,
            'quantity' => $return->quantity,
            'reason' => $return->reason,
            'refund_amount' => $return->refund_amount,
        ]);

        return $return;
    }

    public function updateStatus(ReturnRequest $return, ReturnStatus $status, User $actor, ?string $note = null): ReturnRequest
    {
        $updated = DB::transaction(function () use ($return, $status, $actor, $note) {
            $return = ReturnRequest::whereKey($return->id)->lockForUpdate()->firstOrFail();
            $return->load('orderItem.variant', 'order', 'sellerOrder');

            if ($return->status === ReturnStatus::Completed) {
                throw ValidationException::withMessages(['status' => 'This return is already completed.']);
            }

            $allowed = match ($return->status) {
                ReturnStatus::Requested => [ReturnStatus::Approved, ReturnStatus::Rejected],
                ReturnStatus::Approved => [ReturnStatus::Received, ReturnStatus::Rejected],
                ReturnStatus::Received => [ReturnStatus::Refunded, ReturnStatus::Completed],
                ReturnStatus::Refunded => [ReturnStatus::Completed],
                default => [],
            };
            if (! in_array($status, $allowed, true)) {
                throw ValidationException::withMessages(['status' => 'Invalid return status transition.']);
            }

            if ($status === ReturnStatus::Received) {
                if ($return->orderItem?->variant) {
                    $this->inventory->restock(
                        $return->orderItem->variant,
                        $return->quantity,
                        'return_received',
                        $return->id,
                        $actor
                    );
                }
                $return->sellerOrder?->update(['status' => OrderStatus::Returned->value]);
            }

            $return->update([
                'status' => $status->value,
                'admin_note' => $note ?? $return->admin_note,
                'approved_by' => $actor->id,
                'approved_at' => in_array($status, [ReturnStatus::Approved, ReturnStatus::Rejected], true) ? now() : $return->approved_at,
                'received_at' => $status === ReturnStatus::Received ? now() : $return->received_at,
            ]);

            if ($status === ReturnStatus::Received) {
                $refund = Refund::create([
                    'return_request_id' => $return->id,
                    'order_id' => $return->order_id,
                    'amount' => $return->refund_amount,
                    'status' => 'pending',
                    'method' => 'manual',
                    'note' => 'Refund for return '.$return->return_number,
                ]);
                $this->notifications->send($return->user_id, 'return.received', 'Return received',
                    "Return {$return->return_number} was received. A refund is being processed.",
                    "/account/orders/{$return->order->order_number}",
                    ['return_number' => $return->return_number, 'order_number' => $return->order->order_number],
                    'return_received');
            }

            if (in_array($status, [ReturnStatus::Refunded, ReturnStatus::Completed], true)) {
                $refund = $return->refunds()->latest()->first();
                if ($refund) {
                    $refund->update(['status' => 'processed', 'processed_by' => $actor->id, 'processed_at' => now(), 'note' => $note]);
                }
                $refunded = (float) Refund::where('order_id', $return->order_id)->where('status', 'processed')->sum('amount');
                $order = $return->order;
                $order->update([
                    'payment_status' => $refunded >= (float) $order->grand_total
                        ? PaymentStatus::Refunded->value
                        : PaymentStatus::PartiallyRefunded->value,
                ]);
                $receipt = $this->receipts->forRefund($return, $refund);
                $this->notifications->send($return->user_id, 'refund.processed', 'Refund processed',
                    "A refund of ৳{$return->refund_amount} was processed for return {$return->return_number}.",
                    "/account/orders/{$order->order_number}",
                    [
                        'return_number' => $return->return_number,
                        'order_number' => $order->order_number,
                        'amount' => '৳'.$return->refund_amount,
                        'receipt_url' => $this->receipts->url($receipt),
                    ],
                    'refund_processed');
            }

            $this->notifications->send($return->user_id, 'return.status', 'Return update',
                "Return {$return->return_number} is now {$status->label()}.",
                "/account/orders/{$return->order->order_number}",
                ['return_number' => $return->return_number, 'order_number' => $return->order->order_number, 'status' => $status->label()],
                'return_status');
            $this->audit->log('return.status_changed', $return, [], ['status' => $status->value, 'note' => $note]);

            return $return->fresh(['orderItem', 'order', 'sellerOrder', 'refunds']);
        });

        $this->webhooks->dispatch('return.status_changed', [
            'return_id' => $updated->id,
            'return_number' => $updated->return_number,
            'order_number' => $updated->order?->order_number,
            'status' => $status->value,
            'note' => $note,
        ]);

        return $updated;
    }
}
