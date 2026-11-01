<?php

namespace App\Services\Sms\Drivers;

use App\Models\SmsGateway;
use App\Services\Sms\SmsDriver;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class AlphaSmsDriver implements SmsDriver
{
    public function send(string $to, string $body, SmsGateway $gateway): array
    {
        $config = $gateway->config ?: [];
        $apiKey = $config['api_key'] ?? null;

        if (! $apiKey) {
            throw new RuntimeException('Alpha SMS API key is required.');
        }

        $response = Http::timeout(20)->post($config['endpoint'] ?? 'https://api.sms.net.bd/sendsms', [
            'api_key' => $apiKey,
            'msg' => $body,
            'to' => $to,
            'sender_id' => $gateway->sender_id,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('Alpha SMS responded with HTTP '.$response->status());
        }

        $data = $response->json() ?: [];

        if (isset($data['error']) && (int) $data['error'] !== 0) {
            throw new RuntimeException('Alpha SMS rejected the message: '.($data['msg'] ?? 'unknown error'));
        }

        return [
            'reference' => $data['request_id'] ?? $data['data']['request_id'] ?? null,
            'response' => $data,
        ];
    }

    public function name(): string
    {
        return 'alpha';
    }
}
