<?php

namespace Tests\Feature;

use App\Models\Plugin;
use App\Plugins\Hook;
use App\Plugins\PluginManager;
use Database\Seeders\PluginSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class PluginTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(PluginSeeder::class);
    }

    private function boot(): void
    {
        app(PluginManager::class)->flush();
        app(PluginManager::class)->boot();
    }

    public function test_enabled_plugin_filter_changes_the_storefront_announcement(): void
    {
        $this->boot();

        $this->getJson('/api/v1/settings/public')
            ->assertOk()
            ->assertJsonPath('settings.announcement', 'Free delivery on orders over ৳2,000 — shop verified sellers across Bangladesh.');
    }

    public function test_admin_can_disable_the_plugin_and_the_hook_stops_running(): void
    {
        $this->boot();
        $admin = $this->makeUser('admin');
        $plugin = Plugin::where('plugin_id', 'free-delivery-banner')->firstOrFail();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/plugins/{$plugin->id}", ['enabled' => false])
            ->assertOk()
            ->assertJsonPath('plugin.enabled', false);

        $this->assertSame(0, Hook::registered()['filters']);

        $this->getJson('/api/v1/settings/public')
            ->assertOk()
            ->assertJsonPath('settings.announcement', '');
    }

    public function test_plugin_sync_discovers_manifests_and_preserves_enabled_state(): void
    {
        $admin = $this->makeUser('admin');
        Plugin::where('plugin_id', 'free-delivery-banner')->update(['enabled' => true]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/plugins/sync')
            ->assertOk();

        $record = Plugin::where('plugin_id', 'free-delivery-banner')->firstOrFail();
        $this->assertTrue($record->enabled);
        $this->assertSame('1.0.0', $record->version);
    }

    public function test_plugin_management_requires_permission(): void
    {
        $customer = $this->makeUser('customer');
        $plugin = Plugin::where('plugin_id', 'free-delivery-banner')->firstOrFail();

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/admin/plugins')
            ->assertForbidden();

        $this->actingAs($customer, 'sanctum')
            ->patchJson("/api/v1/admin/plugins/{$plugin->id}", ['enabled' => false])
            ->assertForbidden();

        $this->assertTrue($plugin->fresh()->enabled);
    }
}
