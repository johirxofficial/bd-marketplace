<?php

namespace App\Services\Sms\Drivers;

use App\Models\SmsGateway;
use App\Services\Sms\SmsDriver;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class SslWirelessDriver implements SmsDriver
{
    public function send(string $to, string $body, SmsGateway $gateway): array
    {
        $config = $gateway->config ?: [];
        $token = $config['api_token'] ?? null;
        $sid = $gateway->sender_id ?: ($config['sid'] ?? null);

        if (! $token || ! $sid) {
            throw new RuntimeException('SSL Wireless API token and SID are required.');
        }

        $response = Http::timeout(20)->post($config['endpoint'] ?? 'https://smsplus.sslwireless.com/api/v3/send-sms', [
            'api_token' => $token,
            'sid' => $sid,
            'msisdn' => $to,
            'sms' => $body,
            'csms_id' => 'bdm'.now()->format('ymdHis').random_int(100, 999),
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('SSL Wireless responded with HTTP '.$response->status());
        }

        $data = $response->json() ?: [];

        return [
            'reference' => $data['sms_id'] ?? $data['csms_id'] ?? null,
            'response' => $data,
        ];
    }

    public function name(): string
    {
        return 'sslwireless';
    }
}
