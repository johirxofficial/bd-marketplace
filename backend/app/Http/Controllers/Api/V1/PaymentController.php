<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(private readonly PaymentService $payments) {}

    public function methods(): JsonResponse
    {
        return response()->json(['payment_methods' => $this->payments->publicMethods()]);
    }

    public function submit(Request $request, string $orderNumber): JsonResponse
    {
        $data = $request->validate([
            'sender_number' => ['nullable', 'string', 'max:20', 'regex:/^(?:\+?880|0)1[3-9]\d{8}$/'],
            'transaction_id' => ['required', 'string', 'min:4', 'max:100'],
        ]);

        $order = Order::where('order_number', $orderNumber)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        $this->payments->submitManual($order, $request->user(), $data);

        $order = $order->fresh($this->relations());

        return response()->json([
            'message' => 'Payment reference submitted. Our team will verify it shortly.',
            'order' => new OrderResource($order),
            'payment' => $this->payments->instructionsFor($order),
        ]);
    }

    public function retryHosted(Request $request, string $orderNumber): JsonResponse
    {
        $order = Order::where('order_number', $orderNumber)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        if (! $order->paymentMethod?->isHosted()) {
            return response()->json(['message' => 'This order does not use an online payment gateway.'], 422);
        }

        if ($order->payment_status->value === 'paid') {
            return response()->json(['message' => 'This order is already paid.'], 422);
        }

        $payment = $this->payments->startHosted($order);

        return response()->json(['message' => 'Redirecting to the payment gateway.', 'payment' => $payment]);
    }

    private function relations(): array
    {
        return app(\App\Services\CheckoutService::class)->orderRelations();
    }
}
