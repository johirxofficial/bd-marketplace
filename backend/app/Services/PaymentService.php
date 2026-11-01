<?php

namespace App\Services;

use App\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\PaymentTransaction;
use App\Models\User;
use App\Support\Money;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class PaymentService
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly NotificationService $notifications,
        private readonly SmsService $sms,
        private readonly WebhookService $webhooks,
        private readonly ReceiptService $receipts,
    ) {}

    /**
     * @return \Illuminate\Support\Collection<int, PaymentMethod>
     */
    public function methods(bool $onlyEnabled = true)
    {
        return PaymentMethod::query()
            ->when($onlyEnabled, fn ($q) => $q->where('enabled', true))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    public function resolve(string $code): PaymentMethod
    {
        $method = PaymentMethod::where('code', $code)->first();

        if (! $method) {
            throw ValidationException::withMessages(['payment_method' => 'The selected payment method is not available.']);
        }

        if (! $method->enabled) {
            throw ValidationException::withMessages(['payment_method' => 'The selected payment method is currently disabled.']);
        }

        if ($method->isHosted()) {
            $config = $method->config ?: [];
            $missing = $method->provider === 'bkash'
                ? (blank($config['app_key'] ?? null) || blank($config['app_secret'] ?? null)
                    || blank($config['username'] ?? null) || blank($config['password'] ?? null))
                : (blank($config['store_id'] ?? null) || blank($config['store_password'] ?? null));

            if ($missing) {
                throw ValidationException::withMessages(['payment_method' => 'Online payment is not configured yet. Please choose another method.']);
            }
        }

        if ($method->isManual() && blank($method->config['merchant_number'] ?? null) && blank($method->config['biller_id'] ?? null) && ! $method->isCod()) {
            throw ValidationException::withMessages(['payment_method' => 'This payment method has not been configured yet. Please choose another method.']);
        }

        return $method;
    }

    public function initialStatus(PaymentMethod $method): PaymentStatus
    {
        return $method->isCod() ? PaymentStatus::CodPending : PaymentStatus::Unpaid;
    }

    /**
     * Create the payment transaction attached to a freshly placed order.
     */
    public function createForOrder(Order $order, PaymentMethod $method, array $input = []): PaymentTransaction
    {
        $sender = $input['sender_number'] ?? null;
        $reference = $input['transaction_id'] ?? null;
        $submitted = $method->isManual() && $reference;

        $transaction = $order->paymentTransactions()->create([
            'provider' => $method->provider,
            'provider_ref' => $reference,
            'method_code' => $method->code,
            'type' => 'payment',
            'amount' => $order->grand_total,
            'status' => $submitted ? 'submitted' : 'pending',
            'submitted_at' => $submitted ? now() : null,
            'metadata' => [
                'method_name' => $method->name,
                'method_type' => $method->type,
                'merchant_number' => $method->publicConfig()['merchant_number'] ?? null,
                'sender_number' => $sender,
                'transaction_id' => $reference,
                'note' => $method->isCod() ? 'Awaiting cash collection on delivery' : 'Awaiting payment',
            ],
        ]);

        if ($submitted) {
            $order->update(['payment_status' => PaymentStatus::AwaitingVerification->value]);
        }

        return $transaction;
    }

    /**
     * Customer submits a mobile-wallet / QR transaction reference for manual verification.
     */
    public function submitManual(Order $order, User $customer, array $data): PaymentTransaction
    {
        if ($order->user_id !== $customer->id) {
            throw ValidationException::withMessages(['order' => 'You do not own this order.']);
        }

        $method = $order->paymentMethod ?: PaymentMethod::where('code', $order->payment_method)->first();

        if (! $method || ! $method->isManual()) {
            throw ValidationException::withMessages(['payment' => 'This order does not accept a manual payment reference.']);
        }

        if ($order->payment_status === PaymentStatus::Paid) {
            throw ValidationException::withMessages(['payment' => 'This order has already been paid.']);
        }

        if ($order->status->value === 'cancelled') {
            throw ValidationException::withMessages(['payment' => 'This order was cancelled.']);
        }

        $transaction = DB::transaction(function () use ($order, $customer, $data, $method) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();

            $transaction = $order->paymentTransactions()
                ->where('type', 'payment')
                ->whereIn('status', ['pending', 'submitted', 'failed'])
                ->latest()
                ->first();

            if (! $transaction) {
                $transaction = $order->paymentTransactions()->create([
                    'provider' => $method->provider,
                    'method_code' => $method->code,
                    'type' => 'payment',
                    'amount' => $order->grand_total,
                    'status' => 'submitted',
                ]);
            }

            $metadata = $transaction->metadata ?: [];
            $metadata['sender_number'] = $data['sender_number'] ?? $metadata['sender_number'] ?? null;
            $metadata['transaction_id'] = $data['transaction_id'];
            $metadata['submitted_at'] = now()->toIso8601String();
            $metadata['note'] = 'Customer submitted payment reference for verification';

            $transaction->update([
                'provider_ref' => $data['transaction_id'],
                'status' => 'submitted',
                'submitted_at' => now(),
                'metadata' => $metadata,
            ]);

            $order->update(['payment_status' => PaymentStatus::AwaitingVerification->value]);

            $order->statusHistory()->create([
                'from_status' => $order->status->value,
                'to_status' => $order->status->value,
                'actor_id' => $customer->id,
                'actor_type' => 'customer',
                'note' => "Payment reference submitted via {$method->name} ({$data['transaction_id']}).",
            ]);

            $this->audit->log('payment.submitted', $order, [], [
                'method' => $method->code,
                'amount' => $order->grand_total,
            ]);

            return $transaction->fresh();
        });

        $this->notifications->send(
            $customer->id,
            'payment.submitted',
            'Payment reference received',
            "We received your payment reference for order {$order->order_number}. Our team will verify it shortly.",
            "/account/orders/{$order->order_number}",
            [
                'order_number' => $order->order_number,
                'amount' => '৳'.Money::of($order->grand_total),
                'payment_method' => $method->name,
            ],
            'payment_submitted',
        );

        $this->webhooks->dispatch('payment.submitted', [
            'order_number' => $order->order_number,
            'amount' => $order->grand_total,
            'method' => $method->code,
        ]);

        return $transaction;
    }

    /**
     * Staff confirms that money was received. Marks the order as paid atomically.
     */
    public function verify(PaymentTransaction $transaction, User $admin, ?string $reference = null): PaymentTransaction
    {
        $transaction = DB::transaction(function () use ($transaction, $admin, $reference) {
            $transaction = PaymentTransaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();
            $order = Order::whereKey($transaction->order_id)->lockForUpdate()->firstOrFail();

            if ($transaction->status === 'collected') {
                throw ValidationException::withMessages(['payment' => 'This payment has already been verified.']);
            }

            if ($order->payment_status === PaymentStatus::Paid) {
                throw ValidationException::withMessages(['payment' => 'This order is already marked as paid.']);
            }

            if ($order->status->value === 'cancelled') {
                throw ValidationException::withMessages(['payment' => 'This order was cancelled.']);
            }

            $metadata = $transaction->metadata ?: [];
            $metadata['verified_at'] = now()->toIso8601String();
            $metadata['verified_by'] = $admin->id;
            $metadata['verification_reference'] = $reference;

            $transaction->update([
                'status' => 'collected',
                'provider_ref' => $reference ?: $transaction->provider_ref,
                'collected_by' => $admin->id,
                'collected_at' => now(),
                'metadata' => $metadata,
            ]);

            $order->update([
                'payment_status' => PaymentStatus::Paid->value,
                'paid_at' => now(),
            ]);

            $receipt = $this->receipts->forOrder($order->fresh(), 'payment', $transaction);

            $order->statusHistory()->create([
                'from_status' => $order->status->value,
                'to_status' => $order->status->value,
                'actor_id' => $admin->id,
                'actor_type' => 'staff',
                'note' => 'Payment verified via '.($metadata['method_name'] ?? $transaction->provider).($reference ? " (ref: {$reference})" : ''),
            ]);

            $this->notifications->send(
                $order->user_id,
                'payment.collected',
                'Payment confirmed',
                "Payment of ৳{$order->grand_total} for order {$order->order_number} has been confirmed.",
                "/account/orders/{$order->order_number}",
                [
                    'order_number' => $order->order_number,
                    'amount' => '৳'.Money::of($order->grand_total),
                    'payment_method' => $transaction->method_code ?: 'manual',
                    'receipt_url' => $this->receipts->url($receipt),
                ],
                'payment_collected',
            );

            $this->audit->log('payment.verified', $order, ['payment_status' => $order->getOriginal('payment_status')], [
                'payment_status' => PaymentStatus::Paid->value,
                'method' => $transaction->method_code,
                'amount' => $transaction->amount,
            ]);

            return $transaction->fresh();
        });

        $order = $transaction->order;

        $this->sms->sendEvent($order->user, 'payment_received', [
            'order_number' => $order->order_number,
            'amount' => Money::of($order->grand_total),
        ], $order);

        $this->webhooks->dispatch('payment.collected', [
            'order_number' => $order->order_number,
            'order_id' => $order->id,
            'amount' => $order->grand_total,
            'method' => $transaction->method_code,
            'reference' => $transaction->provider_ref,
        ]);

        return $transaction;
    }

    public function reject(PaymentTransaction $transaction, User $admin, string $reason): PaymentTransaction
    {
        $transaction = DB::transaction(function () use ($transaction, $admin, $reason) {
            $transaction = PaymentTransaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();
            $order = Order::whereKey($transaction->order_id)->lockForUpdate()->firstOrFail();

            if ($transaction->status === 'collected') {
                throw ValidationException::withMessages(['payment' => 'Verified payments cannot be rejected.']);
            }

            $metadata = $transaction->metadata ?: [];
            $metadata['rejection_reason'] = $reason;
            $metadata['rejected_at'] = now()->toIso8601String();
            $metadata['rejected_by'] = $admin->id;

            $transaction->update(['status' => 'failed', 'metadata' => $metadata]);
            $order->update(['payment_status' => PaymentStatus::Unpaid->value]);

            $order->statusHistory()->create([
                'from_status' => $order->status->value,
                'to_status' => $order->status->value,
                'actor_id' => $admin->id,
                'actor_type' => 'staff',
                'note' => "Payment reference rejected: {$reason}",
            ]);

            $this->notifications->send(
                $order->user_id,
                'payment.rejected',
                'Payment could not be verified',
                "We could not verify the payment for order {$order->order_number}. Reason: {$reason}",
                "/account/orders/{$order->order_number}",
                [
                    'order_number' => $order->order_number,
                    'reason' => $reason,
                    'payment_method' => $transaction->method_code ?: 'manual',
                ],
                'payment_rejected',
            );

            $this->audit->log('payment.rejected', $order, [], ['reason' => $reason, 'method' => $transaction->method_code]);

            return $transaction->fresh();
        });

        $order = $transaction->order;

        $this->sms->sendEvent($order->user, 'payment_rejected', [
            'order_number' => $order->order_number,
            'reason' => $reason,
        ], $order);

        $this->webhooks->dispatch('payment.rejected', [
            'order_number' => $order->order_number,
            'order_id' => $order->id,
            'reason' => $reason,
        ]);

        return $transaction;
    }

    public function publicMethods(): array
    {
        return $this->methods()->map(fn (PaymentMethod $method) => [
            'code' => $method->code,
            'name' => $method->name,
            'provider' => $method->provider,
            'type' => $method->type,
            'mode' => $method->mode,
            'description' => $method->description,
            'instructions' => $this->renderInstructions($method),
            'fee_amount' => Money::of($method->fee_amount),
            'fee_percent' => Money::of($method->fee_percent),
            'min_amount' => $method->min_amount !== null ? Money::of($method->min_amount) : null,
            'max_amount' => $method->max_amount !== null ? Money::of($method->max_amount) : null,
            'requires_verification' => $method->isManual(),
            'config' => $method->publicConfig(),
        ])->values()->all();
    }

    public function renderInstructions(PaymentMethod $method, ?Order $order = null): ?string
    {
        if (! $method->instructions) {
            return null;
        }

        $config = $method->publicConfig();

        return str_replace(
            ['{merchant_number}', '{merchant_name}', '{account_type}', '{biller_id}', '{biller_name}', '{amount}', '{order_number}', '{reference}'],
            [
                $config['merchant_number'] ?? '',
                $config['merchant_name'] ?? '',
                $config['account_type'] ?? '',
                $config['biller_id'] ?? '',
                $config['biller_name'] ?? '',
                // Before an order exists (checkout), show neutral wording instead
                // of leaving holes like "Send  to 01700000001".
                $order ? Money::of($order->grand_total) : 'the order total',
                $order?->order_number ?? 'your order number',
                $order?->order_number ?? 'your order number',
            ],
            $method->instructions,
        );
    }

    /**
     * Customer-facing payment instructions for an order.
     */
    public function instructionsFor(Order $order): array
    {
        $method = $order->paymentMethod;
        $transaction = $order->paymentTransactions
            ? $order->paymentTransactions->sortByDesc('id')->first()
            : $order->paymentTransactions()->latest()->first();

        $data = [
            'code' => $order->payment_method,
            'name' => $method?->name ?? strtoupper($order->payment_method),
            'type' => $method?->type ?? ($order->payment_method === 'cod' ? 'cod' : 'mfs'),
            'instructions' => $method ? $this->renderInstructions($method, $order) : null,
            'config' => $method?->publicConfig() ?? [],
            'requires_verification' => (bool) ($method?->isManual() ?? false),
            'transaction' => $transaction ? [
                'id' => $transaction->id,
                'status' => $transaction->status,
                'reference' => $transaction->provider_ref,
                'submitted_at' => $transaction->submitted_at?->toIso8601String(),
                'metadata' => $transaction->metadata,
            ] : null,
            'qr_payload' => null,
        ];

        if ($method?->type === 'qr' && $order->payment_status !== PaymentStatus::Paid) {
            $data['qr_payload'] = $this->qrPayload($method, $order);
        }

        return $data;
    }

    /**
     * Build an EMVCo-style merchant-presented QR string. Confirm the exact
     * Bank/PSP requirements before enabling this in production.
     */
    public function qrPayload(PaymentMethod $method, Order $order): string
    {
        $config = $method->publicConfig();
        $name = substr($config['qr_merchant_name'] ?? $config['merchant_name'] ?? 'BD Marketplace', 0, 25);
        $city = substr($config['qr_merchant_city'] ?? 'Dhaka', 0, 15);
        $account = $config['merchant_number'] ?? '';
        $amount = Money::of($order->grand_total);
        $reference = $order->order_number;

        $merchantAccount = $this->emv('00', 'bd.banglaqr')
            .$this->emv('01', $account)
            .$this->emv('02', $reference);

        $payload = $this->emv('00', '01')
            .$this->emv('01', '12')
            .$this->emv('26', $merchantAccount)
            .$this->emv('52', '5999')
            .$this->emv('53', '050')
            .$this->emv('54', $amount)
            .$this->emv('58', 'BD')
            .$this->emv('59', $name)
            .$this->emv('60', $city)
            .$this->emv('62', $this->emv('01', $reference));

        return $payload.'6304'.$this->crc16($payload.'6304');
    }

    /**
     * Start a hosted checkout (SSLCommerz). Returns the redirect URL.
     */
    public function startHosted(Order $order, ?PaymentMethod $method = null): array
    {
        $method ??= $order->paymentMethod;

        if (! $method || ! $method->isHosted()) {
            throw ValidationException::withMessages(['payment_method' => 'This order does not use a hosted payment gateway.']);
        }

        $config = $method->config ?: [];

        $transaction = $order->paymentTransactions()->where('type', 'payment')->latest()->first()
            ?? $this->createForOrder($order, $method);

        if ($method->provider === 'bkash') {
            return $this->startBkash($order, $method, $transaction);
        }

        $storeId = $config['store_id'] ?? null;
        $password = $config['store_password'] ?? null;

        if (! $storeId || ! $password) {
            throw ValidationException::withMessages(['payment_method' => 'Online payment credentials are not configured.']);
        }

        $base = rtrim(config('app.url'), '/');
        $tranId = $order->order_number.'-'.substr((string) now()->timestamp, -6);
        $payload = [
            'store_id' => $storeId,
            'store_passwd' => $password,
            'total_amount' => Money::of($order->grand_total),
            'currency' => 'BDT',
            'tran_id' => $tranId,
            'success_url' => $base.'/api/v1/payments/sslcommerz/'.$order->order_number.'/success',
            'fail_url' => $base.'/api/v1/payments/sslcommerz/'.$order->order_number.'/fail',
            'cancel_url' => $base.'/api/v1/payments/sslcommerz/'.$order->order_number.'/cancel',
            'ipn_url' => $base.'/api/v1/payments/sslcommerz/'.$order->order_number.'/ipn',
            'cus_name' => $order->shipping_address['recipient_name'] ?? $order->user?->name ?? 'Customer',
            'cus_email' => $order->user?->email ?? 'customer@example.test',
            'cus_phone' => $order->shipping_address['phone'] ?? $order->user?->phone ?? '01700000000',
            'cus_add1' => $order->shipping_address['street_address'] ?? 'Dhaka',
            'cus_city' => $order->shipping_address['district'] ?? 'Dhaka',
            'cus_country' => 'Bangladesh',
            'shipping_method' => 'NO',
            'product_name' => 'Marketplace order '.$order->order_number,
            'product_category' => 'General',
            'product_profile' => 'general',
            'num_of_item' => $order->items()->sum('quantity'),
        ];

        $sandbox = ($config['sandbox'] ?? true) !== false;
        $endpoint = $sandbox
            ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
            : 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';

        $response = Http::asForm()->acceptJson()->timeout(20)->post($endpoint, $payload);
        $body = $response->json() ?: [];

        $metadata = $transaction->metadata ?: [];
        $metadata['hosted'] = [
            'tran_id' => $tranId,
            'sessionkey' => $body['sessionkey'] ?? null,
            'sandbox' => $sandbox,
            'initiated_at' => now()->toIso8601String(),
        ];
        $transaction->update(['metadata' => $metadata]);

        if (! $response->successful() || empty($body['GatewayPageURL'])) {
            Log::warning('SSLCommerz initiation failed', ['order' => $order->order_number, 'response' => $body]);

            throw ValidationException::withMessages([
                'payment' => 'The online payment gateway did not respond correctly. Please retry or choose another method.',
            ]);
        }

        return [
            'redirect_url' => $body['GatewayPageURL'],
            'transaction_id' => $transaction->id,
            'tran_id' => $tranId,
        ];
    }

    public function handleHostedCallback(Request $request, string $orderNumber, string $result): string
    {
        $order = Order::where('order_number', $orderNumber)->firstOrFail();
        $method = $order->paymentMethod;
        $transaction = $order->paymentTransactions()->where('type', 'payment')->latest()->first();
        $frontend = rtrim(config('app.frontend_url', config('app.url')), '/')
            .'/account/orders/'.$order->order_number;

        if (! $method || ! $method->isHosted() || ! $transaction) {
            return $frontend.'?payment=invalid';
        }

        if ($method->provider === 'bkash') {
            return $this->handleBkashCallback($request, $order, $method, $transaction, $result);
        }

        if (in_array($result, ['fail', 'cancel'], true)) {
            $metadata = $transaction->metadata ?: [];
            $metadata['callback'] = ['result' => $result, 'at' => now()->toIso8601String(), 'payload' => $request->all()];
            $transaction->update(['metadata' => $metadata]);

            return $frontend.'?payment='.$result;
        }

        $valId = $request->input('val_id');
        if (! $valId) {
            return $frontend.'?payment=invalid';
        }

        $config = $method->config ?: [];
        $sandbox = ($config['sandbox'] ?? true) !== false;
        $endpoint = $sandbox
            ? 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'
            : 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php';

        try {
            $response = Http::timeout(20)->get($endpoint, [
                'val_id' => $valId,
                'store_id' => $config['store_id'] ?? '',
                'store_passwd' => $config['store_password'] ?? '',
                'format' => 'json',
            ]);
        } catch (\Throwable $e) {
            Log::error('SSLCommerz validation request failed', ['order' => $order->order_number, 'error' => $e->getMessage()]);

            return $frontend.'?payment=invalid';
        }

        $body = $response->json() ?: [];
        $status = strtoupper((string) ($body['status'] ?? ''));
        $amount = isset($body['amount']) ? Money::of($body['amount']) : null;
        $tranId = (string) ($body['tran_id'] ?? '');

        if (! $response->successful() || ! in_array($status, ['VALID', 'VALIDATED'], true) || ! $amount
            || bccomp($amount, Money::of($order->grand_total), 2) !== 0
            || ($tranId !== '' && ! str_starts_with($tranId, $order->order_number))) {
            Log::warning('SSLCommerz validation rejected', ['order' => $order->order_number, 'response' => $body]);

            return $frontend.'?payment=invalid';
        }

        DB::transaction(function () use ($order, $transaction, $valId, $body) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $transaction = PaymentTransaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();

            if ($transaction->status === 'collected') {
                return;
            }

            $metadata = $transaction->metadata ?: [];
            $metadata['callback'] = ['result' => 'success', 'at' => now()->toIso8601String(), 'validation' => $body];
            $metadata['verified_at'] = now()->toIso8601String();

            $transaction->update([
                'status' => 'collected',
                'provider_ref' => $valId,
                'collected_at' => now(),
                'metadata' => $metadata,
            ]);

            $order->update([
                'payment_status' => PaymentStatus::Paid->value,
                'paid_at' => now(),
            ]);

            $receipt = $this->receipts->forOrder($order->fresh(), 'payment', $transaction);

            $order->statusHistory()->create([
                'from_status' => $order->status->value,
                'to_status' => $order->status->value,
                'actor_id' => null,
                'actor_type' => 'system',
                'note' => 'Online payment confirmed by gateway ('.$valId.')',
            ]);

            $this->notifications->send(
                $order->user_id,
                'payment.collected',
                'Payment confirmed',
                "Your online payment of ৳{$order->grand_total} for order {$order->order_number} was confirmed.",
                "/account/orders/{$order->order_number}",
                [
                    'order_number' => $order->order_number,
                    'amount' => '৳'.Money::of($order->grand_total),
                    'payment_method' => $method->name,
                    'receipt_url' => $this->receipts->url($receipt),
                ],
                'payment_collected',
            );

            $this->audit->log('payment.gateway_confirmed', $order, [], [
                'payment_status' => PaymentStatus::Paid->value,
                'reference' => $valId,
            ]);
        });

        $this->sms->sendEvent($order->user, 'payment_received', [
            'order_number' => $order->order_number,
            'amount' => Money::of($order->grand_total),
        ], $order);

        $this->webhooks->dispatch('payment.collected', [
            'order_number' => $order->order_number,
            'order_id' => $order->id,
            'amount' => $order->grand_total,
            'method' => $method->code,
            'reference' => $valId,
        ]);

        return $frontend.'?payment=success';
    }

    private function startBkash(Order $order, PaymentMethod $method, PaymentTransaction $transaction): array
    {
        $config = $method->config ?: [];
        $this->assertBkashConfigured($config);

        $tranId = $order->order_number.'-'.substr((string) now()->timestamp, -6);
        $callback = rtrim((string) config('app.url'), '/')
            .'/api/v1/payments/bkash/'.$order->order_number.'/callback';

        try {
            $body = $this->bkashPost($config, '/tokenized/checkout/create', [
                'mode' => '0011',
                'payerReference' => $order->user?->phone ?: $order->order_number,
                'callbackURL' => $callback,
                'amount' => Money::of($order->grand_total),
                'currency' => 'BDT',
                'intent' => 'sale',
                'merchantInvoiceNumber' => $tranId,
            ]);
        } catch (\Throwable $e) {
            Log::error('bKash create payment failed', ['order' => $order->order_number, 'error' => $e->getMessage()]);

            throw ValidationException::withMessages([
                'payment' => 'bKash did not respond correctly. Please retry or choose another payment method.',
            ]);
        }

        $metadata = $transaction->metadata ?: [];
        $metadata['hosted'] = [
            'provider' => 'bkash',
            'tran_id' => $tranId,
            'payment_id' => $body['paymentID'] ?? null,
            'sandbox' => ($config['sandbox'] ?? true) !== false,
            'initiated_at' => now()->toIso8601String(),
        ];
        $transaction->update(['metadata' => $metadata]);

        if (empty($body['bkashURL']) || empty($body['paymentID'])) {
            Log::warning('bKash create payment missing redirect', ['order' => $order->order_number, 'response' => $body]);

            throw ValidationException::withMessages([
                'payment' => 'bKash did not return a checkout URL. Please retry or choose another payment method.',
            ]);
        }

        return [
            'redirect_url' => $body['bkashURL'],
            'transaction_id' => $transaction->id,
            'tran_id' => $tranId,
            'payment_id' => $body['paymentID'],
        ];
    }

    private function handleBkashCallback(Request $request, Order $order, PaymentMethod $method, PaymentTransaction $transaction, string $result): string
    {
        $frontend = rtrim(config('app.frontend_url', config('app.url')), '/')
            .'/account/orders/'.$order->order_number;
        $paymentID = (string) ($request->input('paymentID') ?: $request->input('paymentId') ?: '');
        $status = strtolower((string) $request->input('status', ''));
        $metadata = $transaction->metadata ?: [];
        $storedPayment = (string) ($metadata['hosted']['payment_id'] ?? '');

        if ($paymentID === '' || ($storedPayment !== '' && ! hash_equals($storedPayment, $paymentID))) {
            Log::warning('bKash callback payment ID mismatch', ['order' => $order->order_number, 'payment_id' => $paymentID]);

            return $frontend.'?payment=invalid';
        }

        if (in_array($result, ['fail', 'cancel'], true) || in_array($status, ['cancel', 'cancelled', 'failure', 'failed'], true)) {
            $metadata['callback'] = ['result' => 'cancel', 'at' => now()->toIso8601String(), 'payload' => $request->all()];
            $transaction->update(['metadata' => $metadata]);

            return $frontend.'?payment=cancel';
        }

        try {
            $body = $this->bkashPost($method->config ?: [], '/tokenized/checkout/execute', ['paymentID' => $paymentID]);

            if (strtolower((string) ($body['transactionStatus'] ?? '')) !== 'completed') {
                $body = $this->bkashPost($method->config ?: [], '/tokenized/checkout/payment/status', ['paymentID' => $paymentID]);
            }
        } catch (\Throwable $e) {
            Log::error('bKash execute failed', ['order' => $order->order_number, 'error' => $e->getMessage()]);

            return $frontend.'?payment=invalid';
        }

        $amount = isset($body['amount']) ? Money::of($body['amount']) : null;
        $invoice = (string) ($body['merchantInvoiceNumber'] ?? '');
        $currency = strtoupper((string) ($body['currency'] ?? ''));

        if (strtolower((string) ($body['transactionStatus'] ?? '')) !== 'completed'
            || ! $amount
            || bccomp($amount, Money::of($order->grand_total), 2) !== 0
            || $currency !== 'BDT'
            || ($invoice !== '' && ! str_starts_with($invoice, $order->order_number))) {
            Log::warning('bKash payment validation rejected', ['order' => $order->order_number, 'response' => $body]);
            $metadata['callback'] = ['result' => 'invalid', 'at' => now()->toIso8601String(), 'response' => $body];
            $transaction->update(['metadata' => $metadata]);

            return $frontend.'?payment=invalid';
        }

        $reference = (string) ($body['trxID'] ?? $paymentID);

        DB::transaction(function () use ($order, $transaction, $body, $paymentID, $reference, $method) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $transaction = PaymentTransaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();

            if ($transaction->status === 'collected') {
                return;
            }

            $metadata = $transaction->metadata ?: [];
            $metadata['callback'] = ['result' => 'success', 'at' => now()->toIso8601String(), 'execution' => $body];
            $metadata['verified_at'] = now()->toIso8601String();
            $metadata['payment_id'] = $paymentID;

            $transaction->update([
                'status' => 'collected',
                'provider_ref' => $reference,
                'collected_at' => now(),
                'metadata' => $metadata,
            ]);

            $order->update([
                'payment_status' => PaymentStatus::Paid->value,
                'paid_at' => now(),
            ]);

            $receipt = $this->receipts->forOrder($order->fresh(), 'payment', $transaction);

            $order->statusHistory()->create([
                'from_status' => $order->status->value,
                'to_status' => $order->status->value,
                'actor_id' => null,
                'actor_type' => 'system',
                'note' => 'bKash payment confirmed ('.$reference.')',
            ]);

            $this->notifications->send(
                $order->user_id,
                'payment.collected',
                'Payment confirmed',
                "Your bKash payment of ৳{$order->grand_total} for order {$order->order_number} was confirmed.",
                "/account/orders/{$order->order_number}",
                [
                    'order_number' => $order->order_number,
                    'amount' => '৳'.Money::of($order->grand_total),
                    'payment_method' => $method->name,
                    'receipt_url' => $this->receipts->url($receipt),
                ],
                'payment_collected',
            );

            $this->audit->log('payment.bkash_confirmed', $order, [], [
                'payment_status' => PaymentStatus::Paid->value,
                'reference' => $reference,
            ]);
        });

        $this->sms->sendEvent($order->user, 'payment_received', [
            'order_number' => $order->order_number,
            'amount' => Money::of($order->grand_total),
        ], $order);

        $this->webhooks->dispatch('payment.collected', [
            'order_number' => $order->order_number,
            'order_id' => $order->id,
            'amount' => $order->grand_total,
            'method' => $method->code,
            'reference' => $reference,
        ]);

        return $frontend.'?payment=success';
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function assertBkashConfigured(array $config): void
    {
        if (blank($config['app_key'] ?? null) || blank($config['app_secret'] ?? null)
            || blank($config['username'] ?? null) || blank($config['password'] ?? null)) {
            throw ValidationException::withMessages([
                'payment_method' => 'bKash merchant credentials are not configured. Add the App Key, App Secret, Username and Password first.',
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function bkashBase(array $config): string
    {
        return ($config['sandbox'] ?? true) !== false
            ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
            : 'https://tokenized.pay.bka.sh/v1.2.0-beta';
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function bkashToken(array $config): string
    {
        $this->assertBkashConfigured($config);
        $cacheKey = 'bkash_token_'.md5(($config['app_key'] ?? '').'|'.(($config['sandbox'] ?? true) ? 'sandbox' : 'live'));

        return Cache::remember($cacheKey, 3000, function () use ($config) {
            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'username' => $config['username'],
                'password' => $config['password'],
            ])->timeout(20)->post($this->bkashBase($config).'/tokenized/checkout/token/grant', [
                'app_key' => $config['app_key'],
                'app_secret' => $config['app_secret'],
            ]);

            $body = $response->json() ?: [];

            if (! $response->successful() || empty($body['id_token'])) {
                throw new \RuntimeException('bKash token grant failed: '.($body['statusMessage'] ?? $response->status()));
            }

            return (string) $body['id_token'];
        });
    }

    /**
     * @param  array<string, mixed>  $config
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function bkashPost(array $config, string $path, array $payload): array
    {
        $token = $this->bkashToken($config);

        $response = Http::withHeaders([
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'Authorization' => $token,
            'X-APP-Key' => $config['app_key'],
        ])->timeout(20)->post($this->bkashBase($config).$path, $payload);

        $body = $response->json() ?: [];

        if (! $response->successful()) {
            throw new \RuntimeException('bKash API error: '.($body['statusMessage'] ?? $response->status()));
        }

        return $body;
    }

    private function emv(string $id, string $value): string
    {
        return $id.str_pad((string) strlen($value), 2, '0', STR_PAD_LEFT).$value;
    }

    private function crc16(string $payload): string
    {
        $crc = 0xFFFF;
        foreach (str_split($payload) as $char) {
            $crc ^= ord($char) << 8;
            for ($i = 0; $i < 8; $i++) {
                $crc = ($crc & 0x8000) ? (($crc << 1) ^ 0x1021) : ($crc << 1);
                $crc &= 0xFFFF;
            }
        }

        return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
    }
}
