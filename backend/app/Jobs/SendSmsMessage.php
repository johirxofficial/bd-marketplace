<?php

namespace App\Jobs;

use App\Models\SmsMessage;
use App\Services\Sms\SmsManager;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class SendSmsMessage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 30;

    public function __construct(public int $messageId) {}

    public function handle(SmsManager $manager): void
    {
        $message = SmsMessage::with('gateway')->find($this->messageId);

        if (! $message || $message->status === 'sent') {
            return;
        }

        if (! $message->gateway || ! $message->gateway->enabled) {
            $message->update(['status' => 'failed', 'error' => 'No enabled SMS gateway is configured.']);

            return;
        }

        try {
            $result = $manager->driver($message->gateway)->send($message->to, $message->body, $message->gateway);
            $message->update([
                'status' => 'sent',
                'provider_ref' => $result['reference'],
                'error' => null,
                'sent_at' => now(),
            ]);
        } catch (Throwable $e) {
            $message->update(['status' => 'failed', 'error' => $e->getMessage()]);
            report($e);
            throw $e;
        }
    }
}
