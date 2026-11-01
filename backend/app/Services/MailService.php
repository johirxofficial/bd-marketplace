<?php

namespace App\Services;

use App\Jobs\SendEmailMessage;
use App\Mail\MarketplaceMail;
use App\Models\EmailMessage;
use App\Models\EmailTemplate;
use App\Models\MailSetting;
use App\Models\PlatformSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class MailService
{
    /**
     * Every automatic email the platform knows how to send. The value is shown
     * in the admin template editor; the key is stored on email_templates.event.
     */
    public const EVENTS = [
        'welcome' => 'Welcome / account created',
        'password_reset' => 'Password reset link',
        'password_changed' => 'Password changed',
        'account_suspended' => 'Account suspended',
        'seller_application' => 'Seller application received (customer)',
        'seller_application_staff' => 'New seller application (staff)',
        'seller_approved' => 'Seller approved',
        'seller_rejected' => 'Seller application rejected',
        'seller_suspended' => 'Seller suspended',
        'order_placed' => 'Order placed (customer)',
        'order_new_seller' => 'New order (seller)',
        'order_confirmed' => 'Order confirmed',
        'order_processing' => 'Order processing',
        'order_ready_to_ship' => 'Order ready to ship',
        'order_shipped' => 'Order shipped',
        'order_delivered' => 'Order delivered',
        'order_completed' => 'Order completed',
        'order_cancelled' => 'Order cancelled',
        'order_status' => 'Order status changed (fallback)',
        'payment_submitted' => 'Payment reference submitted',
        'payment_collected' => 'Payment confirmed',
        'payment_rejected' => 'Payment rejected',
        'shipment_created' => 'Shipment created',
        'shipment_delivered' => 'Shipment delivered',
        'return_requested' => 'Return requested (customer)',
        'return_requested_seller' => 'Return requested (seller)',
        'return_status' => 'Return status changed',
        'return_received' => 'Return received',
        'refund_processed' => 'Refund processed',
        'settlement_created' => 'Settlement prepared',
        'settlement_paid' => 'Settlement paid',
        'product_approved' => 'Product approved',
        'product_rejected' => 'Product rejected',
        'product_moderation' => 'Product awaiting moderation (staff)',
        'review_approved' => 'Review approved',
        'review_rejected' => 'Review rejected',
        'support_reply' => 'Support replied',
        'support_created' => 'Support ticket created',
        'newsletter_welcome' => 'Newsletter welcome',
        'manual' => 'Manual message / campaign',
    ];

    public function settings(): MailSetting
    {
        return MailSetting::current();
    }

    public function enabled(): bool
    {
        try {
            return (bool) $this->settings()->enabled;
        } catch (\Throwable) {
            // During a fresh install the table may not exist yet.
            return false;
        }
    }

    /**
     * Point Laravel's mailer at the database-stored SMTP configuration.
     * Called before every send so an administrator can change SMTP details
     * without editing .env or restarting PHP-FPM.
     */
    public function configure(): MailSetting
    {
        $settings = $this->settings();
        $driver = $settings->isSmtp() ? 'smtp' : 'log';

        $config = [
            'mail.default' => $driver,
            'mail.from.address' => $settings->from_address ?: config('mail.from.address'),
            'mail.from.name' => $settings->from_name ?: config('mail.from.name'),
        ];

        if ($driver === 'smtp') {
            $encryption = in_array($settings->encryption, ['tls', 'ssl'], true) ? $settings->encryption : null;
            $config += [
                'mail.mailers.smtp.host' => $settings->host ?: '127.0.0.1',
                'mail.mailers.smtp.port' => $settings->port ?: 587,
                'mail.mailers.smtp.encryption' => $encryption,
                'mail.mailers.smtp.username' => $settings->username,
                'mail.mailers.smtp.password' => $settings->password,
                'mail.mailers.smtp.timeout' => 20,
            ];
        }

        config($config);

        // The mail manager caches resolved mailers for the request. Purge so a
        // queued worker or a long-running process picks up the current config.
        Mail::purge();

        return $settings;
    }

    /**
     * Queue a templated event email. Returns null when mail is disabled, the
     * template is disabled/missing, or the recipient has no email address.
     *
     * @param  array<string, string|int|float|null>  $replacements
     * @param  array<string, mixed>  $options
     */
    public function sendEvent(User|string|Model $recipient, string $event, array $replacements = [], ?Model $related = null, array $options = []): ?EmailMessage
    {
        if (! $this->enabled()) {
            return null;
        }

        $template = EmailTemplate::where('event', $event)->where('enabled', true)->first();

        if (! $template) {
            return null;
        }

        [$email, $name, $user] = $this->resolveRecipient($recipient);

        if (! $email) {
            return null;
        }

        $values = $this->baseReplacements($user) + $replacements;
        $subject = $this->replace($template->subject, $values);
        $body = $this->replace($template->body, $values);
        $unsubscribeUrl = $replacements['unsubscribe_url'] ?? ($user?->id ? $this->unsubscribeUrl($user) : null);

        return $this->queue(
            email: $email,
            name: $name,
            subject: $subject,
            body: $body,
            event: $event,
            related: $related,
            user: $user,
            metadata: [
                'template_id' => $template->id,
                'unsubscribe_url' => $unsubscribeUrl,
            ],
        );
    }

    /**
     * Queue a manual/campaign email. Body is trusted administrator HTML.
     */
    public function sendManual(
        string $email,
        ?string $name,
        string $subject,
        string $body,
        ?int $userId = null,
        ?int $campaignId = null,
        ?string $unsubscribeUrl = null,
    ): EmailMessage {
        $this->configure();

        return $this->queue(
            email: $email,
            name: $name,
            subject: $subject,
            body: $body,
            event: 'manual',
            related: null,
            user: $userId ? User::find($userId) : null,
            metadata: [
                'campaign_id' => $campaignId,
                'unsubscribe_url' => $unsubscribeUrl,
            ],
            campaignId: $campaignId,
        );
    }

    public function sendTest(string $email, ?string $name = null): EmailMessage
    {
        $settings = $this->settings();
        $storeName = PlatformSetting::get('store_name', config('app.name', 'Marketplace'));

        return $this->sendManual(
            $email,
            $name,
            "Test email from {$storeName}",
            '<p>Hi'.($name ? ' '.e($name) : '').',</p>'
            .'<p>This is a test message from your marketplace mail system.</p>'
            .'<p>If you can read this, the current mail configuration can deliver email.</p>'
            .'<p style="color:#64748b;font-size:13px">Driver: <strong>'.e($settings->driver).'</strong>'
            .($settings->isSmtp() ? ' · Host: <strong>'.e($settings->host).'</strong>' : '')
            .'</p>',
        );
    }

    /**
     * Render a stored template body through the branded wrapper (used by the
     * admin preview and the message log).
     *
     * @param  array<string, string|int|float|null>  $replacements
     */
    public function preview(string $body, array $replacements = []): string
    {
        $values = $this->baseReplacements() + $this->sampleReplacements() + $replacements;

        return view('emails.marketplace', [
            'bodyHtml' => $this->replace($body, $values),
            'storeName' => PlatformSetting::get('store_name', config('app.name', 'Marketplace')),
            'storeUrl' => rtrim(config('app.frontend_url', config('app.url')), '/'),
            'logoUrl' => $this->logoUrl(),
            'brandColor' => PlatformSetting::get('primary_color', '#f85606'),
            'footerNote' => $this->settings()->footer_note,
            'supportEmail' => PlatformSetting::get('support_email'),
            'unsubscribeUrl' => null,
            'preheader' => null,
        ])->render();
    }

    /**
     * Send an already-queued message. Exposed so the queue job and a manual
     * "retry" action share exactly the same delivery path.
     */
    public function deliver(EmailMessage $message): EmailMessage
    {
        $settings = $this->configure();

        if (! $settings->enabled) {
            $message->update([
                'status' => 'failed',
                'error' => 'Email delivery is disabled in the mail settings.',
                'attempts' => $message->attempts + 1,
                'failed_at' => now(),
            ]);

            return $message->fresh();
        }

        try {
            Mail::to($message->to_email, $message->to_name ?: null)
                ->send(new MarketplaceMail(
                    mailSubject: $message->subject,
                    bodyHtml: $message->body,
                    unsubscribeUrl: $message->metadata['unsubscribe_url'] ?? null,
                ));

            $message->update([
                'status' => 'sent',
                'error' => null,
                'attempts' => $message->attempts + 1,
                'sent_at' => now(),
                'failed_at' => null,
            ]);
        } catch (\Throwable $exception) {
            $message->update([
                'status' => 'failed',
                'error' => Str::limit($exception->getMessage(), 2000),
                'attempts' => $message->attempts + 1,
                'failed_at' => now(),
            ]);

            Log::error('Email delivery failed', [
                'message_id' => $message->id,
                'to' => $message->to_email,
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        }

        return $message->fresh();
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function queue(
        string $email,
        ?string $name,
        string $subject,
        string $body,
        string $event,
        ?Model $related,
        ?User $user,
        array $metadata = [],
        ?int $campaignId = null,
    ): EmailMessage {
        $message = EmailMessage::create([
            'user_id' => $user?->id,
            'campaign_id' => $campaignId,
            'to_email' => $email,
            'to_name' => $name,
            'subject' => Str::limit($subject, 255, ''),
            'body' => $body,
            'event' => $event,
            'status' => 'queued',
            'metadata' => array_filter($metadata, fn ($value) => $value !== null),
            'messageable_type' => $related?->getMorphClass(),
            'messageable_id' => $related?->getKey(),
        ]);

        SendEmailMessage::dispatch($message->id);

        return $message;
    }

    /**
     * @return array{0: ?string, 1: ?string, 2: ?User}
     */
    private function resolveRecipient(User|string|Model $recipient): array
    {
        if ($recipient instanceof User) {
            return [$recipient->email, $recipient->name, $recipient];
        }

        if ($recipient instanceof Model) {
            $email = trim((string) $recipient->getAttribute('email'));

            if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                return [null, null, null];
            }

            $user = User::where('email', $email)->first();

            return [$email, $recipient->getAttribute('name') ?: $user?->name, $user];
        }

        $email = trim($recipient);

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return [null, null, null];
        }

        $user = User::where('email', $email)->first();

        return [$email, $user?->name, $user];
    }

    /**
     * @return array<string, string>
     */
    private function baseReplacements(?User $user = null): array
    {
        $storeName = PlatformSetting::get('store_name', config('app.name', 'Marketplace'));

        return [
            'site_name' => (string) $storeName,
            'store_name' => (string) $storeName,
            'store_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/'),
            'support_email' => (string) PlatformSetting::get('support_email', ''),
            'customer_name' => $user?->name ?? 'there',
            'customer_email' => $user?->email ?? '',
            'current_year' => (string) now()->year,
        ];
    }

    /**
     * @return array<string, string>
     */
    public function sampleReplacements(): array
    {
        return [
            'order_number' => 'BDP-261026-ABC123',
            'amount' => '৳1,250.00',
            'payment_method' => 'bKash',
            'status' => 'shipped',
            'reason' => 'The payment reference could not be matched.',
            'message' => 'Your order has been updated. Thank you for shopping with us.',
            'action_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/').'/account/orders',
            'tracking_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/').'/account/orders',
            'reset_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/').'/reset-password?token=sample-token&email=customer@example.com',
            'unsubscribe_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/').'/unsubscribe/sample-token',
            'ticket_number' => 'TKT-261026-ABCDE',
            'return_number' => 'RET-261026-ABCDE',
            'settlement_id' => '12',
            'receipt_url' => rtrim((string) config('app.frontend_url', config('app.url')), '/').'/receipts/RCPT-261026-ABC123?token=sample-receipt-token',
        ];
    }

    /**
     * Escape replacement values; admin-authored HTML in the template remains
     * untouched. This prevents customer names, rejection reasons, and store
     * names from injecting markup into an email.
     *
     * @param  array<string, string|int|float|null>  $values
     */
    private function replace(string $text, array $values): string
    {
        $safe = [];
        foreach ($values as $key => $value) {
            $safe['{'.$key.'}'] = e((string) ($value ?? ''));
        }

        return strtr($text, $safe);
    }

    private function logoUrl(): ?string
    {
        $path = PlatformSetting::get('store_logo_path');

        return $path ? url('/media/'.$path) : null;
    }

    private function unsubscribeUrl(User $user): ?string
    {
        $subscriber = \App\Models\NewsletterSubscriber::where('email', $user->email)->first();

        if (! $subscriber) {
            return null;
        }

        return rtrim((string) config('app.frontend_url', config('app.url')), '/')
            .'/unsubscribe/'.$subscriber->token;
    }
}
