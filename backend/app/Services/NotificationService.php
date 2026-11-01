<?php

namespace App\Services;

use App\Models\MarketplaceNotification;
use App\Models\User;

class NotificationService
{
    public function __construct(private readonly MailService $mail) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function send(
        User|int $user,
        string $type,
        string $title,
        string $message,
        ?string $actionUrl = null,
        array $data = [],
        ?string $emailEvent = null,
    ): void {
        $recipient = $user instanceof User ? $user : User::find($user);

        MarketplaceNotification::create([
            'user_id' => $recipient?->id ?? ($user instanceof User ? $user->id : $user),
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'action_url' => $actionUrl,
            'data' => $data ?: null,
        ]);

        if (! $recipient) {
            return;
        }

        $event = $emailEvent ?: $this->emailEventFor($type);

        if (! $event) {
            return;
        }

        $absoluteAction = $actionUrl
            ? (str_starts_with($actionUrl, 'http') ? $actionUrl : rtrim((string) config('app.frontend_url', config('app.url')), '/').$actionUrl)
            : null;

        $this->mail->sendEvent($recipient, $event, array_merge($data, [
            'title' => $title,
            'message' => $message,
            'action_url' => $absoluteAction ?: rtrim((string) config('app.frontend_url', config('app.url')), '/'),
            'tracking_url' => $absoluteAction ?: rtrim((string) config('app.frontend_url', config('app.url')), '/'),
            'reason' => $data['reason'] ?? '',
            'status' => $data['status'] ?? '',
        ]));
    }

    /**
     * @param  iterable<User|int>  $users
     * @param  array<string, mixed>  $data
     */
    public function sendMany(iterable $users, string $type, string $title, string $message, ?string $actionUrl = null, array $data = [], ?string $emailEvent = null): void
    {
        foreach ($users as $user) {
            $this->send($user, $type, $title, $message, $actionUrl, $data, $emailEvent);
        }
    }

    private function emailEventFor(string $type): ?string
    {
        return match ($type) {
            'order.placed' => 'order_placed',
            'order.new' => 'order_new_seller',
            'order.cancelled' => 'order_cancelled',
            'order.status' => 'order_status',
            'payment.submitted' => 'payment_submitted',
            'payment.collected' => 'payment_collected',
            'payment.rejected' => 'payment_rejected',
            'shipment.created' => 'shipment_created',
            'shipment.delivered' => 'shipment_delivered',
            'return.requested' => 'return_requested',
            'return.received' => 'return_received',
            'return.status' => 'return_status',
            'refund.processed' => 'refund_processed',
            'settlement.created' => 'settlement_created',
            'settlement.paid' => 'settlement_paid',
            'seller.application' => 'seller_application_staff',
            'seller.approved' => 'seller_approved',
            'seller.rejected' => 'seller_rejected',
            'seller.suspended' => 'seller_suspended',
            'product.approved' => 'product_approved',
            'product.rejected' => 'product_rejected',
            'product.moderation' => 'product_moderation',
            'review.approved' => 'review_approved',
            'review.rejected' => 'review_rejected',
            'support.reply' => 'support_reply',
            'support.created' => 'support_created',
            'account.suspended' => 'account_suspended',
            'password.changed' => 'password_changed',
            default => null,
        };
    }
}
