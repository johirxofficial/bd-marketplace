<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminSettingController extends Controller
{
    private const ALLOWED = [
        // General & branding
        'store_name', 'tagline', 'store_logo_path', 'store_favicon_path', 'announcement',
        'footer_text', 'about', 'support_phone', 'support_email', 'support_hours', 'support_address',
        'whatsapp_number', 'facebook_url', 'instagram_url', 'youtube_url', 'tiktok_url', 'linkedin_url',
        // Appearance
        'primary_color', 'secondary_color', 'currency_symbol',
        'font_family', 'heading_font_family', 'font_scale', 'content_width', 'card_radius',
        'product_columns', 'sticky_header', 'show_announcement',
        // Newsletter
        'newsletter_enabled', 'newsletter_title', 'newsletter_text',
        // Commerce & checkout
        'cod_enabled', 'tax_enabled', 'tax_percent', 'free_shipping_note', 'min_order_amount',
        'order_prefix', 'return_policy',
        // SEO
        'meta_title', 'meta_description', 'meta_keywords',
        // Legal
        'privacy_policy', 'terms_conditions',
        // SMS
        'sms_enabled',
        // Maintenance
        'maintenance_mode', 'maintenance_message',
    ];

    public function __construct(private readonly AuditService $audit) {}

    public function index(): JsonResponse
    {
        return response()->json(['settings' => PlatformSetting::orderBy('group')->orderBy('key')->get()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', 'in:'.implode(',', self::ALLOWED)],
            'settings.*.value' => ['nullable', 'string', 'max:10000'],
        ]);

        foreach ($data['settings'] as $item) {
            $setting = PlatformSetting::firstOrCreate(
                ['key' => $item['key']],
                [
                    'label' => str_replace('_', ' ', ucfirst($item['key'])),
                    'group' => $this->groupFor($item['key']),
                    'type' => $this->typeFor($item['key']),
                ]
            );
            $setting->update(['value' => $item['value']]);
        }

        $this->audit->log('settings.updated', null, [], ['keys' => array_column($data['settings'], 'key')]);

        return response()->json(['message' => 'Settings saved.', 'settings' => PlatformSetting::orderBy('group')->get()]);
    }

    private function groupFor(string $key): string
    {
        return match (true) {
            in_array($key, ['store_name', 'tagline', 'store_logo_path', 'store_favicon_path', 'announcement', 'footer_text', 'about'], true) => 'general',
            in_array($key, ['support_phone', 'support_email', 'support_hours', 'support_address', 'whatsapp_number', 'facebook_url', 'instagram_url', 'youtube_url', 'tiktok_url', 'linkedin_url'], true) => 'contact',
            in_array($key, ['primary_color', 'secondary_color', 'currency_symbol', 'font_family', 'heading_font_family', 'font_scale', 'content_width', 'card_radius', 'product_columns', 'sticky_header', 'show_announcement', 'newsletter_enabled', 'newsletter_title', 'newsletter_text'], true) => 'appearance',
            in_array($key, ['meta_title', 'meta_description', 'meta_keywords'], true) => 'seo',
            in_array($key, ['privacy_policy', 'terms_conditions', 'return_policy'], true) => 'legal',
            in_array($key, ['maintenance_mode', 'maintenance_message'], true) => 'maintenance',
            default => 'commerce',
        };
    }

    private function typeFor(string $key): string
    {
        return match ($key) {
            'cod_enabled', 'tax_enabled', 'sms_enabled', 'maintenance_mode',
            'sticky_header', 'show_announcement', 'newsletter_enabled' => 'boolean',
            'tax_percent', 'min_order_amount' => 'decimal',
            default => 'string',
        };
    }
}
