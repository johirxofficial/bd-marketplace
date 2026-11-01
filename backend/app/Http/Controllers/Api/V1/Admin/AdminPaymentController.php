<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\PaymentMethod;
use App\Models\PaymentTransaction;
use App\Services\AuditService;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminPaymentController extends Controller
{
    public function __construct(
        private readonly PaymentService $payments,
        private readonly AuditService $audit,
    ) {}

    public function pending(Request $request): JsonResponse
    {
        $transactions = PaymentTransaction::with(['order.user:id,name,email,phone', 'order:id,order_number,grand_total,payment_status,status'])
            ->where('type', 'payment')
            ->whereIn('status', ['submitted', 'pending'])
            ->where('method_code', '!=', 'cod')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('method'), fn ($q) => $q->where('method_code', $request->string('method')))
            ->latest('submitted_at')
            ->latest('id')
            ->paginate(15);

        return response()->json([
            'payments' => $transactions->through(fn (PaymentTransaction $trx) => [
                'id' => $trx->id,
                'order_id' => $trx->order_id,
                'order_number' => $trx->order?->order_number,
                'customer' => $trx->order?->user?->name,
                'customer_phone' => $trx->order?->user?->phone,
                'method_code' => $trx->method_code,
                'method_name' => $trx->metadata['method_name'] ?? $trx->provider,
                'amount' => $trx->amount,
                'status' => $trx->status,
                'reference' => $trx->provider_ref,
                'sender_number' => $trx->metadata['sender_number'] ?? null,
                'submitted_at' => $trx->submitted_at?->toIso8601String(),
                'order_status' => $trx->order?->status?->value,
            ]),
        ]);
    }

    public function verify(Request $request, PaymentTransaction $transaction): JsonResponse
    {
        $data = $request->validate(['reference' => ['nullable', 'string', 'max:100']]);
        $transaction = $this->payments->verify($transaction, $request->user(), $data['reference'] ?? null);

        return response()->json([
            'message' => 'Payment verified and the order marked as paid.',
            'payment' => $this->serialize($transaction),
        ]);
    }

    public function reject(Request $request, PaymentTransaction $transaction): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:4', 'max:300']]);
        $transaction = $this->payments->reject($transaction, $request->user(), $data['reason']);

        return response()->json([
            'message' => 'Payment reference rejected. The customer was notified.',
            'payment' => $this->serialize($transaction),
        ]);
    }

    public function methods(): JsonResponse
    {
        return response()->json([
            'payment_methods' => PaymentMethod::orderBy('sort_order')->orderBy('name')->get()
                ->map(fn (PaymentMethod $method) => $this->serializeMethod($method)),
        ]);
    }

    public function updateMethod(Request $request, PaymentMethod $paymentMethod): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string', 'max:1000'],
            'instructions' => ['nullable', 'string', 'max:2000'],
            'enabled' => ['required', 'boolean'],
            'mode' => ['required', Rule::in(['manual', 'sandbox', 'live'])],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:999'],
            'fee_amount' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'fee_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'min_amount' => ['nullable', 'numeric', 'min:0'],
            'max_amount' => ['nullable', 'numeric', 'min:0'],
            'config' => ['nullable', 'array'],
            'logo_path' => ['nullable', 'string', 'max:255'],
        ]);

        $config = $data['config'] ?? [];
        $existing = $paymentMethod->config ?: [];

        // Blank secret fields keep the stored value instead of wiping it.
        foreach (['store_password', 'api_key', 'api_secret', 'app_secret', 'password'] as $secret) {
            if (array_key_exists($secret, $config) && blank($config[$secret]) && ! empty($existing[$secret])) {
                $config[$secret] = $existing[$secret];
            }
            if (array_key_exists($secret, $config) && blank($config[$secret])) {
                unset($config[$secret]);
            }
        }

        $merged = array_merge($existing, $config);
        unset($data['config']);

        $paymentMethod->update(array_merge($data, [
            'fee_amount' => $data['fee_amount'] ?? 0,
            'fee_percent' => $data['fee_percent'] ?? 0,
            'sort_order' => $data['sort_order'] ?? 0,
            'config' => $merged ?: null,
        ]));

        $this->audit->log('payment_method.updated', $paymentMethod, [], [
            'code' => $paymentMethod->code,
            'enabled' => $paymentMethod->enabled,
        ]);

        return response()->json([
            'message' => 'Payment method updated.',
            'payment_method' => $this->serializeMethod($paymentMethod->fresh()),
        ]);
    }

    private function serialize(PaymentTransaction $transaction): array
    {
        return [
            'id' => $transaction->id,
            'order_id' => $transaction->order_id,
            'status' => $transaction->status,
            'amount' => $transaction->amount,
            'reference' => $transaction->provider_ref,
            'collected_at' => $transaction->collected_at?->toIso8601String(),
            'metadata' => $transaction->metadata,
        ];
    }

    private function serializeMethod(PaymentMethod $method): array
    {
        $config = $method->config ?: [];
        $public = $config;
        foreach (['store_password', 'api_key', 'api_secret', 'app_secret', 'password'] as $secret) {
            if (! empty($public[$secret])) {
                $public[$secret] = '';
                $public['has_'.$secret] = true;
            }
        }

        return [
            'id' => $method->id,
            'code' => $method->code,
            'name' => $method->name,
            'provider' => $method->provider,
            'type' => $method->type,
            'mode' => $method->mode,
            'description' => $method->description,
            'instructions' => $method->instructions,
            'logo_path' => $method->logo_path,
            'enabled' => $method->enabled,
            'sort_order' => $method->sort_order,
            'fee_amount' => $method->fee_amount,
            'fee_percent' => $method->fee_percent,
            'min_amount' => $method->min_amount,
            'max_amount' => $method->max_amount,
            'config' => $public,
            'public_config' => $method->publicConfig(),
        ];
    }
}
