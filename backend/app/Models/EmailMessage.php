<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class EmailMessage extends Model
{
    protected $fillable = [
        'user_id', 'campaign_id', 'to_email', 'to_name', 'subject', 'body', 'event',
        'status', 'provider_ref', 'error', 'attempts', 'messageable_type',
        'messageable_id', 'metadata', 'sent_at', 'failed_at',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'attempts' => 'integer',
            'sent_at' => 'datetime',
            'failed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(EmailCampaign::class, 'campaign_id');
    }

    public function messageable(): MorphTo
    {
        return $this->morphTo();
    }
}
