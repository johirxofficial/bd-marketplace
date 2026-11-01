<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\SellerOrder;
use App\Services\AuditService;
use App\Services\CheckoutService;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminOrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orders,
        private readonly CheckoutService $checkout,
        private readonly AuditService $audit,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $orders = Order::with(['user:id,name,email', 'sellerOrders.store', 'items'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('payment_status'), fn ($q) => $q->where('payment_status', $request->string('payment_status')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($w) => $w->where('order_number', 'like', '%'.$request->string('search').'%')->orWhereHas('user', fn ($u) => $u->where('email', 'like', '%'.$request->string('search').'%'))))
            ->when($request->filled('from'), fn ($q) => $q->whereDate('placed_at', '>=', $request->date('from')))
            ->when($request->filled('to'), fn ($q) => $q->whereDate('placed_at', '<=', $request->date('to')))
            ->latest('placed_at')->paginate($request->integer('per_page', 15));

        return response()->json(['orders' => $orders->through(fn ($o) => [
            'id' => $o->id, 'order_number' => $o->order_number,
            'customer' => $o->user?->name, 'email' => $o->user?->email,
            'status' => $o->status->value, 'status_label' => $o->status->label(), 'status_tone' => $o->status->tone(),
            'payment_status' => $o->payment_status->value, 'payment_status_label' => $o->payment_status->label(),
            'grand_total' => $o->grand_total, 'items_count' => $o->items->sum('quantity'),
            'sellers' => $o->sellerOrders->pluck('store.name')->values(),
            'placed_at' => $o->placed_at?->toIso8601String(),
        ])]);
    }

    public function show(Order $order): JsonResponse
    {
        $order->load(['user:id,name,email,phone', 'sellerOrders.store', 'sellerOrders.items', 'sellerOrders.shipments.trackingEvents',
            'items', 'statusHistory.actor', 'paymentTransactions', 'returns', 'refunds', 'receipts']);

        return response()->json([
            'order' => new OrderResource($order),
            'admin_note' => $order->admin_note,
            'notes' => $order->statusHistory->whereNotNull('note')->take(20)->map(fn ($h) => [
                'note' => $h->note, 'actor' => $h->actor?->name, 'at' => $h->created_at?->toIso8601String(),
            ]),
        ]);
    }

    public function updateSellerOrderStatus(Request $request, SellerOrder $sellerOrder): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in([
                OrderStatus::Confirmed->value, OrderStatus::Processing->value, OrderStatus::ReadyToShip->value,
                OrderStatus::Shipped->value, OrderStatus::Delivered->value, OrderStatus::Completed->value,
            ])],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        $sellerOrder = $this->orders->transitionSellerOrder($sellerOrder, OrderStatus::from($data['status']), $request->user(), $data['note'] ?? 'Admin status update');

        return response()->json(['message' => 'Order status updated.', 'status' => $sellerOrder->status->value]);
    }

    public function markCodCollected(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['reference' => ['nullable', 'string', 'max:100']]);
        $order = $this->orders->markCodCollected($order, $request->user(), $data['reference'] ?? null);

        return response()->json(['message' => 'COD collection recorded.', 'order' => new OrderResource($order)]);
    }

    public function cancel(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:500']]);
        $order = $this->checkout->cancel($order, $request->user(), $data['reason']);

        return response()->json(['message' => 'Order cancelled and reserved stock released.', 'order' => new OrderResource($order)]);
    }

    public function addNote(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['note' => ['required', 'string', 'max:2000']]);
        $order->update(['admin_note' => $data['note']]);
        $softDeleted = $order->statusHistory()->create([
            'from_status' => $order->status->value,
            'to_status' => $order->status->value,
            'actor_id' => $request->user()->id,
            'actor_type' => 'staff',
            'note' => 'Admin note: '.$data['note'],
        ]);
        $this->audit->log('order.note_added', $order, [], ['note' => $data['note']]);

        return response()->json(['message' => 'Note saved.']);
    }
}
