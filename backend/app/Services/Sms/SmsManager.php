<?php

namespace App\Services\Sms;

use App\Models\SmsGateway;
use App\Services\Sms\Drivers\AlphaSmsDriver;
use App\Services\Sms\Drivers\BulkSmsBdDriver;
use App\Services\Sms\Drivers\LogSmsDriver;
use App\Services\Sms\Drivers\SslWirelessDriver;
use InvalidArgumentException;

class SmsManager
{
    /** @var array<string, SmsDriver> */
    private array $drivers;

    public function __construct()
    {
        $this->drivers = [
            'log' => new LogSmsDriver,
            'sslwireless' => new SslWirelessDriver,
            'bulksmsbd' => new BulkSmsBdDriver,
            'alpha' => new AlphaSmsDriver,
        ];
    }

    public function driver(SmsGateway $gateway): SmsDriver
    {
        if (! isset($this->drivers[$gateway->driver])) {
            throw new InvalidArgumentException("Unsupported SMS driver [{$gateway->driver}].");
        }

        return $this->drivers[$gateway->driver];
    }

    /**
     * @return array<string, string>
     */
    public function available(): array
    {
        return [
            'log' => 'Log file (development)',
            'sslwireless' => 'SSL Wireless',
            'bulksmsbd' => 'BulkSMSBD',
            'alpha' => 'Alpha SMS',
        ];
    }
}
