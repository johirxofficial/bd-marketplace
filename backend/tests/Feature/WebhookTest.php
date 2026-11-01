<?php

namespace Tests\Feature;

use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Services\WebhookService;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class WebhookTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_webhook_secret_is_encrypted_at_rest_and_signed_payloads_are_delivered(): void
    {
        Http::fake(['https://hooks.example.test/*' => Http::response(['received' => true], 200)]);
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/developer/webhooks', [
                'name' => 'Order sync',
                'url' => 'https://hooks.example.test/orders',
                'events' => ['order.placed'],
                'secret' => 'a-very-long-signing-secret',
                'active' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('webhook.name', 'Order sync');

        $plaintextSecret = $response->json('secret');
        $this->assertSame('a-very-long-signing-secret', $plaintextSecret);

        $stored = DB::table('webhooks')->where('name', 'Order sync')->value('secret');
        $this->assertNotSame('a-very-long-signing-secret', $stored);

        $webhook = Webhook::where('name', 'Order sync')->firstOrFail();
        $this->assertSame('a-very-long-signing-secret', $webhook->secret);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/developer/webhooks/{$webhook->id}/test")
            ->assertOk();

        $delivery = WebhookDelivery::where('webhook_id', $webhook->id)->firstOrFail();
        $this->assertSame('order.placed', $delivery->event);
        $this->assertSame(1, (int) $delivery->attempts);
        $this->assertSame(200, (int) $delivery->response_status);
        $this->assertNotNull($delivery->delivered_at);
        $this->assertNull($delivery->failed_at);
        $this->assertNotNull($webhook->fresh()->last_triggered_at);

        Http::assertSent(function (ClientRequest $request) use ($webhook) {
            $expected = 'sha256='.hash_hmac('sha256', $request->body(), $webhook->secret);

            return $request->hasHeader('X-BD-Event', 'order.placed')
                && $request->hasHeader('X-BD-Signature', $expected)
                && $request->url() === 'https://hooks.example.test/orders';
        });
    }

    public function test_inactive_webhooks_are_not_dispatched(): void
    {
        Http::fake();
        $webhook = Webhook::create([
            'name' => 'Disabled endpoint',
            'url' => 'https://hooks.example.test/disabled',
            'secret' => 'another-long-signing-secret',
            'events' => ['order.placed'],
            'active' => false,
        ]);

        app(WebhookService::class)->dispatch('order.placed', ['order_number' => 'BDP-1']);

        $this->assertSame(0, WebhookDelivery::count());
        Http::assertNothingSent();
    }

    public function test_events_outside_the_allow_list_are_ignored(): void
    {
        Http::fake();
        Webhook::create([
            'name' => 'Catch all',
            'url' => 'https://hooks.example.test/all',
            'secret' => 'another-long-signing-secret',
            'events' => ['*'],
            'active' => true,
        ]);

        app(WebhookService::class)->dispatch('not.a.real.event', ['x' => 1]);

        $this->assertSame(0, WebhookDelivery::count());
    }

    public function test_developer_tools_require_permission_and_return_a_token_once(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/admin/developer/tokens', ['name' => 'Nope'])
            ->assertForbidden();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/developer/tokens', [
                'name' => 'CI integration',
                'abilities' => ['*'],
                'expires_in_days' => 30,
            ])
            ->assertCreated()
            ->assertJsonPath('token.name', 'CI integration');

        $token = $response->json('plain_text_token');
        $this->assertIsString($token);
        $this->assertStringContainsString('|', $token);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/developer/tokens')
            ->assertOk()
            ->assertJsonMissing(['plain_text_token' => $token]);
    }
}
