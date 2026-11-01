<?php

namespace App\Http\Controllers\Api\V1\PublicApi;

use App\Http\Controllers\Controller;
use App\Models\PaymentMethod;
use App\Models\PlatformSetting;
use App\Plugins\Hook;
use Illuminate\Http\JsonResponse;

class SettingController extends Controller
{
    public function index(): JsonResponse
    {
        $logo = PlatformSetting::get('store_logo_path');
        $favicon = PlatformSetting::get('store_favicon_path');

        return response()->json([
            'settings' => [
                'store_name' => PlatformSetting::get('store_name', 'BD Marketplace'),
                'tagline' => PlatformSetting::get('tagline', 'Bangladesh\'s trusted multi-vendor marketplace'),
                'store_logo_path' => $logo,
                'store_logo_url' => $logo ? url('/media/'.$logo) : null,
                'store_favicon_path' => $favicon,
                'store_favicon_url' => $favicon ? url('/media/'.$favicon) : null,
                'announcement' => Hook::applyFilters('home.announcement', PlatformSetting::get('announcement', '')),
                'footer_text' => PlatformSetting::get('footer_text', ''),
                'support_phone' => PlatformSetting::get('support_phone', ''),
                'support_email' => PlatformSetting::get('support_email', ''),
                'support_hours' => PlatformSetting::get('support_hours', 'Saturday–Thursday, 9:00–18:00'),
                'support_address' => PlatformSetting::get('support_address', ''),
                'whatsapp_number' => PlatformSetting::get('whatsapp_number', ''),
                'facebook_url' => PlatformSetting::get('facebook_url', ''),
                'instagram_url' => PlatformSetting::get('instagram_url', ''),
                'youtube_url' => PlatformSetting::get('youtube_url', ''),
                'tiktok_url' => PlatformSetting::get('tiktok_url', ''),
                'linkedin_url' => PlatformSetting::get('linkedin_url', ''),
                'primary_color' => PlatformSetting::get('primary_color', '#f85606'),
                'secondary_color' => PlatformSetting::get('secondary_color', '#0f172a'),
                'font_family' => PlatformSetting::get('font_family', 'inter'),
                'heading_font_family' => PlatformSetting::get('heading_font_family', 'plus-jakarta'),
                'font_scale' => PlatformSetting::get('font_scale', 'comfortable'),
                'content_width' => PlatformSetting::get('content_width', 'wide'),
                'card_radius' => PlatformSetting::get('card_radius', 'soft'),
                'product_columns' => (int) PlatformSetting::get('product_columns', 4),
                'sticky_header' => (bool) PlatformSetting::get('sticky_header', true),
                'show_announcement' => (bool) PlatformSetting::get('show_announcement', true),
                'newsletter_enabled' => (bool) PlatformSetting::get('newsletter_enabled', true),
                'newsletter_title' => PlatformSetting::get('newsletter_title', 'Deals worth opening'),
                'newsletter_text' => PlatformSetting::get('newsletter_text', 'New arrivals, honest deals, and marketplace updates. No spam — unsubscribe any time.'),
                'cod_enabled' => (bool) PlatformSetting::get('cod_enabled', true),
                'tax_enabled' => (bool) PlatformSetting::get('tax_enabled', false),
                'tax_percent' => PlatformSetting::get('tax_percent', '0'),
                'min_order_amount' => PlatformSetting::get('min_order_amount', '0'),
                'free_shipping_note' => PlatformSetting::get('free_shipping_note', ''),
                'currency' => 'BDT',
                'currency_symbol' => PlatformSetting::get('currency_symbol', '৳'),
                'return_policy' => PlatformSetting::get('return_policy', 'Returns are accepted within 7 days of delivery for eligible items.'),
                'privacy_policy' => PlatformSetting::get('privacy_policy', ''),
                'terms_conditions' => PlatformSetting::get('terms_conditions', ''),
                'about' => PlatformSetting::get('about', 'BD Marketplace connects customers with trusted sellers across Bangladesh.'),
                'meta_title' => PlatformSetting::get('meta_title', 'BD Marketplace — Bangladesh\'s multi-vendor marketplace'),
                'meta_description' => PlatformSetting::get('meta_description', 'Shop from verified sellers across Bangladesh with cash on delivery, bKash, Nagad, Rocket, and Bangla QR.'),
                'meta_keywords' => PlatformSetting::get('meta_keywords', 'Bangladesh marketplace, online shopping, bKash, Nagad, cash on delivery'),
                'maintenance_mode' => (bool) PlatformSetting::get('maintenance_mode', false),
                'maintenance_message' => PlatformSetting::get('maintenance_message', 'We are performing scheduled maintenance. Please check back shortly.'),
                'sms_enabled' => (bool) PlatformSetting::get('sms_enabled', false),
                'payment_methods' => PaymentMethod::where('enabled', true)->orderBy('sort_order')->get()
                    ->map(fn (PaymentMethod $method) => [
                        'code' => $method->code,
                        'name' => $method->name,
                        'type' => $method->type,
                        'logo_path' => $method->logo_path,
                    ])->values(),
            ],
        ]);
    }
}
