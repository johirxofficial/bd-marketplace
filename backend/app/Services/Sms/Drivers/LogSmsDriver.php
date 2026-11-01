<?php

namespace App\Services\Sms\Drivers;

use App\Models\SmsGateway;
use App\Services\Sms\SmsDriver;
use Illuminate\Support\Facades\Log;

class LogSmsDriver implements SmsDriver
{
    public function send(string $to, string $body, SmsGateway $gateway): array
    {
        Log::channel('single')->info('SMS (log driver)', [
            'to' => $to,
            'body' => $body,
            'gateway' => $gateway->name,
        ]);

        return ['reference' => 'log-'.now()->timestamp, 'response' => ['status' => 'logged']];
    }

    public function name(): string
    {
        return 'log';
    }
}
