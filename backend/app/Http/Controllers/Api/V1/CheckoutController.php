<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\CheckoutRequest;
use App\Http\Resources\OrderResource;
use App\Models\Address;
use App\Models\Cart;
use App\Models\Coupon;
use App\Services\CheckoutService;
use App\Services\PricingService;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CheckoutController extends Controller
{
    public function __construct(
        private readonly PricingService $pricing,
        private readonly CheckoutService $checkout,
        private readonly \App\Services\PaymentService $payments,
    ) {}

    public function quote(Request $request): JsonResponse
    {
        $data = $request->validate([
            'address_id' => ['nullable', 'integer', 'exists:addresses,id'],
            'coupon_code' => ['nullable', 'string', 'max:40'],
            'payment_method' => ['nullable', 'string', 'max:40'],
        ]);

        $user = $request->user();
        $cart = $user->cart()->firstOrCreate([], ['status' => 'active']);
        $address = isset($data['address_id'])
            ? Address::where('user_id', $user->id)->find($data['address_id'])
            : $user->addresses()->where('is_default', true)->first() ?? $user->addresses()->first();
        if (! $address) {
            return response()->json([
                'quote' => null,
                'message' => 'Add a delivery address to see shipping and final totals.',
            ]);
        }

        $coupon = null;
        if (! empty($data['coupon_code'])) {
            $coupon = Coupon::whereRaw('UPPER(code) = ?', [strtoupper(trim($data['coupon_code']))])->first();
            if (! $coupon) {
                throw ValidationException::withMessages(['coupon' => 'This coupon code is not valid.']);
            }
        } elseif ($cart->coupon_id) {
            $coupon = $cart->coupon;
        }

        $quote = $this->pricing->quote($cart, $address, $coupon, $data['payment_method'] ?? 'cod');

        return response()->json(['quote' => $quote, 'payment_methods' => $this->paymentMethods()]);
    }

    public function store(CheckoutRequest $request): JsonResponse
    {
        $user = $request->user();

        $key = $request->header('Idempotency-Key') ?: $request->input('idempotency_key');
        if (strlen((string) $key) < 10) {
            throw ValidationException::withMessages(['idempotency_key' => 'A valid idempotency key is required.']);
        }
        $key = (string) $key;

        // Replays of the same submission must be safe even though the cart was cleared.
        if ($existing = \App\Models\Order::where('idempotency_key', $key)->where('user_id', $user->id)->first()) {
            return response()->json([
                'message' => 'This order was already placed.',
                'order' => new OrderResource($existing->load($this->checkout->orderRelations())),
            ], 200);
        }

        $address = Address::where('user_id', $user->id)->find($request->integer('address_id'));
        if (! $address) {
            throw ValidationException::withMessages(['address_id' => 'Select one of your saved delivery addresses.']);
        }

        $cart = $user->cart()->firstOrCreate([], ['status' => 'active']);
        if ($cart->items()->count() === 0) {
            throw ValidationException::withMessages(['cart' => 'Your cart is empty.']);
        }

        $coupon = null;
        if ($request->filled('coupon_code')) {
            $coupon = Coupon::whereRaw('UPPER(code) = ?', [strtoupper(trim((string) $request->input('coupon_code')))])->first();
            if (! $coupon) {
                throw ValidationException::withMessages(['coupon' => 'This coupon code is not valid.']);
            }
        } elseif ($cart->coupon_id) {
            $coupon = $cart->coupon;
        }

        $order = $this->checkout->placeOrder(
            $user,
            $cart,
            $address,
            $coupon,
            $key,
            $request->input('customer_note'),
            (string) $request->input('payment_method', 'cod'),
            [
                'sender_number' => $request->input('sender_number'),
                'transaction_id' => $request->input('transaction_id'),
            ],
        );

        $payment = $this->payments->instructionsFor($order);
        $paymentError = null;

        if (($order->paymentMethod?->isHosted() ?? false) && $order->payment_status->value !== 'paid') {
            try {
                $payment = array_merge($payment, $this->payments->startHosted($order));
            } catch (\Throwable $e) {
                $paymentError = $e instanceof \Illuminate\Validation\ValidationException
                    ? $e->validator->errors()->first('payment')
                    : 'The online payment gateway could not be started. You can retry from the order page.';
            }
        }

        return response()->json([
            'message' => $order->paymentMethod?->isCod() ?? true
                ? 'Order placed successfully. Pay cash when your parcel arrives.'
                : 'Order placed successfully. Complete the payment using the instructions below.',
            'order' => new OrderResource($order),
            'payment' => $payment,
            'payment_error' => $paymentError,
        ], 201);
    }

    private function paymentMethods(): array
    {
        return $this->payments->publicMethods();
    }
}
