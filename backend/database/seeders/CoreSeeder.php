<?php

namespace Database\Seeders;

use App\Models\PlatformSetting;
use Illuminate\Database\Seeder;

/**
 * Seeds the tables a fresh production installation needs: roles, settings,
 * payment methods, SMS templates, email templates, and bundled plugins.
 *
 * It deliberately does not create demo products, sellers, or customers. Use
 * DemoMarketplaceSeeder for a populated demo environment.
 *
 * The seeder is guarded so it can be re-run safely on a live store: once the
 * store_name setting exists, base data is left untouched. This prevents an
 * installer update from resetting branding, payment numbers, SMS/email
 * templates, or plugin state that an administrator has changed.
 */
class CoreSeeder extends Seeder
{
    public function run(): void
    {
        if (PlatformSetting::query()->where('key', 'store_name')->exists()) {
            $this->command?->info('CoreSeeder: base data already present; skipping seed.');

            return;
        }

        $this->call([
            RolePermissionSeeder::class,
            SettingsSeeder::class,
            PaymentMethodSeeder::class,
            SmsSeeder::class,
            EmailSeeder::class,
            PluginSeeder::class,
        ]);
    }
}
