<?php

namespace Tests\Feature;

use App\Models\PlatformSetting;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class SecurityTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
    }

    public function test_media_path_traversal_is_blocked(): void
    {
        $this->get('/media/..%2F..%2F.env')->assertNotFound();
        $this->get('/media/%2E%2E/%2E%2E/.env')->assertNotFound();
        $this->get('/media/../../.env')->assertNotFound();
    }

    public function test_non_image_uploads_are_rejected_and_leave_no_file(): void
    {
        $seller = $this->makeSeller();
        $file = UploadedFile::fake()->create('payload.txt', 8, 'text/plain');

        $this->actingAs($seller['user'], 'sanctum')
            ->postJson('/api/v1/uploads', ['image' => $file])
            ->assertStatus(422)
            ->assertJsonValidationErrors('image');
    }

    public function test_svg_uploads_are_rejected(): void
    {
        $seller = $this->makeSeller();
        $file = UploadedFile::fake()->create('vector.svg', 4, 'image/svg+xml');

        $this->actingAs($seller['user'], 'sanctum')
            ->postJson('/api/v1/uploads', ['image' => $file])
            ->assertStatus(422)
            ->assertJsonValidationErrors('image');
    }

    public function test_uploads_outside_the_allowed_folders_are_rejected(): void
    {
        $seller = $this->makeSeller();
        $file = UploadedFile::fake()->image('photo.jpg', 60, 60);

        $this->actingAs($seller['user'], 'sanctum')
            ->postJson('/api/v1/uploads', ['image' => $file, 'folder' => '..'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('folder');
    }

    public function test_only_whitelisted_settings_keys_can_be_written(): void
    {
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', [
                'settings' => [['key' => 'db_password', 'value' => 'secret']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.0.key');

        $this->assertDatabaseMissing('platform_settings', ['key' => 'db_password']);
    }

    public function test_administrators_can_update_public_settings(): void
    {
        PlatformSetting::create([
            'key' => 'store_name',
            'value' => 'BD Marketplace',
            'type' => 'string',
            'group' => 'general',
            'label' => 'Store name',
        ]);

        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', [
                'settings' => [['key' => 'store_name', 'value' => 'Bazar BD']],
            ])
            ->assertOk();

        $this->assertSame('Bazar BD', PlatformSetting::where('key', 'store_name')->value('value'));
        $this->assertDatabaseHas('audit_logs', ['action' => 'settings.updated']);
    }

    public function test_sellers_cannot_change_platform_settings(): void
    {
        $seller = $this->makeSeller();

        $this->actingAs($seller['user'], 'sanctum')
            ->patchJson('/api/v1/admin/settings', [
                'settings' => [['key' => 'store_name', 'value' => 'Hijacked']],
            ])
            ->assertForbidden();
    }

    public function test_password_reset_requests_do_not_reveal_whether_an_account_exists(): void
    {
        $known = $this->makeUser('customer', ['email' => 'known@example.test']);

        $first = $this->postJson('/api/v1/auth/forgot-password', ['email' => $known->email]);
        $second = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'unknown@example.test']);

        $first->assertOk();
        $second->assertOk();
        $this->assertSame($first->json('message'), $second->json('message'));
    }

    public function test_public_product_listing_only_returns_approved_products(): void
    {
        $sellerA = $this->makeSeller();
        $sellerB = $this->makeSeller();
        ['product' => $approved] = $this->makeVariant($sellerA['store']);
        ['product' => $draft] = $this->makeVariant($sellerB['store'], overrides: ['status' => 'draft', 'approved_at' => null]);

        $response = $this->getJson('/api/v1/products?per_page=48');
        $response->assertOk();

        $slugs = collect($response->json('data'))->pluck('slug')->all();

        $this->assertContains($approved->slug, $slugs);
        $this->assertNotContains($draft->slug, $slugs);
    }
}
