<?php

namespace App\Services\Sms\Drivers;

use App\Models\SmsGateway;
use App\Services\Sms\SmsDriver;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class BulkSmsBdDriver implements SmsDriver
{
    public function send(string $to, string $body, SmsGateway $gateway): array
    {
        $config = $gateway->config ?: [];
        $apiKey = $config['api_key'] ?? null;
        $sender = $gateway->sender_id ?: ($config['sender_id'] ?? null);

        if (! $apiKey || ! $sender) {
            throw new RuntimeException('BulkSMSBD API key and sender ID are required.');
        }

        $response = Http::timeout(20)->get($config['endpoint'] ?? 'http://bulksmsbd.net/api/smsapi', [
            'api_key' => $apiKey,
            'type' => 'text',
            'number' => $to,
            'senderid' => $sender,
            'message' => $body,
        ]);

        if (! $response->successful()) {
            throw new RuntimeException('BulkSMSBD responded with HTTP '.$response->status());
        }

        $data = $response->json() ?: [];
        $code = (string) ($data['response_code'] ?? '');

        if ($code !== '' && ! in_array($code, ['202', '200'], true)) {
            throw new RuntimeException('BulkSMSBD rejected the message: '.($data['error_message'] ?? $code));
        }

        return [
            'reference' => $data['message_id'] ?? null,
            'response' => $data,
        ];
    }

    public function name(): string
    {
        return 'bulksmsbd';
    }
}
