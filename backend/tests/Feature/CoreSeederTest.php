<?php

namespace Tests\Feature;

use App\Models\PaymentMethod;
use App\Models\PlatformSetting;
use Database\Seeders\CoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CoreSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_core_seeder_is_safe_to_rerun_on_a_configured_store(): void
    {
        $this->seed(CoreSeeder::class);

        PlatformSetting::where('key', 'store_name')->update(['value' => 'My Shop']);
        PlatformSetting::where('key', 'primary_color')->update(['value' => '#123456']);
        PlatformSetting::where('key', 'sms_enabled')->update(['value' => '1']);

        $method = PaymentMethod::where('code', 'bkash')->firstOrFail();
        $method->update(['config' => array_merge($method->config, ['merchant_number' => '01899999999'])]);

        $this->seed(CoreSeeder::class);

        $this->assertSame('My Shop', PlatformSetting::get('store_name'));
        $this->assertSame('#123456', PlatformSetting::get('primary_color'));
        $this->assertSame('1', PlatformSetting::where('key', 'sms_enabled')->value('value'));
        $this->assertSame('01899999999', PaymentMethod::where('code', 'bkash')->firstOrFail()->config['merchant_number']);
    }
}
