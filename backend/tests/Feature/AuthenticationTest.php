<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        // Sanctum treats requests from stateful domains as session-based.
        $this->withHeader('Origin', 'http://localhost');
    }

    public function test_a_customer_can_log_in_and_read_their_profile(): void
    {
        $customer = $this->makeUser('customer', ['password' => 'password']);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => $customer->email,
            'password' => 'password',
        ]);

        $login->assertOk()
            ->assertJsonPath('user.email', $customer->email)
            ->assertJsonPath('user.role', 'customer');

        $this->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('user.id', $customer->id);

        $this->assertNotNull($customer->fresh()->last_login_at);
    }

    public function test_guest_api_requests_return_401_instead_of_failing_on_a_missing_login_route(): void
    {
        $this->get('/api/v1/admin/payments/pending', ['Accept' => 'text/html'])
            ->assertStatus(401);
    }

    public function test_invalid_credentials_are_rejected(): void
    {
        $customer = $this->makeUser('customer', ['password' => 'password']);

        $this->postJson('/api/v1/auth/login', [
            'email' => $customer->email,
            'password' => 'not-the-password',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_suspended_accounts_cannot_log_in(): void
    {
        $customer = $this->makeUser('customer', ['password' => 'password', 'status' => 'suspended']);

        $this->postJson('/api/v1/auth/login', [
            'email' => $customer->email,
            'password' => 'password',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_registration_creates_a_customer_with_a_cart(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Nusrat Jahan',
            'email' => 'nusrat@example.test',
            'phone' => '01712345678',
            'password' => 'Passw0rd!23',
            'password_confirmation' => 'Passw0rd!23',
        ]);

        $response->assertCreated()->assertJsonPath('user.email', 'nusrat@example.test');

        $user = User::where('email', 'nusrat@example.test')->firstOrFail();
        $this->assertSame('customer', $user->role->name);
        $this->assertSame('active', $user->status);
        $this->assertNotNull($user->cart);
    }

    public function test_registration_rejects_duplicate_email_and_weak_password(): void
    {
        $this->makeUser('customer', ['email' => 'taken@example.test']);

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Someone',
            'email' => 'taken@example.test',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_logout_ends_the_session(): void
    {
        $customer = $this->makeUser('customer', ['password' => 'password']);

        $this->postJson('/api/v1/auth/login', [
            'email' => $customer->email,
            'password' => 'password',
        ])->assertOk();

        $this->postJson('/api/v1/auth/logout')->assertOk();

        // The test kernel keeps guard instances between requests, unlike a real
        // PHP request. Forget them so the session is re-resolved from scratch.
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    }
}
