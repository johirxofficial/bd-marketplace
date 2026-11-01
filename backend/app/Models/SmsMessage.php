<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class SmsMessage extends Model
{
    protected $fillable = [
        'sms_gateway_id', 'to', 'body', 'event', 'status', 'provider_ref',
        'error', 'messageable_type', 'messageable_id', 'sent_at',
    ];

    protected function casts(): array
    {
        return ['sent_at' => 'datetime'];
    }

    public function gateway(): BelongsTo
    {
        return $this->belongsTo(SmsGateway::class, 'sms_gateway_id');
    }

    public function messageable(): MorphTo
    {
        return $this->morphTo();
    }
}
