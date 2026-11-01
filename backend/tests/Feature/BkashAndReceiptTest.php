<?php

namespace Tests\Feature;

use App\Models\EmailMessage;
use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\PaymentTransaction;
use App\Models\Product;
use App\Models\Receipt;
use Database\Seeders\EmailSeeder;
use Database\Seeders\PaymentMethodSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class BkashAndReceiptTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(SettingsSeeder::class);
        $this->seed(EmailSeeder::class);
        $this->seed(PaymentMethodSeeder::class);
    }

    private function cartFor($customer, $variant): void
    {
        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
            ->assertOk();
    }

    private function configureBkash(): PaymentMethod
    {
        $method = PaymentMethod::where('code', 'bkash_online')->firstOrFail();
        $method->update([
            'enabled' => true,
            'config' => [
                'app_key' => 'test-app-key',
                'app_secret' => 'test-app-secret',
                'username' => 'test-user',
                'password' => 'test-password',
                'sandbox' => true,
            ],
        ]);

        return $method->fresh();
    }

    public function test_bkash_online_checkout_is_created_executed_and_receipted(): void
    {
        $this->configureBkash();

        Http::fake([
            '*/tokenized/checkout/token/grant' => Http::response(['id_token' => 'fake-id-token'], 200),
            '*/tokenized/checkout/create' => Http::response([
                'paymentID' => 'PAY-TEST-1001',
                'bkashURL' => 'https://sandbox.bka.sh/checkout/PAY-TEST-1001',
                'statusCode' => '0000',
            ], 200),
        ]);

        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: 1000, stock: 5);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();
        $this->cartFor($customer, $variant);

        $response = $this->actingAs($customer, 'sanctum')->postJson('/api/v1/checkout', [
            'address_id' => $address->id,
            'payment_method' => 'bkash_online',
            'idempotency_key' => 'bkash-online-test-0001',
        ])->assertCreated();

        $this->assertSame('https://sandbox.bka.sh/checkout/PAY-TEST-1001', $response->json('payment.redirect_url'));
        $order = Order::findOrFail($response->json('order.id'));

        $this->assertSame('unpaid', $order->payment_status->value);
        $this->assertDatabaseHas('payment_transactions', [
            'order_id' => $order->id,
            'method_code' => 'bkash_online',
            'status' => 'pending',
        ]);

        Http::fake([
            '*/tokenized/checkout/execute' => Http::response([
                'paymentID' => 'PAY-TEST-1001',
                'transactionStatus' => 'Completed',
                'amount' => $order->grand_total,
                'currency' => 'BDT',
                'trxID' => 'BKASH-TRX-1001',
                'merchantInvoiceNumber' => $order->order_number.'-123456',
            ], 200),
        ]);

        $callback = $this->get('/api/v1/payments/bkash/'.$order->order_number.'/callback?paymentID=PAY-TEST-1001&status=success');
        $callback->assertRedirect();
        $this->assertStringContainsString('payment=success', (string) $callback->headers->get('Location'));

        $order->refresh();
        $this->assertSame('paid', $order->payment_status->value);
        $this->assertNotNull($order->paid_at);

        $transaction = PaymentTransaction::where('order_id', $order->id)->latest('id')->firstOrFail();
        $this->assertSame('collected', $transaction->status);
        $this->assertSame('BKASH-TRX-1001', $transaction->provider_ref);

        $this->assertDatabaseHas('receipts', [
            'order_id' => $order->id,
            'type' => 'payment',
            'amount' => $order->grand_total,
        ]);
        $this->assertDatabaseHas('email_messages', [
            'event' => 'payment_collected',
            'to_email' => $customer->email,
        ]);
    }

    public function test_bkash_callback_with_a_wrong_amount_is_rejected(): void
    {
        $this->configureBkash();

        Http::fake([
            '*/tokenized/checkout/token/grant' => Http::response(['id_token' => 'fake-id-token'], 200),
            '*/tokenized/checkout/create' => Http::response([
                'paymentID' => 'PAY-TEST-2002',
                'bkashURL' => 'https://sandbox.bka.sh/checkout/PAY-TEST-2002',
            ], 200),
        ]);

        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: 1000, stock: 5);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();
        $this->cartFor($customer, $variant);

        $response = $this->actingAs($customer, 'sanctum')->postJson('/api/v1/checkout', [
            'address_id' => $address->id,
            'payment_method' => 'bkash_online',
            'idempotency_key' => 'bkash-online-test-0002',
        ])->assertCreated();

        $order = Order::findOrFail($response->json('order.id'));

        Http::fake([
            '*/tokenized/checkout/execute' => Http::response([
                'paymentID' => 'PAY-TEST-2002',
                'transactionStatus' => 'Completed',
                'amount' => '1.00',
                'currency' => 'BDT',
                'trxID' => 'BKASH-TRX-BAD',
                'merchantInvoiceNumber' => $order->order_number.'-123456',
            ], 200),
        ]);

        $callback = $this->get('/api/v1/payments/bkash/'.$order->order_number.'/callback?paymentID=PAY-TEST-2002&status=success');
        $callback->assertRedirect();
        $this->assertStringContainsString('payment=invalid', (string) $callback->headers->get('Location'));

        $this->assertSame('unpaid', $order->fresh()->payment_status->value);
        $this->assertSame(0, Receipt::where('order_id', $order->id)->where('type', 'payment')->count());
    }

    public function test_bkash_paybill_reference_is_accepted_for_manual_verification(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: 500, stock: 5);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();
        $this->cartFor($customer, $variant);

        $response = $this->actingAs($customer, 'sanctum')->postJson('/api/v1/checkout', [
            'address_id' => $address->id,
            'payment_method' => 'bkash_paybill',
            'sender_number' => '01712345678',
            'transaction_id' => 'PAYBILL-REF-7788',
            'idempotency_key' => 'bkash-paybill-test-0001',
        ])->assertCreated();

        $order = Order::findOrFail($response->json('order.id'));

        $this->assertSame('bkash_paybill', $order->payment_method);
        $this->assertSame('awaiting_verification', $order->payment_status->value);
        $this->assertSame('DEMO-BILLER', $response->json('order.payment.config.biller_id'));
        $this->assertDatabaseHas('payment_transactions', [
            'order_id' => $order->id,
            'method_code' => 'bkash_paybill',
            'status' => 'submitted',
            'provider_ref' => 'PAYBILL-REF-7788',
        ]);

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/orders/'.$order->order_number)
            ->assertOk()
            ->assertJsonPath('order.payment_transactions.0.method_name', 'bKash Pay Bill');

        $receipt = Receipt::where('order_id', $order->id)->where('type', 'order')->firstOrFail();

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/orders/'.$order->order_number.'/receipt')
            ->assertOk()
            ->assertJsonPath('receipt.receipt.number', $receipt->receipt_number);

        $this->getJson('/api/v1/receipts/'.$receipt->receipt_number.'?token='.$receipt->public_token)
            ->assertOk()
            ->assertJsonPath('receipt.order.number', $order->order_number)
            ->assertJsonPath('receipt.receipt.token', $receipt->public_token);

        $intruder = $this->makeUser('customer');
        $this->actingAs($intruder, 'sanctum')
            ->getJson('/api/v1/receipts/'.$receipt->receipt_number.'?token=wrong-token')
            ->assertNotFound();

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/receipts')
            ->assertOk()
            ->assertJsonPath('receipts.total', 1);
    }

    public function test_every_order_status_and_cancellation_sends_an_email(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], stock: 5);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant);
        $sellerOrder = \App\Models\SellerOrder::where('order_id', $order->id)->firstOrFail();
        $admin = $this->makeUser('admin');

        $this->advanceSellerOrder($sellerOrder, $admin, 'confirmed', 'processing', 'ready_to_ship', 'shipped', 'delivered');
        $this->advanceSellerOrder($sellerOrder->fresh(), $admin, 'completed');

        foreach (['order_placed', 'order_confirmed', 'order_processing', 'order_ready_to_ship', 'order_shipped', 'order_delivered', 'order_completed'] as $event) {
            $this->assertDatabaseHas('email_messages', ['event' => $event, 'to_email' => $customer->email]);
        }

        ['variant' => $variant2] = $this->makeVariant($seller['store'], stock: 5);
        $cancelled = $this->placeOrder($customer, $variant2);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/orders/'.$cancelled->order_number.'/cancel', ['reason' => 'Changed my mind after ordering.'])
            ->assertOk();

        $this->assertDatabaseHas('email_messages', [
            'event' => 'order_cancelled',
            'to_email' => $customer->email,
        ]);
    }

    public function test_admin_can_approve_a_product_without_sending_a_reason(): void
    {
        $seller = $this->makeSeller();
        $product = Product::create([
            'store_id' => $seller['store']->id,
            'category_id' => \App\Models\Category::firstOrCreate(['slug' => 'approval-test'], ['name' => 'Approval test', 'is_active' => true])->id,
            'name' => 'Pending product',
            'slug' => 'pending-product-'.uniqid(),
            'sku' => 'PEND-'.uniqid(),
            'short_description' => 'Pending approval',
            'description' => 'Pending approval product',
            'base_price' => 100,
            'status' => 'pending',
        ]);
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/products/'.$product->id.'/status', ['status' => 'approved'])
            ->assertOk()
            ->assertJsonPath('product.status', 'approved');

        $product->refresh();
        $this->assertSame('approved', $product->status->value);
        $this->assertSame($admin->id, $product->approved_by);

        $this->assertDatabaseHas('email_messages', [
            'event' => 'product_approved',
            'to_email' => $seller['user']->email,
        ]);
    }

    public function test_admin_can_reject_a_product_with_a_reason(): void
    {
        $seller = $this->makeSeller();
        $product = Product::create([
            'store_id' => $seller['store']->id,
            'category_id' => \App\Models\Category::firstOrCreate(['slug' => 'rejection-test'], ['name' => 'Rejection test', 'is_active' => true])->id,
            'name' => 'Rejected product',
            'slug' => 'rejected-product-'.uniqid(),
            'sku' => 'REJ-'.uniqid(),
            'short_description' => 'Rejected',
            'description' => 'Rejected product',
            'base_price' => 100,
            'status' => 'pending',
        ]);
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/products/'.$product->id.'/status', [
                'status' => 'rejected',
                'reason' => 'Images do not match the product description.',
            ])
            ->assertOk();

        $product->refresh();
        $this->assertSame('rejected', $product->status->value);
        $this->assertSame('Images do not match the product description.', $product->rejection_reason);

        $this->assertDatabaseHas('email_messages', [
            'event' => 'product_rejected',
            'to_email' => $seller['user']->email,
        ]);
    }
}
