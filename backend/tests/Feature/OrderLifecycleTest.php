<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\PaymentTransaction;
use App\Models\SellerOrder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class OrderLifecycleTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_shipping_commits_stock_and_cod_collection_marks_the_order_paid(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: 1000, stock: 5);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant, 2);
        $sellerOrder = SellerOrder::where('order_id', $order->id)->firstOrFail();
        $admin = $this->makeUser('admin');

        $this->advanceSellerOrder($sellerOrder, $seller['user'], 'confirmed', 'processing', 'ready_to_ship');

        $inventory = Inventory::where('variant_id', $variant->id)->firstOrFail();
        $this->assertSame(5, $inventory->quantity);
        $this->assertSame(2, $inventory->reserved_quantity);

        $this->advanceSellerOrder($sellerOrder->fresh(), $seller['user'], 'shipped');

        $inventory->refresh();
        $this->assertSame(3, $inventory->quantity);
        $this->assertSame(0, $inventory->reserved_quantity);
        $this->assertSame('shipped', $order->fresh()->status->value);

        // COD cannot be collected before the parcel has been delivered.
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/orders/{$order->id}/cod-collected", ['reference' => 'STF-1'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment');

        $this->advanceSellerOrder($sellerOrder->fresh(), $seller['user'], 'delivered');

        $this->assertSame('delivered', $order->fresh()->status->value);
        $this->assertSame('cod_pending', $order->fresh()->payment_status->value);

        // Sellers cannot collect COD.
        $this->actingAs($seller['user'], 'sanctum')
            ->postJson("/api/v1/admin/orders/{$order->id}/cod-collected", ['reference' => 'STF-1'])
            ->assertForbidden();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/orders/{$order->id}/cod-collected", ['reference' => 'STF-2026-0001'])
            ->assertOk();

        $order->refresh();
        $this->assertSame('paid', $order->payment_status->value);

        $this->assertDatabaseHas('payment_transactions', [
            'order_id' => $order->id,
            'type' => 'payment',
            'status' => 'collected',
            'provider_ref' => 'STF-2026-0001',
        ]);

        $this->assertSame(1, PaymentTransaction::where('order_id', $order->id)->where('status', 'collected')->count());

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'order.cod_collected',
            'auditable_type' => Order::class,
            'auditable_id' => $order->id,
        ]);

        // Collecting twice is rejected.
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/orders/{$order->id}/cod-collected", ['reference' => 'STF-2026-0001'])
            ->assertStatus(422);
    }

    public function test_cancelling_before_shipping_releases_reserved_stock(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], stock: 5);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant, 3);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/orders/{$order->order_number}/cancel", ['reason' => 'Ordered by mistake, please cancel.'])
            ->assertOk();

        $order->refresh();
        $this->assertSame('cancelled', $order->status->value);
        $this->assertSame('failed', $order->payment_status->value);

        $inventory = Inventory::where('variant_id', $variant->id)->firstOrFail();
        $this->assertSame(5, $inventory->quantity);
        $this->assertSame(0, $inventory->reserved_quantity);

        $this->assertDatabaseHas('inventory_movements', [
            'variant_id' => $variant->id,
            'type' => 'release',
            'quantity' => 3,
        ]);
    }

    public function test_a_shipped_order_can_no_longer_be_cancelled_by_the_customer(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], stock: 5);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant, 1);
        $sellerOrder = SellerOrder::where('order_id', $order->id)->firstOrFail();

        $this->advanceSellerOrder($sellerOrder->fresh(), $seller['user'], 'confirmed', 'processing', 'ready_to_ship', 'shipped');

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/orders/{$order->order_number}/cancel", ['reason' => 'Changed my mind after shipping.'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('order');

        $this->assertSame('shipped', $order->fresh()->status->value);
        $this->assertSame(4, Inventory::where('variant_id', $variant->id)->value('quantity'));
    }

    public function test_customers_only_see_their_own_orders(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], stock: 5);
        $alice = $this->makeUser('customer');
        $bob = $this->makeUser('customer');
        $aliceOrder = $this->placeOrder($alice, $variant);
        $bobOrder = $this->placeOrder($bob, $variant);

        $list = $this->actingAs($alice, 'sanctum')->getJson('/api/v1/orders?per_page=50');
        $list->assertOk();
        $numbers = collect($list->json('data'))->pluck('order_number')->all();
        $this->assertContains($aliceOrder->order_number, $numbers);
        $this->assertNotContains($bobOrder->order_number, $numbers);

        $this->actingAs($alice, 'sanctum')
            ->getJson("/api/v1/orders/{$bobOrder->order_number}")
            ->assertNotFound();
    }

    public function test_audit_log_records_are_append_only_from_the_api(): void
    {
        $admin = $this->makeUser('admin');
        $log = AuditLog::create([
            'user_id' => $admin->id,
            'action' => 'test.action',
            'new_values' => ['ok' => true],
        ]);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/admin/audit-logs/{$log->id}")
            ->assertNotFound();
    }
}
