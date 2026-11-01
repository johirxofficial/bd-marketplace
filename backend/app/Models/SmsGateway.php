<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SmsGateway extends Model
{
    protected $fillable = ['name', 'driver', 'sender_id', 'enabled', 'is_default', 'config'];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'is_default' => 'boolean',
            'config' => 'encrypted:array',
        ];
    }

    public function messages(): HasMany
    {
        return $this->hasMany(SmsMessage::class);
    }
}
