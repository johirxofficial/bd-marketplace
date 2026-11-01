<?php

namespace App\Services;

use App\Jobs\DeliverWebhook;
use App\Models\Webhook;
use App\Models\WebhookDelivery;

class WebhookService
{
    public const EVENTS = [
        'order.placed',
        'order.status_changed',
        'payment.submitted',
        'payment.collected',
        'payment.rejected',
        'return.requested',
        'return.status_changed',
        'settlement.paid',
        'product.approved',
    ];

    /**
     * Queue one delivery per matching active webhook.
     *
     * @param  array<string, mixed>  $payload
     */
    public function dispatch(string $event, array $payload): void
    {
        if (! in_array($event, self::EVENTS, true)) {
            return;
        }

        $webhooks = Webhook::where('active', true)->get()
            ->filter(fn (Webhook $webhook) => $webhook->listensFor($event));

        foreach ($webhooks as $webhook) {
            $delivery = WebhookDelivery::create([
                'webhook_id' => $webhook->id,
                'event' => $event,
                'payload' => $payload,
                'attempts' => 0,
            ]);

            $webhook->update(['last_triggered_at' => now()]);
            DeliverWebhook::dispatch($delivery->id);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function samplePayload(string $event): array
    {
        return [
            'event' => $event,
            'sent_at' => now()->toIso8601String(),
            'data' => ['order_number' => 'BDP-SAMPLE-0001', 'amount' => '1000.00'],
        ];
    }
}
