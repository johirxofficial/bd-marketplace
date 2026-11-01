<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\PaymentMethod;
use App\Models\PlatformSetting;
use App\Services\PaymentService;
use Database\Seeders\PaymentMethodSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class SettingsBrandingTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(SettingsSeeder::class);
        $this->seed(PaymentMethodSeeder::class);
    }

    public function test_admin_can_save_branding_and_contact_settings(): void
    {
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', [
                'settings' => [
                    ['key' => 'store_name', 'value' => 'Test Bazaar'],
                    ['key' => 'store_logo_path', 'value' => 'branding/logo.png'],
                    ['key' => 'store_favicon_path', 'value' => 'branding/favicon.png'],
                    ['key' => 'announcement', 'value' => 'Eid sale is live.'],
                    ['key' => 'primary_color', 'value' => '#0e7490'],
                    ['key' => 'support_phone', 'value' => '+8809610000000'],
                    ['key' => 'facebook_url', 'value' => 'https://facebook.com/testbazaar'],
                    ['key' => 'meta_title', 'value' => 'Test Bazaar — online shopping'],
                ],
            ])
            ->assertOk();

        $this->getJson('/api/v1/settings/public')
            ->assertOk()
            ->assertJsonPath('settings.store_name', 'Test Bazaar')
            ->assertJsonPath('settings.store_logo_path', 'branding/logo.png')
            ->assertJsonPath('settings.announcement', 'Eid sale is live.')
            ->assertJsonPath('settings.primary_color', '#0e7490');
    }

    public function test_public_settings_exposes_enabled_payment_methods_only(): void
    {
        $response = $this->getJson('/api/v1/settings/public')->assertOk();

        $codes = collect($response->json('settings.payment_methods'))->pluck('code')->all();

        $this->assertContains('cod', $codes);
        $this->assertContains('bkash', $codes);
        $this->assertContains('nagad', $codes);
        $this->assertContains('rocket', $codes);
        $this->assertContains('banglaqr', $codes);
        $this->assertNotContains('online', $codes);
    }

    public function test_unknown_setting_keys_are_rejected(): void
    {
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', [
                'settings' => [['key' => 'app_debug', 'value' => '1']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.0.key');

        $this->assertNull(PlatformSetting::where('key', 'app_debug')->first());
    }

    public function test_settings_are_not_writable_without_permission(): void
    {
        $customer = $this->makeUser('customer');

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/admin/settings', [
                'settings' => [['key' => 'store_name', 'value' => 'Hijacked']],
            ])
            ->assertForbidden();

        $this->assertNotSame('Hijacked', PlatformSetting::get('store_name'));
    }

    public function test_public_payment_method_instructions_include_the_merchant_number(): void
    {
        $response = $this->getJson('/api/v1/payment-methods')->assertOk();

        $bkash = collect($response->json('payment_methods'))->firstWhere('code', 'bkash');
        $this->assertNotNull($bkash);
        $this->assertSame('01700000001', $bkash['config']['merchant_number']);
        $this->assertTrue($bkash['requires_verification']);
        $this->assertStringContainsString('01700000001', $bkash['instructions']);
        $this->assertStringContainsString('your order number', $bkash['instructions']);
        $this->assertStringNotContainsString('Send  to', $bkash['instructions']);
        $this->assertSame('0.00', $bkash['fee_amount']);

        $paybill = collect($response->json('payment_methods'))->firstWhere('code', 'bkash_paybill');
        $this->assertNotNull($paybill);
        $this->assertStringContainsString('DEMO-BILLER', $paybill['instructions']);
        $this->assertStringContainsString('the order total as the bill amount', $paybill['instructions']);
        $this->assertStringContainsString('your order number as the reference', $paybill['instructions']);
        $this->assertStringNotContainsString('bill/order .', $paybill['instructions']);
    }

    public function test_order_instructions_include_the_exact_amount_and_order_number(): void
    {
        $method = PaymentMethod::where('code', 'bkash_paybill')->firstOrFail();
        $order = new Order(['order_number' => 'BDP-261027-SMOKE1', 'grand_total' => '240.00']);

        $instructions = app(PaymentService::class)->renderInstructions($method, $order);

        $this->assertStringContainsString('240.00 as the bill amount', $instructions);
        $this->assertStringContainsString('BDP-261027-SMOKE1 as the reference', $instructions);
        $this->assertStringNotContainsString('your order number', $instructions);
    }
}
