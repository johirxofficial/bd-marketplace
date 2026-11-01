<?php

namespace App\Http\Controllers\Api\V1\Seller;

use App\Enums\OrderStatus;
use App\Enums\ReturnStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ShipmentRequest;
use App\Http\Requests\TrackingEventRequest;
use App\Models\ReturnRequest;
use App\Models\SellerOrder;
use App\Models\Shipment;
use App\Services\OrderService;
use App\Services\ReturnService;
use App\Services\ShipmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SellerOrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly ShipmentService $shipments,
        private readonly ReturnService $returns,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $store = $this->store($request);
        $orders = SellerOrder::where('store_id', $store->id)
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('search'), fn ($q) => $q->whereHas('order', fn ($o) => $o->where('order_number', 'like', '%'.$request->string('search').'%')))
            ->with(['order.user:id,name,email,phone', 'items', 'shipments'])
            ->latest()->paginate(15);

        return response()->json(['orders' => $orders->through(fn ($so) => $this->summary($so))]);
    }

    public function show(Request $request, SellerOrder $sellerOrder): JsonResponse
    {
        $this->owner($request, $sellerOrder);
        $sellerOrder->load(['order.user:id,name,email,phone', 'items', 'shipments.trackingEvents', 'commission']);

        return response()->json(['order' => $this->detail($sellerOrder)]);
    }

    public function updateStatus(Request $request, SellerOrder $sellerOrder): JsonResponse
    {
        $this->owner($request, $sellerOrder);
        $data = $request->validate([
            'status' => ['required', Rule::in([
                OrderStatus::Confirmed->value,
                OrderStatus::Processing->value,
                OrderStatus::ReadyToShip->value,
                OrderStatus::Delivered->value,
            ])],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        if ($data['status'] === OrderStatus::Delivered->value) {
            return response()->json(['message' => 'Record delivery through a shipment tracking event so the customer can see tracking.'], 422);
        }

        $sellerOrder = $this->orders->transitionSellerOrder($sellerOrder, OrderStatus::from($data['status']), $request->user(), $data['note'] ?? null);

        return response()->json([
            'message' => 'Order status updated to '.$sellerOrder->status->label().'.',
            'order' => $this->summary($sellerOrder->load(['order.user', 'items', 'shipments'])),
        ]);
    }

    public function createShipment(ShipmentRequest $request, SellerOrder $sellerOrder): JsonResponse
    {
        $this->owner($request, $sellerOrder);
        $shipment = $this->shipments->create($sellerOrder, $request->validated(), $request->user());

        return response()->json(['message' => 'Shipment created and order marked shipped.', 'shipment' => $shipment], 201);
    }

    public function addTracking(TrackingEventRequest $request, Shipment $shipment): JsonResponse
    {
        abort_unless($shipment->sellerOrder->store_id === $this->store($request)->id, 403, 'You do not have access to this shipment.');
        $shipment = $this->shipments->addEvent($shipment, $request->validated(), $request->user());

        return response()->json(['message' => 'Tracking event recorded.', 'shipment' => $shipment]);
    }

    public function returns(Request $request): JsonResponse
    {
        $store = $this->store($request);
        $returns = ReturnRequest::whereHas('sellerOrder', fn ($q) => $q->where('store_id', $store->id))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->with(['order:id,order_number', 'orderItem:id,product_name,variant_name', 'user:id,name,email'])
            ->latest()->paginate(15);

        return response()->json(['returns' => $returns->through(fn ($r) => [
            'id' => $r->id, 'return_number' => $r->return_number, 'status' => $r->status->value,
            'status_label' => $r->status->label(), 'reason' => $r->reason, 'quantity' => $r->quantity,
            'refund_amount' => $r->refund_amount, 'order_number' => $r->order?->order_number,
            'product_name' => $r->orderItem?->product_name, 'variant_name' => $r->orderItem?->variant_name,
            'customer' => $r->user?->name, 'created_at' => $r->created_at?->toIso8601String(),
        ])]);
    }

    public function updateReturn(Request $request, ReturnRequest $return): JsonResponse
    {
        abort_unless($return->sellerOrder?->store_id === $this->store($request)->id, 403, 'You do not have access to this return.');
        $data = $request->validate([
            'status' => ['required', Rule::in([ReturnStatus::Approved->value, ReturnStatus::Rejected->value])],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $return = $this->returns->updateStatus($return, ReturnStatus::from($data['status']), $request->user(), $data['note'] ?? null);

        return response()->json(['message' => 'Return '.$return->status->label().'.', 'return' => $return]);
    }

    private function summary(SellerOrder $so): array
    {
        return [
            'id' => $so->id,
            'order_id' => $so->order_id,
            'order_number' => $so->order->order_number,
            'status' => $so->status->value,
            'status_label' => $so->status->label(),
            'status_tone' => $so->status->tone(),
            'customer' => $so->order->user?->name,
            'customer_phone' => $so->order->shipping_address['phone'] ?? null,
            'payment_status' => $so->order->payment_status->value,
            'items_count' => $so->items->sum('quantity'),
            'subtotal' => $so->subtotal,
            'discount_total' => $so->discount_total,
            'shipping_total' => $so->shipping_total,
            'commission_amount' => $so->commission_amount,
            'seller_payable' => $so->seller_payable,
            'placed_at' => $so->order->placed_at?->toIso8601String(),
            'shipment' => $so->shipments->first() ? [
                'id' => $so->shipments->first()->id,
                'courier_name' => $so->shipments->first()->courier_name,
                'tracking_number' => $so->shipments->first()->tracking_number,
                'status' => $so->shipments->first()->status,
            ] : null,
        ];
    }

    private function detail(SellerOrder $so): array
    {
        return array_merge($this->summary($so->setRelation('order', $so->order)), [
            'shipping_address' => $so->order->shipping_address,
            'customer_note' => $so->order->customer_note,
            'items' => $so->items->map(fn ($i) => [
                'id' => $i->id, 'product_name' => $i->product_name, 'variant_name' => $i->variant_name,
                'sku' => $i->sku, 'quantity' => $i->quantity, 'unit_price' => $i->unit_price,
                'line_total' => $i->line_total, 'image_url' => $i->product_snapshot['image_url'] ?? null,
            ]),
            'shipments' => $so->shipments->map(fn ($s) => [
                'id' => $s->id, 'courier_name' => $s->courier_name, 'tracking_number' => $s->tracking_number,
                'status' => $s->status, 'shipped_at' => $s->shipped_at?->toIso8601String(),
                'delivered_at' => $s->delivered_at?->toIso8601String(),
                'events' => $s->trackingEvents->map(fn ($e) => [
                    'status' => $e->status, 'location' => $e->location, 'note' => $e->note,
                    'happened_at' => $e->happened_at?->toIso8601String(),
                ]),
            ]),
            'commission' => $so->commission,
        ]);
    }

    private function store(Request $request)
    {
        $profile = $request->user()->sellerProfile;
        abort_unless($profile?->status === 'approved' && $profile->store?->status === 'active', 403, 'Your seller account is not active.');

        return $profile->store;
    }

    private function owner(Request $request, SellerOrder $sellerOrder): void
    {
        abort_unless($sellerOrder->store_id === $this->store($request)->id, 403, 'You do not have access to this order.');
    }
}
