<?php

namespace Tests\Concerns;

use App\Enums\OrderStatus;
use App\Models\Address;
use App\Models\Cart;
use App\Models\Category;
use App\Models\Inventory;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\SellerOrder;
use App\Models\SellerProfile;
use App\Models\ShippingZone;
use App\Models\Store;
use App\Models\User;
use App\Services\CheckoutService;
use App\Services\OrderService;
use Illuminate\Support\Str;

/**
 * Small domain builder used by the feature tests. It keeps tests focused on
 * behaviour instead of repeating schema details for every scenario.
 */
trait BuildsMarketplace
{
    protected function makeUser(string $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge([
            'role_id' => Role::where('name', $role)->value('id'),
            'status' => 'active',
        ], $attributes));
    }

    /**
     * @return array{user: User, profile: SellerProfile, store: Store}
     */
    protected function makeSeller(array $userAttributes = [], array $storeAttributes = []): array
    {
        $user = $this->makeUser('seller', $userAttributes);

        $profile = SellerProfile::create([
            'user_id' => $user->id,
            'business_name' => 'Test Seller '.Str::upper(Str::random(4)),
            'business_type' => 'business',
            'phone' => '017'.random_int(10000000, 99999999),
            'business_address' => '12 Test Road, Dhaka',
            'status' => 'approved',
            'commission_rate' => 10,
            'approved_at' => now(),
        ]);

        $store = Store::create(array_merge([
            'seller_id' => $profile->id,
            'name' => 'Test Store '.Str::upper(Str::random(4)),
            'slug' => 'test-store-'.Str::lower(Str::random(8)),
            'description' => 'A store created for automated tests.',
            'status' => 'active',
        ], $storeAttributes));

        return ['user' => $user, 'profile' => $profile, 'store' => $store];
    }

    /**
     * @return array{product: Product, variant: ProductVariant, inventory: Inventory}
     */
    protected function makeVariant(Store $store, float $price = 1000.00, int $stock = 10, array $overrides = []): array
    {
        $category = Category::first() ?? Category::create([
            'name' => 'Test Category',
            'slug' => 'test-category',
            'is_active' => true,
        ]);

        $product = Product::create(array_merge([
            'store_id' => $store->id,
            'category_id' => $category->id,
            'name' => 'Test Product '.Str::upper(Str::random(5)),
            'slug' => 'test-product-'.Str::lower(Str::random(8)),
            'sku' => 'SKU-'.Str::upper(Str::random(8)),
            'short_description' => 'A product used in tests.',
            'description' => 'A longer product description used in tests.',
            'base_price' => $price,
            'status' => 'approved',
            'approved_at' => now(),
        ], $overrides));

        $variant = ProductVariant::create([
            'product_id' => $product->id,
            'name' => 'Default',
            'sku' => 'VAR-'.Str::upper(Str::random(8)),
            'price' => $price,
            'is_active' => true,
        ]);

        $inventory = Inventory::create([
            'variant_id' => $variant->id,
            'quantity' => $stock,
            'reserved_quantity' => 0,
        ]);

        return ['product' => $product, 'variant' => $variant, 'inventory' => $inventory];
    }

    protected function makeAddress(User $user, array $overrides = []): Address
    {
        return Address::create(array_merge([
            'user_id' => $user->id,
            'label' => 'Home',
            'recipient_name' => $user->name,
            'phone' => '018'.random_int(10000000, 99999999),
            'division' => 'Dhaka',
            'district' => 'Dhaka',
            'upazila' => 'Gulshan',
            'area' => 'Gulshan 2',
            'street_address' => 'House 12, Road 5',
            'postal_code' => '1212',
            'is_default' => true,
        ], $overrides));
    }

    protected function makeShippingZone(array $overrides = []): ShippingZone
    {
        return ShippingZone::create(array_merge([
            'name' => 'Inside Dhaka',
            'division' => 'Dhaka',
            'district' => 'Dhaka',
            'inside_dhaka' => true,
            'base_fee' => 60.00,
            'estimated_days_min' => 1,
            'estimated_days_max' => 2,
            'is_active' => true,
        ], $overrides));
    }

    /**
     * Place a COD order through the checkout service (no HTTP layer).
     */
    protected function placeOrder(User $customer, ProductVariant $variant, int $quantity = 1, ?string $key = null): Order
    {
        $address = $customer->addresses()->first() ?? $this->makeAddress($customer);

        if (! \App\Models\PaymentMethod::where('code', 'cod')->exists()) {
            $this->seed(\Database\Seeders\PaymentMethodSeeder::class);
        }

        if (! ShippingZone::where('is_active', true)->exists()) {
            $this->makeShippingZone();
        }

        $cart = Cart::firstOrCreate(['user_id' => $customer->id], ['status' => 'active']);
        $cart->items()->create([
            'product_id' => $variant->product_id,
            'variant_id' => $variant->id,
            'quantity' => $quantity,
        ]);

        return app(CheckoutService::class)->placeOrder(
            $customer,
            $cart->fresh(),
            $address,
            null,
            $key ?? 'test-order-'.Str::random(16),
            null,
        );
    }

    protected function advanceSellerOrder(SellerOrder $sellerOrder, User $actor, string ...$statuses): SellerOrder
    {
        $orders = app(OrderService::class);

        foreach ($statuses as $status) {
            $sellerOrder = $orders->transitionSellerOrder($sellerOrder, OrderStatus::from($status), $actor);
        }

        return $sellerOrder;
    }
}
