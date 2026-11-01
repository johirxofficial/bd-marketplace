<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\PaymentTransaction;
use App\Models\User;
use Database\Seeders\PaymentMethodSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class PaymentFlowTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(PaymentMethodSeeder::class);
    }

    /**
     * @return array{order: Order, customer: User, admin: User, transaction: PaymentTransaction}
     */
    private function manualOrder(string $method = 'bkash', array $overrides = []): array
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: 1000, stock: 5);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
            ->assertOk();

        $payload = array_merge([
            'address_id' => $address->id,
            'payment_method' => $method,
        ], $overrides);

        $response = $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/checkout', $payload, ['Idempotency-Key' => 'pay-'.uniqid('', true)])
            ->assertCreated();

        $order = Order::findOrFail($response->json('order.id'));
        $transaction = PaymentTransaction::where('order_id', $order->id)->latest('id')->firstOrFail();

        return [
            'order' => $order,
            'customer' => $customer,
            'admin' => $this->makeUser('admin'),
            'transaction' => $transaction,
        ];
    }

    public function test_manual_bkash_reference_is_submitted_then_verified_by_staff(): void
    {
        $context = $this->manualOrder('bkash', [
            'sender_number' => '01712345678',
            'transaction_id' => 'BKASH-TRX-9988',
        ]);

        $order = $context['order'];
        $transaction = $context['transaction'];

        $this->assertSame('awaiting_verification', $order->payment_status->value);
        $this->assertSame('bkash', $order->payment_method);
        $this->assertSame('submitted', $transaction->status);
        $this->assertSame('BKASH-TRX-9988', $transaction->provider_ref);
        $this->assertSame('01712345678', $transaction->metadata['sender_number']);

        $this->actingAs($context['admin'], 'sanctum')
            ->getJson('/api/v1/admin/payments/pending')
            ->assertOk()
            ->assertJsonFragment(['reference' => 'BKASH-TRX-9988', 'method_code' => 'bkash']);

        $this->actingAs($context['admin'], 'sanctum')
            ->postJson("/api/v1/admin/payments/{$transaction->id}/verify", ['reference' => 'VERIFIED-1'])
            ->assertOk();

        $order->refresh();
        $this->assertSame('paid', $order->payment_status->value);
        $this->assertNotNull($order->paid_at);
        $this->assertSame('collected', $transaction->fresh()->status);
        $this->assertSame($context['admin']->id, $transaction->fresh()->collected_by);
    }

    public function test_customer_can_submit_a_reference_after_placing_an_unpaid_manual_order(): void
    {
        $context = $this->manualOrder('nagad');

        $this->assertSame('unpaid', $context['order']->payment_status->value);
        $this->assertSame('pending', $context['transaction']->status);

        $this->actingAs($context['customer'], 'sanctum')
            ->postJson("/api/v1/orders/{$context['order']->order_number}/payment/submit", [
                'sender_number' => '01812345678',
                'transaction_id' => 'NAGAD-REF-4455',
            ])
            ->assertOk()
            ->assertJsonPath('order.payment_status', 'awaiting_verification');

        $this->assertSame('submitted', $context['transaction']->fresh()->status);
        $this->assertSame('NAGAD-REF-4455', $context['transaction']->fresh()->provider_ref);
    }

    public function test_a_rejected_reference_returns_the_order_to_unpaid(): void
    {
        $context = $this->manualOrder('rocket', ['transaction_id' => 'ROCKET-BAD-1']);

        $this->actingAs($context['admin'], 'sanctum')
            ->postJson("/api/v1/admin/payments/{$context['transaction']->id}/reject", [
                'reason' => 'Transaction ID was not found in the merchant statement.',
            ])
            ->assertOk();

        $this->assertSame('unpaid', $context['order']->fresh()->payment_status->value);
        $this->assertSame('failed', $context['transaction']->fresh()->status);
    }

    public function test_payment_method_fee_is_added_to_the_order_total(): void
    {
        PaymentMethod::where('code', 'bkash')->update(['fee_amount' => 20, 'fee_percent' => 1]);

        $context = $this->manualOrder('bkash', ['transaction_id' => 'FEE-REF-0001']);

        // 1000 product + 60 inside-Dhaka shipping = 1060; fee 20 + 1% = 30.60
        $this->assertSame('30.60', $context['order']->payment_fee);
        $this->assertSame('1090.60', $context['order']->grand_total);
        $this->assertSame('1000.00', $context['order']->subtotal);    }

    public function test_bangla_qr_returns_a_scan_payload_with_a_checksum(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: 1000, stock: 5);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
            ->assertOk();

        $response = $this->actingAs($customer, 'sanctum')->postJson('/api/v1/checkout', [
            'address_id' => $address->id,
            'payment_method' => 'banglaqr',
            'transaction_id' => 'QR-REF-0001',
        ], ['Idempotency-Key' => 'qr-checkout-0001'])->assertCreated();

        $payload = $response->json('payment.qr_payload');

        $this->assertIsString($payload);
        $this->assertStringStartsWith('000201', $payload);
        $this->assertMatchesRegularExpression('/6304[0-9A-F]{4}$/', $payload);
        $this->assertTrue($response->json('payment.requires_verification'));
        $this->assertSame('01700000004', $response->json('payment.config.merchant_number'));
    }

    public function test_disabled_online_method_cannot_be_selected(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store']);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
            ->assertOk();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/checkout', [
                'address_id' => $address->id,
                'payment_method' => 'online',
            ], ['Idempotency-Key' => 'online-disabled-0001'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment_method');

        $this->assertSame(0, Order::count());
    }

    public function test_customers_cannot_submit_payment_for_someone_elses_order(): void
    {
        $context = $this->manualOrder('bkash');
        $intruder = $this->makeUser('customer');

        $this->actingAs($intruder, 'sanctum')
            ->postJson("/api/v1/orders/{$context['order']->order_number}/payment/submit", [
                'transaction_id' => 'HIJACK-0001',
            ])
            ->assertNotFound();

        $this->assertSame('pending', $context['transaction']->fresh()->status);
    }

    public function test_manual_payments_require_payment_permission_to_verify(): void
    {
        $context = $this->manualOrder('bkash', ['transaction_id' => 'AUTH-REF-0001']);
        $customer = $context['customer'];

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/admin/payments/{$context['transaction']->id}/verify")
            ->assertForbidden();

        $this->assertSame('awaiting_verification', $context['order']->fresh()->payment_status->value);
    }
}
