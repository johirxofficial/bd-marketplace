<?php

namespace App\Jobs;

use App\Models\WebhookDelivery;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Throwable;

class DeliverWebhook implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(public int $deliveryId) {}

    public function handle(): void
    {
        $delivery = WebhookDelivery::with('webhook')->find($this->deliveryId);

        if (! $delivery || $delivery->delivered_at) {
            return;
        }

        $webhook = $delivery->webhook;

        if (! $webhook || ! $webhook->active) {
            $delivery->update(['failed_at' => now(), 'response_body' => 'Webhook is inactive.']);

            return;
        }

        $body = json_encode([
            'id' => $delivery->id,
            'event' => $delivery->event,
            'sent_at' => now()->toIso8601String(),
            'data' => $delivery->payload,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        $signature = hash_hmac('sha256', $body ?: '', $webhook->secret);

        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'Content-Type' => 'application/json',
                    'X-BD-Event' => $delivery->event,
                    'X-BD-Delivery' => (string) $delivery->id,
                    'X-BD-Signature' => 'sha256='.$signature,
                ])
                ->withBody($body ?: '{}', 'application/json')
                ->post($webhook->url);

            $delivery->update([
                'attempts' => $delivery->attempts + 1,
                'response_status' => $response->status(),
                'response_body' => substr($response->body(), 0, 2000),
                'delivered_at' => $response->successful() ? now() : null,
                'failed_at' => $response->successful() ? null : now(),
            ]);

            if (! $response->successful()) {
                throw new \RuntimeException('Webhook endpoint returned HTTP '.$response->status());
            }
        } catch (Throwable $e) {
            $delivery->update([
                'attempts' => $delivery->attempts + 1,
                'failed_at' => now(),
                'response_body' => substr($e->getMessage(), 0, 2000),
            ]);

            report($e);
            throw $e;
        }
    }
}
