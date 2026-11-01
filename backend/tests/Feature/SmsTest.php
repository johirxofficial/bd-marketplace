<?php

namespace Tests\Feature;

use App\Models\PlatformSetting;
use App\Models\SmsGateway;
use App\Models\SmsMessage;
use App\Services\SmsService;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SmsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class SmsTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(SmsSeeder::class);
    }

    private function enableSms(): void
    {
        PlatformSetting::updateOrCreate(
            ['key' => 'sms_enabled'],
            ['value' => '1', 'type' => 'boolean', 'group' => 'notifications', 'label' => 'SMS enabled'],
        );
    }

    public function test_sms_is_skipped_while_the_platform_toggle_is_off(): void
    {
        $user = $this->makeUser('customer', ['phone' => '01712345678']);

        $this->assertNull(app(SmsService::class)->sendEvent($user, 'order_placed', [
            'order_number' => 'BDP-TEST-1',
            'amount' => '1000.00',
            'payment_method' => 'Cash on Delivery',
        ]));

        $this->assertSame(0, SmsMessage::count());
    }

    public function test_known_event_uses_the_template_and_log_gateway(): void
    {
        $this->enableSms();
        $user = $this->makeUser('customer', ['name' => 'Rahim Uddin', 'phone' => '01712345678']);

        $message = app(SmsService::class)->sendEvent($user, 'order_placed', [
            'order_number' => 'BDP-SMS-1001',
            'amount' => '1250.00',
            'payment_method' => 'bKash',
        ]);

        $this->assertNotNull($message);
        $this->assertSame('8801712345678', $message->to);
        $this->assertSame('sent', $message->fresh()->status);
        $this->assertStringContainsString('BDP-SMS-1001', $message->body);
        $this->assertStringContainsString('Rahim Uddin', $message->body);
        $this->assertStringContainsString('1250.00', $message->body);
    }

    public function test_admin_can_send_a_test_message_and_read_the_log(): void
    {
        $this->enableSms();
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/sms/test', [
                'to' => '01812345678',
                'body' => 'Test message from BD Marketplace.',
            ])
            ->assertCreated()
            ->assertJsonPath('sms.status', 'queued');

        $this->assertDatabaseHas('sms_messages', [
            'to' => '8801812345678',
            'body' => 'Test message from BD Marketplace.',
            'status' => 'sent',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/sms/messages')
            ->assertOk()
            ->assertJsonFragment(['to' => '8801812345678']);
    }

    public function test_sms_administration_requires_permission(): void
    {
        $customer = $this->makeUser('customer');

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/admin/sms/gateways')
            ->assertForbidden();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/admin/sms/test', ['to' => '01712345678', 'body' => 'Nope'])
            ->assertForbidden();

        $this->assertSame(0, SmsMessage::count());
        $this->assertTrue(SmsGateway::where('driver', 'log')->exists());
    }

    public function test_admin_can_configure_a_gateway_without_leaking_the_api_key(): void
    {
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/sms/gateways', [
                'name' => 'SSL Wireless production',
                'driver' => 'sslwireless',
                'sender_id' => 'BDMARKET',
                'enabled' => true,
                'is_default' => false,
                'config' => ['api_token' => 'super-secret-token'],
            ])
            ->assertCreated()
            ->assertJsonMissing(['super-secret-token']);

        $gateway = SmsGateway::where('driver', 'sslwireless')->firstOrFail();
        $this->assertSame('super-secret-token', $gateway->config['api_token']);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/sms/gateways')
            ->assertOk()
            ->assertJsonMissing(['super-secret-token']);
    }
}
