<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\EmailMessage;
use App\Models\User;
use Database\Seeders\EmailSeeder;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(EmailSeeder::class);
    }

    public function test_admin_can_view_a_user_account(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/admin/users/{$customer->id}")
            ->assertOk()
            ->assertJsonPath('user.id', $customer->id)
            ->assertJsonPath('user.email', $customer->email)
            ->assertJsonPath('user.role', 'customer')
            ->assertJsonStructure(['user' => [
                'name', 'email', 'phone', 'status', 'role_label', 'avatar_url',
                'last_login_at', 'created_at', 'orders_count', 'support_tickets_count', 'conversations_count',
            ]])
            // Passwords are hashed one-way and must never be exposed.
            ->assertJsonMissingPath('user.password');
    }

    public function test_admin_can_edit_name_email_and_phone(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/users/{$customer->id}", [
                'name' => 'Ayesha Updated',
                'email' => 'Ayesha.Updated@Example.com',
                'phone' => '01811000099',
            ])
            ->assertOk()
            ->assertJsonPath('user.name', 'Ayesha Updated')
            ->assertJsonPath('user.email', 'ayesha.updated@example.com')
            ->assertJsonPath('user.phone', '01811000099');

        $this->assertDatabaseHas('users', [
            'id' => $customer->id,
            'name' => 'Ayesha Updated',
            'email' => 'ayesha.updated@example.com',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'user.details_updated',
            'auditable_id' => $customer->id,
        ]);
    }

    public function test_admin_cannot_take_another_users_email(): void
    {
        $admin = $this->makeUser('admin');
        $first = $this->makeUser('customer');
        $second = $this->makeUser('customer');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/users/{$first->id}", [
                'name' => $first->name,
                'email' => $second->email,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_admin_can_set_a_new_password_and_other_sessions_are_revoked(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');
        $customer->createToken('customer-phone');

        $this->assertSame(1, $customer->tokens()->count());

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/users/{$customer->id}/password", [
                'password' => 'NewSecret123',
                'password_confirmation' => 'NewSecret123',
            ])
            ->assertOk();

        $customer = $customer->fresh();

        $this->assertTrue(Hash::check('NewSecret123', $customer->password));
        $this->assertFalse(Hash::check('password', $customer->password));
        $this->assertSame(0, $customer->tokens()->count());

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'user.password_changed',
            'auditable_id' => $customer->id,
        ]);

        // The owner is notified through the standard password changed email.
        $this->assertDatabaseHas('email_messages', [
            'event' => 'password_changed',
            'to_email' => $customer->email,
        ]);
    }

    public function test_weak_or_mismatched_passwords_are_rejected(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');
        $original = $customer->password;

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/users/{$customer->id}/password", [
                'password' => 'short',
                'password_confirmation' => 'short',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/users/{$customer->id}/password", [
                'password' => 'NewSecret123',
                'password_confirmation' => 'Different123',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');

        $this->assertSame($original, $customer->fresh()->password);
    }

    public function test_admin_can_send_a_password_reset_link(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/users/{$customer->id}/password-reset")
            ->assertOk()
            ->assertJsonPath('sent', true);

        $this->assertDatabaseHas('email_messages', [
            'event' => 'password_reset',
            'to_email' => $customer->email,
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'user.password_reset_sent',
            'auditable_id' => $customer->id,
        ]);
    }

    public function test_reset_link_is_not_sent_to_a_suspended_account(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer', ['status' => 'suspended']);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/users/{$customer->id}/password-reset")
            ->assertStatus(422);

        $this->assertSame(0, EmailMessage::where('event', 'password_reset')->count());
    }

    public function test_non_admin_staff_cannot_manage_passwords(): void
    {
        $manager = $this->makeUser('manager');
        $customer = $this->makeUser('customer');

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/users/{$customer->id}/password", [
                'password' => 'NewSecret123',
                'password_confirmation' => 'NewSecret123',
            ])
            ->assertForbidden();

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/users/{$customer->id}", [
                'name' => 'Hacked Name',
                'email' => $customer->email,
            ])
            ->assertForbidden();

        $this->assertTrue(Hash::check('password', $customer->fresh()->password));
    }

    public function test_admin_can_change_their_own_password_without_losing_the_current_session(): void
    {
        $admin = $this->makeUser('admin');
        $token = $admin->createToken('admin-browser');
        $plain = $token->plainTextToken;

        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->patchJson("/api/v1/admin/users/{$admin->id}/password", [
                'password' => 'AdminSecret123',
                'password_confirmation' => 'AdminSecret123',
            ])
            ->assertOk();

        $this->assertSame(1, $admin->fresh()->tokens()->count());
        $this->assertTrue(Hash::check('AdminSecret123', $admin->fresh()->password));

        // The guarded token still works for the current session.
        $this->withHeader('Authorization', 'Bearer '.$plain)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('user.id', $admin->id);
    }

    public function test_password_change_is_audited_for_the_actor(): void
    {
        $admin = $this->makeUser('admin');
        $customer = $this->makeUser('customer');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/users/{$customer->id}/password", [
                'password' => 'AnotherSecret123',
                'password_confirmation' => 'AnotherSecret123',
            ])
            ->assertOk();

        $log = AuditLog::where('action', 'user.password_changed')->where('auditable_id', $customer->id)->first();
        $this->assertNotNull($log);
        $this->assertSame($admin->id, $log->user_id);
    }
}
