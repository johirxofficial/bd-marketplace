<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Models\SellerOrder;
use App\Models\Shipment;
use App\Models\ShipmentTrackingEvent;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ShipmentService
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly NotificationService $notifications,
        private readonly AuditService $audit,
    ) {}

    public function create(SellerOrder $sellerOrder, array $data, User $actor): Shipment
    {
        if (! in_array($sellerOrder->status, [OrderStatus::Processing, OrderStatus::ReadyToShip], true)) {
            throw ValidationException::withMessages([
                'shipment' => 'A shipment can only be created after processing has started.',
            ]);
        }

        return DB::transaction(function () use ($sellerOrder, $data, $actor) {
            $sellerOrder->load('items', 'order');
            $shipment = Shipment::create([
                'seller_order_id' => $sellerOrder->id,
                'courier_name' => $data['courier_name'],
                'tracking_number' => $data['tracking_number'] ?? null,
                'status' => 'shipped',
                'shipped_at' => now(),
                'created_by' => $actor->id,
            ]);

            foreach ($sellerOrder->items as $item) {
                $shipment->items()->create(['order_item_id' => $item->id, 'quantity' => $item->quantity]);
            }

            $shipment->trackingEvents()->create([
                'status' => 'shipped',
                'location' => $data['location'] ?? 'Seller warehouse',
                'note' => $data['note'] ?? 'Parcel handed to '.$data['courier_name'],
                'happened_at' => now(),
                'created_by' => $actor->id,
            ]);

            $this->orders->transitionSellerOrder($sellerOrder, OrderStatus::Shipped, $actor, 'Shipment created with '.$data['courier_name']);

            $this->notifications->send(
                $sellerOrder->order->user_id,
                'shipment.created',
                'Your parcel is on the way',
                "Order {$sellerOrder->order->order_number} was shipped with {$data['courier_name']}.".($data['tracking_number'] ? " Tracking: {$data['tracking_number']}" : ''),
                "/account/orders/{$sellerOrder->order->order_number}"
            );
            $this->audit->log('shipment.created', $shipment, [], ['courier' => $data['courier_name'], 'tracking' => $data['tracking_number'] ?? null]);

            return $shipment->load('items', 'trackingEvents');
        });
    }

    public function addEvent(Shipment $shipment, array $data, User $actor): Shipment
    {
        return DB::transaction(function () use ($shipment, $data, $actor) {
            $shipment->load('sellerOrder.items.variant', 'sellerOrder.order');
            $event = $shipment->trackingEvents()->create([
                'status' => $data['status'],
                'location' => $data['location'] ?? null,
                'note' => $data['note'] ?? null,
                'happened_at' => $data['happened_at'] ?? now(),
                'created_by' => $actor->id,
            ]);

            $shipment->update(['status' => $data['status']]);

            if ($data['status'] === 'delivered') {
                $shipment->update(['delivered_at' => $data['happened_at'] ?? now()]);
                if ($shipment->sellerOrder->status === OrderStatus::Shipped) {
                    $this->orders->transitionSellerOrder(
                        $shipment->sellerOrder,
                        OrderStatus::Delivered,
                        $actor,
                        'Courier marked parcel delivered'
                    );
                }
                $this->notifications->send(
                    $shipment->sellerOrder->order->user_id,
                    'shipment.delivered',
                    'Parcel delivered',
                    "Order {$shipment->sellerOrder->order->order_number} was delivered. Please confirm receipt in your account.",
                    "/account/orders/{$shipment->sellerOrder->order->order_number}"
                );
            }

            $this->audit->log('shipment.event', $shipment, [], ['status' => $data['status'], 'location' => $data['location'] ?? null]);

            return $shipment->fresh(['trackingEvents']);
        });
    }
}
