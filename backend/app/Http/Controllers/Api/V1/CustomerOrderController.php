<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ReturnRequest as ReturnRequestForm;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\CheckoutService;
use App\Services\OrderService;
use App\Services\ReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerOrderController extends Controller
{
    public function __construct(
        private readonly CheckoutService $checkout,
        private readonly OrderService $orders,
        private readonly ReturnService $returns,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status' => ['nullable', 'string', 'max:40'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $orders = $request->user()->orders()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->with(['sellerOrders.store', 'items', 'returns', 'paymentTransactions', 'receipts'])
            ->latest('placed_at')
            ->paginate($request->integer('per_page', 10));

        return OrderResource::collection($orders)->response();
    }

    public function show(Request $request, string $orderNumber): JsonResponse
    {
        $order = Order::where('order_number', $orderNumber)
            ->where('user_id', $request->user()->id)
            ->with(['sellerOrders.store', 'sellerOrders.items', 'sellerOrders.shipments.trackingEvents',
                'items', 'statusHistory.actor', 'paymentTransactions', 'returns', 'receipts'])
            ->firstOrFail();

        return response()->json(['order' => new OrderResource($order)]);
    }

    public function cancel(Request $request, string $orderNumber): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:500']]);
        $order = Order::where('order_number', $orderNumber)->where('user_id', $request->user()->id)->firstOrFail();
        $order = $this->checkout->cancel($order, $request->user(), $data['reason']);

        return response()->json(['message' => 'Order cancelled.', 'order' => new OrderResource($order)]);
    }

    public function confirmReceipt(Request $request, string $orderNumber): JsonResponse
    {
        $order = Order::where('order_number', $orderNumber)->where('user_id', $request->user()->id)->firstOrFail();
        $order = $this->orders->confirmReceipt($order, $request->user());

        return response()->json(['message' => 'Receipt confirmed. Thank you!', 'order' => new OrderResource($order->load(['sellerOrders.store', 'items']))]);
    }

    public function requestReturn(ReturnRequestForm $request, string $orderNumber): JsonResponse
    {
        $order = Order::where('order_number', $orderNumber)->where('user_id', $request->user()->id)->firstOrFail();
        $item = OrderItem::findOrFail($request->integer('order_item_id'));
        $return = $this->returns->request(
            $order,
            $item,
            $request->integer('quantity'),
            $request->string('reason')->value(),
            $request->input('description'),
            $request->user()
        );

        return response()->json([
            'message' => 'Return request submitted.',
            'return' => [
                'id' => $return->id,
                'return_number' => $return->return_number,
                'status' => $return->status->value,
                'refund_amount' => $return->refund_amount,
            ],
        ], 201);
    }

    public function tracking(Request $request, string $orderNumber): JsonResponse
    {
        $order = Order::where('order_number', $orderNumber)
            ->where('user_id', $request->user()->id)
            ->with(['sellerOrders.store', 'sellerOrders.shipments.trackingEvents'])
            ->firstOrFail();

        return response()->json([
            'order' => new OrderResource($order),
            'tracking' => $order->sellerOrders->flatMap(fn ($so) => $so->shipments->map(fn ($s) => [
                'store' => $so->store->name,
                'courier_name' => $s->courier_name,
                'tracking_number' => $s->tracking_number,
                'status' => $s->status,
                'events' => $s->trackingEvents->map(fn ($e) => [
                    'status' => $e->status, 'location' => $e->location, 'note' => $e->note,
                    'happened_at' => $e->happened_at?->toIso8601String(),
                ]),
            ]))->values(),
        ]);
    }
}
