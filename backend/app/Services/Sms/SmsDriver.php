<?php

namespace App\Services\Sms;

use App\Models\SmsGateway;

interface SmsDriver
{
    /**
     * @return array{reference: ?string, response: mixed}
     */
    public function send(string $to, string $body, SmsGateway $gateway): array;

    public function name(): string;
}
