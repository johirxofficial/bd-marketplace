<?php

namespace App\Jobs;

use App\Models\EmailMessage;
use App\Services\MailService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class SendEmailMessage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(public int $messageId) {}

    public function handle(MailService $mail): void
    {
        $message = EmailMessage::find($this->messageId);

        if (! $message || $message->status === 'sent') {
            return;
        }

        $mail->deliver($message);
    }

    public function failed(?Throwable $exception): void
    {
        EmailMessage::whereKey($this->messageId)->update([
            'status' => 'failed',
            'error' => $exception ? mb_substr($exception->getMessage(), 0, 2000) : 'Email delivery failed.',
            'failed_at' => now(),
        ]);
    }
}
