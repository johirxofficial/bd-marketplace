<?php

namespace Tests\Feature;

use App\Models\Inventory;
use App\Models\Order;
use App\Models\Refund;
use App\Models\SellerOrder;
use App\Models\SellerPayout;
use App\Models\SellerSettlement;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class ReturnsAndSettlementsTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    /**
     * @return array{order: Order, sellerOrder: SellerOrder, seller: array}
     */
    private function deliveredOrder(int $quantity = 2, float $price = 1000.00, int $stock = 5): array
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], price: $price, stock: $stock);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant, $quantity);
        $sellerOrder = SellerOrder::where('order_id', $order->id)->firstOrFail();

        $this->advanceSellerOrder(
            $sellerOrder,
            $seller['user'],
            'confirmed',
            'processing',
            'ready_to_ship',
            'shipped',
            'delivered',
        );

        return [
            'order' => $order->fresh(['items', 'sellerOrders']),
            'sellerOrder' => $sellerOrder->fresh(),
            'seller' => $seller,
            'customer' => $customer,
            'variant' => $variant,
        ];
    }

    public function test_customer_return_is_approved_received_and_refunded_with_restock(): void
    {
        $context = $this->deliveredOrder(quantity: 2, price: 1000, stock: 5);
        $order = $context['order'];
        $item = $order->items->first();

        $inventory = Inventory::where('variant_id', $context['variant']->id)->firstOrFail();
        $this->assertSame(3, $inventory->quantity);

        $request = $this->actingAs($context['customer'], 'sanctum')
            ->postJson("/api/v1/orders/{$order->order_number}/returns", [
                'order_item_id' => $item->id,
                'quantity' => 1,
                'reason' => 'Damaged on arrival',
                'description' => 'The packaging was torn and the unit is cracked.',
            ]);

        $request->assertCreated();
        $returnId = $request->json('return.id');

        $storedReturn = \App\Models\ReturnRequest::findOrFail($returnId);
        $this->assertSame('requested', $storedReturn->status->value);
        $this->assertSame(1, $storedReturn->quantity);
        $this->assertSame(1000.0, (float) $storedReturn->refund_amount);

        $this->assertSame('return_requested', $context['sellerOrder']->fresh()->status->value);

        $this->actingAs($context['seller']['user'], 'sanctum')
            ->patchJson("/api/v1/seller/returns/{$returnId}", ['status' => 'approved', 'note' => 'Approved after photo review.'])
            ->assertOk();

        $this->assertDatabaseHas('return_requests', ['id' => $returnId, 'status' => 'approved']);

        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/returns/{$returnId}", ['status' => 'received', 'note' => 'Item inspected and confirmed damaged.'])
            ->assertOk();

        $inventory->refresh();
        $this->assertSame(4, $inventory->quantity);
        $this->assertSame(1000.0, (float) Refund::where('return_request_id', $returnId)->value('amount'));
        $this->assertDatabaseHas('refunds', ['return_request_id' => $returnId, 'status' => 'pending']);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/returns/{$returnId}", ['status' => 'refunded', 'note' => 'Cash refund handed over, receipt 1042.'])
            ->assertOk();

        $this->assertDatabaseHas('return_requests', ['id' => $returnId, 'status' => 'refunded']);
        $this->assertDatabaseHas('refunds', ['return_request_id' => $returnId, 'status' => 'processed']);

        $order->refresh();
        $this->assertSame('partially_refunded', $order->payment_status->value);
        $this->assertSame(1, Refund::where('order_id', $order->id)->where('status', 'processed')->count());
    }

    public function test_a_customer_cannot_request_a_return_before_delivery(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], stock: 5);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant, 1);
        $item = $order->items()->firstOrFail();

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/orders/{$order->order_number}/returns", [
                'order_item_id' => $item->id,
                'quantity' => 1,
                'reason' => 'Changed my mind',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('order');

        $this->assertDatabaseCount('return_requests', 0);
    }

    public function test_another_customer_cannot_request_a_return_for_someone_elses_order(): void
    {
        $context = $this->deliveredOrder(quantity: 1);
        $intruder = $this->makeUser('customer');
        $item = $context['order']->items->first();

        $this->actingAs($intruder, 'sanctum')
            ->postJson("/api/v1/orders/{$context['order']->order_number}/returns", [
                'order_item_id' => $item->id,
                'quantity' => 1,
                'reason' => 'Not mine',
            ])
            ->assertNotFound();
    }

    public function test_settlement_is_prepared_approved_and_paid_from_delivered_orders(): void
    {
        $context = $this->deliveredOrder(quantity: 2, price: 1000, stock: 5);
        $admin = $this->makeUser('admin');
        $sellerOrder = $context['sellerOrder'];

        $create = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/settlements', [
            'store_id' => $context['seller']['store']->id,
            'period_start' => now()->subDays(2)->toDateString(),
            'period_end' => now()->addDay()->toDateString(),
        ]);

        $create->assertCreated();
        $settlementId = $create->json('settlement.id');

        $settlement = SellerSettlement::findOrFail($settlementId);
        $this->assertSame('pending', $settlement->status);
        $this->assertSame('1800.00', $settlement->net_payable);
        $this->assertSame('200.00', $settlement->commission_total);
        $this->assertSame('2000.00', $settlement->gross_sales);
        $this->assertSame($settlementId, $sellerOrder->fresh()->settlement_id);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/settlements/{$settlementId}/approve")
            ->assertOk();

        $this->assertSame('approved', $settlement->fresh()->status);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/settlements/{$settlementId}/pay", [
                'method' => 'bank_transfer',
                'reference' => 'DBBL-TRX-99231',
                'note' => 'February payout run.',
            ])
            ->assertOk();

        $settlement->refresh();
        $this->assertSame('paid', $settlement->status);
        $this->assertNotNull($settlement->paid_at);

        $payout = SellerPayout::where('settlement_id', $settlementId)->firstOrFail();
        $this->assertSame('1800.00', $payout->amount);
        $this->assertSame('bank_transfer', $payout->method);
        $this->assertSame('DBBL-TRX-99231', $payout->reference);
        $this->assertSame('paid', $payout->status);
    }

    public function test_a_settlement_cannot_be_prepared_for_an_order_that_has_not_been_delivered(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], stock: 5);
        $customer = $this->makeUser('customer');
        $this->placeOrder($customer, $variant, 1);
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/settlements', [
                'store_id' => $seller['store']->id,
                'period_start' => now()->subDay()->toDateString(),
                'period_end' => now()->addDay()->toDateString(),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('period');

        $this->assertDatabaseCount('seller_settlements', 0);
    }

    public function test_only_administrators_can_manage_settlements(): void
    {
        $seller = $this->makeSeller();
        $customer = $this->makeUser('customer');

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/admin/settlements')
            ->assertForbidden();

        $this->actingAs($seller['user'], 'sanctum')
            ->getJson('/api/v1/admin/settlements')
            ->assertForbidden();
    }
}
