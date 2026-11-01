<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MailSetting extends Model
{
    protected $fillable = [
        'enabled', 'driver', 'host', 'port', 'encryption', 'username', 'password',
        'from_address', 'from_name', 'reply_to', 'footer_note',
    ];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'port' => 'integer',
            'password' => 'encrypted',
        ];
    }

    /**
     * The platform has exactly one mail configuration row.
     */
    public static function current(): self
    {
        return static::query()->firstOrCreate([], [
            'enabled' => true,
            'driver' => 'log',
            'from_address' => config('mail.from.address', 'no-reply@example.com'),
            'from_name' => config('mail.from.name', config('app.name', 'Marketplace')),
            'footer_note' => null,
        ]);
    }

    public function isSmtp(): bool
    {
        return $this->driver === 'smtp';
    }
}
