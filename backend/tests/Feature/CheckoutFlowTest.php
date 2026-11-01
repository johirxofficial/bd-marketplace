<?php

namespace Tests\Feature;

use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\PlatformSetting;
use Database\Seeders\PaymentMethodSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class CheckoutFlowTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(PaymentMethodSeeder::class);
        PlatformSetting::updateOrCreate(
            ['key' => 'cod_enabled'],
            ['value' => '1', 'type' => 'boolean', 'group' => 'checkout', 'label' => 'COD enabled'],
        );
    }

    public function test_cod_checkout_creates_order_reserves_stock_and_splits_seller_payable(): void
    {
        $seller = $this->makeSeller();
        ['product' => $product, 'variant' => $variant] = $this->makeVariant($seller['store'], price: 1000, stock: 5);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 2])
            ->assertOk()
            ->assertJsonPath('cart.items.0.quantity', 2);

        $response = $this->actingAs($customer, 'sanctum')->postJson('/api/v1/checkout', [
            'address_id' => $address->id,
            'customer_note' => 'Please call before delivery.',
        ], ['Idempotency-Key' => 'checkout-happy-path-001']);

        $response->assertCreated()
            ->assertJsonPath('order.payment_method', 'cod')
            ->assertJsonPath('order.payment_status', 'cod_pending');

        $order = Order::with(['sellerOrders', 'items', 'paymentTransactions'])->findOrFail($response->json('order.id'));

        $this->assertSame('cod_pending', $order->payment_status->value);
        $this->assertSame('2000.00', $order->subtotal);
        $this->assertSame('60.00', $order->shipping_total);
        $this->assertSame('0.00', $order->discount_total);
        $this->assertSame('2060.00', $order->grand_total);
        $this->assertSame('Please call before delivery.', $order->customer_note);

        $this->assertCount(1, $order->items);
        $this->assertSame($product->id, $order->items[0]->product_id);
        $this->assertSame(2, $order->items[0]->quantity);

        $this->assertCount(1, $order->sellerOrders);
        $sellerOrder = $order->sellerOrders[0];
        $this->assertSame($seller['store']->id, $sellerOrder->store_id);
        $this->assertSame($seller['user']->id, $sellerOrder->seller_id);
        $this->assertSame('200.00', $sellerOrder->commission_amount);
        $this->assertSame('1800.00', $sellerOrder->seller_payable);

        $inventory = Inventory::where('variant_id', $variant->id)->firstOrFail();
        $this->assertSame(5, $inventory->quantity);
        $this->assertSame(2, $inventory->reserved_quantity);

        $this->assertDatabaseHas('payment_transactions', [
            'order_id' => $order->id,
            'type' => 'payment',
            'status' => 'pending',
        ]);

        $this->assertDatabaseCount('inventory_movements', 1);
        $this->assertDatabaseHas('inventory_movements', [
            'variant_id' => $variant->id,
            'type' => 'reservation',
            'quantity' => -2,
        ]);

        $this->assertSame(0, Cart::where('user_id', $customer->id)->firstOrFail()->items()->count());
    }

    public function test_repeated_checkout_with_the_same_idempotency_key_returns_the_same_order(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: 500, stock: 10);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
            ->assertOk();

        $headers = ['Idempotency-Key' => 'same-key-replay-0001'];
        $payload = ['address_id' => $address->id];

        $first = $this->actingAs($customer, 'sanctum')->postJson('/api/v1/checkout', $payload, $headers);
        $first->assertCreated();
        $orderId = $first->json('order.id');

        $second = $this->actingAs($customer, 'sanctum')->postJson('/api/v1/checkout', $payload, $headers);
        $second->assertOk()->assertJsonPath('order.id', $orderId);
        $this->assertStringContainsString('already placed', $second->json('message'));

        $this->assertDatabaseCount('orders', 1);
        $this->assertSame(1, Inventory::where('variant_id', $variant->id)->value('reserved_quantity'));
        $this->assertDatabaseCount('order_items', 1);
    }

    public function test_checkout_requires_an_idempotency_key(): void
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
            ->postJson('/api/v1/checkout', ['address_id' => $address->id])
            ->assertStatus(422)
            ->assertJsonValidationErrors('idempotency_key');

        $this->assertDatabaseCount('orders', 0);
    }

    public function test_checkout_rejects_quantities_above_available_stock_without_reserving_anything(): void
    {
        $seller = $this->makeSeller();
        ['product' => $product, 'variant' => $variant] = $this->makeVariant($seller['store'], stock: 2);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();

        $cart = Cart::create(['user_id' => $customer->id, 'status' => 'active']);
        $cart->items()->create([
            'product_id' => $product->id,
            'variant_id' => $variant->id,
            'quantity' => 5,
        ]);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/checkout', ['address_id' => $address->id], ['Idempotency-Key' => 'oversell-attempt-0001'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('cart');

        $this->assertDatabaseCount('orders', 0);
        $this->assertSame(0, Inventory::where('variant_id', $variant->id)->value('reserved_quantity'));
    }

    public function test_percentage_coupon_is_applied_to_the_order_and_counted(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: 1000, stock: 10);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();
        $coupon = Coupon::create([
            'code' => 'TEST10',
            'type' => 'percent',
            'value' => 10,
            'min_order_amount' => 0,
            'per_user_limit' => 1,
            'applies_to' => 'all',
            'is_active' => true,
        ]);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 2])
            ->assertOk();

        $response = $this->actingAs($customer, 'sanctum')->postJson('/api/v1/checkout', [
            'address_id' => $address->id,
            'coupon_code' => 'test10',
        ], ['Idempotency-Key' => 'coupon-checkout-0001']);

        $response->assertCreated();
        $order = Order::findOrFail($response->json('order.id'));

        $this->assertSame('200.00', $order->discount_total);
        $this->assertSame('1860.00', $order->grand_total);
        $this->assertSame('TEST10', $order->coupon_code);
        $this->assertSame(1, $coupon->fresh()->used_count);
    }

    public function test_customer_cannot_checkout_with_another_customers_address(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store']);
        $customer = $this->makeUser('customer');
        $other = $this->makeUser('customer');
        $this->makeAddress($customer);
        $foreignAddress = $this->makeAddress($other);
        $this->makeShippingZone();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
            ->assertOk();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/checkout', ['address_id' => $foreignAddress->id], ['Idempotency-Key' => 'foreign-address-0001'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('address_id');

        $this->assertDatabaseCount('orders', 0);
    }

    public function test_checkout_is_blocked_when_cod_is_disabled(): void
    {
        PlatformSetting::where('key', 'cod_enabled')->update(['value' => '0']);

        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store']);
        $customer = $this->makeUser('customer');
        $address = $this->makeAddress($customer);
        $this->makeShippingZone();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
            ->assertOk();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/checkout', ['address_id' => $address->id], ['Idempotency-Key' => 'cod-disabled-0001'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment_method');

        $this->assertDatabaseCount('orders', 0);
    }
}
