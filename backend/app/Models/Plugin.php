<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Plugin extends Model
{
    protected $fillable = [
        'plugin_id', 'name', 'version', 'description', 'author', 'class',
        'enabled', 'config', 'discovered_at',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'config' => 'encrypted:array',
            'discovered_at' => 'datetime',
        ];
    }
}
