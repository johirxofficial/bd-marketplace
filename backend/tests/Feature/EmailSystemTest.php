<?php

namespace Tests\Feature;

use App\Models\EmailCampaign;
use App\Models\EmailMessage;
use App\Models\MailSetting;
use App\Models\NewsletterSubscriber;
use Database\Seeders\EmailSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsMarketplace;
use Tests\TestCase;

class EmailSystemTest extends TestCase
{
    use BuildsMarketplace;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolePermissionSeeder::class);
        $this->seed(SettingsSeeder::class);
        $this->seed(EmailSeeder::class);
    }

    public function test_registration_queues_and_delivers_the_welcome_email(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Email Tester',
            'email' => 'email-tester@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertCreated();

        $message = EmailMessage::where('event', 'welcome')->firstOrFail();

        $this->assertSame('email-tester@example.com', $message->to_email);
        $this->assertSame('sent', $message->status);
        $this->assertStringContainsString('Email Tester', $message->body);
        $this->assertStringContainsString('Start shopping', $message->body);
    }

    public function test_password_reset_uses_the_branded_template_and_resets_the_account(): void
    {
        $user = $this->makeUser('customer', ['email' => 'reset-me@example.com']);

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk();

        $message = EmailMessage::where('event', 'password_reset')->firstOrFail();
        $this->assertSame('sent', $message->status);
        $this->assertStringContainsString('/reset-password?token=', $message->body);

        preg_match('/token=([^&"]+)/', $message->body, $matches);

        $this->postJson('/api/v1/auth/reset-password', [
            'token' => urldecode($matches[1]),
            'email' => $user->email,
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertOk();

        $this->assertDatabaseHas('email_messages', ['event' => 'password_changed', 'to_email' => $user->email]);
    }

    public function test_newsletter_subscribe_sends_welcome_and_unsubscribe_stops_it(): void
    {
        $this->postJson('/api/v1/newsletter/subscribe', [
            'email' => 'subscriber@example.com',
            'name' => 'Newsletter Fan',
        ])->assertCreated();

        $subscriber = NewsletterSubscriber::where('email', 'subscriber@example.com')->firstOrFail();
        $this->assertSame('subscribed', $subscriber->status);

        $message = EmailMessage::where('event', 'newsletter_welcome')->firstOrFail();
        $this->assertSame('sent', $message->status);
        $this->assertStringContainsString('/unsubscribe/'.$subscriber->token, $message->metadata['unsubscribe_url']);

        $this->postJson('/api/v1/newsletter/unsubscribe/'.$subscriber->token)
            ->assertOk()
            ->assertJsonPath('email', 'subscriber@example.com');

        $this->assertSame('unsubscribed', $subscriber->fresh()->status);
    }

    public function test_manager_can_update_smtp_settings_and_preview_a_template(): void
    {
        $manager = $this->makeUser('manager');

        $this->actingAs($manager, 'sanctum')
            ->patchJson('/api/v1/admin/email/settings', [
                'enabled' => true,
                'driver' => 'smtp',
                'host' => 'smtp.example.com',
                'port' => 587,
                'encryption' => 'tls',
                'username' => 'mailer@example.com',
                'password' => 'secret-smtp-password',
                'from_address' => 'no-reply@example.com',
                'from_name' => 'Marketplace',
                'reply_to' => 'support@example.com',
                'footer_note' => 'You are receiving order updates.',
            ])
            ->assertOk()
            ->assertJsonPath('settings.driver', 'smtp')
            ->assertJsonPath('settings.password_set', true);

        $this->assertSame('smtp', MailSetting::current()->driver);
        $this->assertSame('secret-smtp-password', MailSetting::current()->password);

        $template = \App\Models\EmailTemplate::where('event', 'order_placed')->firstOrFail();

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/email/templates/'.$template->id.'/preview', [
                'subject' => 'Preview order {order_number}',
                'body' => '<p>Hello {customer_name}, order {order_number} is confirmed.</p>',
            ])
            ->assertOk()
            ->assertJsonPath('subject', 'Preview order {order_number}')
            ->assertSee('BDP-261026-ABC123');
    }

    public function test_admin_can_compose_a_manual_email_and_view_the_log(): void
    {
        $admin = $this->makeUser('admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/email/compose', [
                'email' => 'manual@example.com',
                'name' => 'Manual Recipient',
                'subject' => 'A personal note',
                'body' => '<p>Hello from the marketplace.</p>',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('email_messages', [
            'to_email' => 'manual@example.com',
            'subject' => 'A personal note',
            'event' => 'manual',
            'status' => 'sent',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/email/messages?search=manual@example.com')
            ->assertOk()
            ->assertJsonFragment(['to_email' => 'manual@example.com']);
    }

    public function test_admin_can_send_a_custom_audience_campaign(): void
    {
        $admin = $this->makeUser('admin');

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/email/campaigns', [
                'subject' => 'Weekend deals',
                'body' => '<p>Fresh deals are live.</p>',
                'audience' => 'custom',
                'emails' => ['one@example.com', 'two@example.com'],
            ])
            ->assertCreated();

        $campaign = EmailCampaign::findOrFail($response->json('campaign.id'));

        $this->assertSame(2, $campaign->recipients_count);
        $this->assertSame(2, EmailMessage::where('campaign_id', $campaign->id)->where('status', 'sent')->count());
        $this->assertSame('sent', $response->json('campaign.status'));
    }

    public function test_email_center_requires_the_email_permission(): void
    {
        $customer = $this->makeUser('customer');

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/admin/email/overview')
            ->assertForbidden();
    }
}
