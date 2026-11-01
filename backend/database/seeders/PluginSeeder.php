<?php

namespace Database\Seeders;

use App\Models\Plugin;
use App\Plugins\PluginManager;
use Illuminate\Database\Seeder;

class PluginSeeder extends Seeder
{
    public function run(): void
    {
        app(PluginManager::class)->sync();

        Plugin::where('plugin_id', 'free-delivery-banner')->update(['enabled' => true]);
    }
}
