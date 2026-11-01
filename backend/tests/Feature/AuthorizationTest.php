<?php

namespace Tests\Feature;

use App\Models\Inventory;
use App\Models\Product;
use App\Models\SellerOrder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class AuthorizationTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_guests_are_rejected_from_authenticated_endpoints(): void
    {
        $this->getJson('/api/v1/cart')->assertUnauthorized();
        $this->getJson('/api/v1/orders')->assertUnauthorized();
        $this->getJson('/api/v1/seller/dashboard')->assertUnauthorized();
        $this->getJson('/api/v1/admin/dashboard')->assertUnauthorized();
        $this->postJson('/api/v1/uploads')->assertUnauthorized();
    }

    public function test_customers_cannot_reach_seller_or_administration_areas(): void
    {
        $customer = $this->makeUser('customer');

        $this->actingAs($customer, 'sanctum')->getJson('/api/v1/seller/dashboard')->assertForbidden();
        $this->actingAs($customer, 'sanctum')->getJson('/api/v1/admin/dashboard')->assertForbidden();
        $this->actingAs($customer, 'sanctum')->getJson('/api/v1/admin/sellers')->assertForbidden();
        $this->actingAs($customer, 'sanctum')->getJson('/api/v1/admin/reports')->assertForbidden();
    }

    public function test_sellers_cannot_reach_the_administration_area(): void
    {
        $seller = $this->makeSeller();

        $this->actingAs($seller['user'], 'sanctum')->getJson('/api/v1/admin/dashboard')->assertForbidden();
        $this->actingAs($seller['user'], 'sanctum')->getJson('/api/v1/admin/orders')->assertForbidden();
        $this->actingAs($seller['user'], 'sanctum')->getJson('/api/v1/admin/settings')->assertForbidden();
    }

    public function test_a_seller_cannot_read_or_modify_another_sellers_product(): void
    {
        $sellerA = $this->makeSeller();
        $sellerB = $this->makeSeller();
        ['product' => $product] = $this->makeVariant($sellerA['store']);

        $this->actingAs($sellerB['user'], 'sanctum')
            ->getJson("/api/v1/seller/products/{$product->id}")
            ->assertForbidden();

        $this->actingAs($sellerB['user'], 'sanctum')
            ->patchJson("/api/v1/seller/products/{$product->id}", ['name' => 'Hijacked'])
            ->assertForbidden();

        $this->actingAs($sellerB['user'], 'sanctum')
            ->deleteJson("/api/v1/seller/products/{$product->id}")
            ->assertForbidden();

        $this->assertSame('Test Product', substr(Product::findOrFail($product->id)->name, 0, 12));
    }

    public function test_a_sellers_product_list_only_contains_their_own_products(): void
    {
        $sellerA = $this->makeSeller();
        $sellerB = $this->makeSeller();
        ['product' => $productA] = $this->makeVariant($sellerA['store']);
        ['product' => $productB] = $this->makeVariant($sellerB['store']);

        $response = $this->actingAs($sellerB['user'], 'sanctum')
            ->getJson('/api/v1/seller/products?per_page=50');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertContains($productB->id, $ids);
        $this->assertNotContains($productA->id, $ids);
    }

    public function test_a_seller_cannot_view_or_advance_another_sellers_order(): void
    {
        $sellerA = $this->makeSeller();
        $sellerB = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($sellerA['store'], stock: 5);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant);
        $sellerOrder = SellerOrder::where('order_id', $order->id)->firstOrFail();

        $this->actingAs($sellerB['user'], 'sanctum')
            ->getJson("/api/v1/seller/orders/{$sellerOrder->id}")
            ->assertForbidden();

        $this->actingAs($sellerB['user'], 'sanctum')
            ->patchJson("/api/v1/seller/orders/{$sellerOrder->id}/status", ['status' => 'confirmed'])
            ->assertForbidden();

        $this->assertSame('pending_confirmation', $sellerOrder->fresh()->status->value);
    }

    public function test_the_owning_seller_can_advance_their_order(): void
    {
        $seller = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($seller['store'], stock: 5);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant);
        $sellerOrder = SellerOrder::where('order_id', $order->id)->firstOrFail();

        $this->actingAs($seller['user'], 'sanctum')
            ->patchJson("/api/v1/seller/orders/{$sellerOrder->id}/status", ['status' => 'confirmed'])
            ->assertOk();

        $this->assertSame('confirmed', $sellerOrder->fresh()->status->value);
    }

    public function test_administrators_can_reach_administration_endpoints(): void
    {
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/dashboard')->assertOk();
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/orders')->assertOk();
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/sellers')->assertOk();
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/settings')->assertOk();
    }

    public function test_a_suspended_account_cannot_use_an_existing_session(): void
    {
        $customer = $this->makeUser('customer');
        ['variant' => $variant] = $this->makeVariant($this->makeSeller()['store']);

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
            ->assertOk();

        $customer->update(['status' => 'suspended']);

        $this->actingAs($customer->fresh(), 'sanctum')
            ->getJson('/api/v1/cart')
            ->assertForbidden();
    }

    public function test_inventory_is_untouched_when_an_unauthorized_seller_tries_to_advance_an_order(): void
    {
        $sellerA = $this->makeSeller();
        $sellerB = $this->makeSeller();
        ['variant' => $variant] = $this->makeVariant($sellerA['store'], stock: 4);
        $customer = $this->makeUser('customer');
        $order = $this->placeOrder($customer, $variant, 2);
        $sellerOrder = SellerOrder::where('order_id', $order->id)->firstOrFail();

        $this->actingAs($sellerB['user'], 'sanctum')
            ->patchJson("/api/v1/seller/orders/{$sellerOrder->id}/status", ['status' => 'confirmed'])
            ->assertForbidden();

        $inventory = Inventory::where('variant_id', $variant->id)->firstOrFail();
        $this->assertSame(4, $inventory->quantity);
        $this->assertSame(2, $inventory->reserved_quantity);
    }
}
