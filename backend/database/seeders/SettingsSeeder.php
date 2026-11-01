<?php

namespace Database\Seeders;

use App\Models\PlatformSetting;
use App\Models\ShippingZone;
use Illuminate\Database\Seeder;

class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        $storeName = (string) env('APP_NAME', 'BD Marketplace');

        $settings = [
            ['store_name', $storeName, 'string', 'general', 'Store name'],
            ['tagline', "Bangladesh's trusted multi-vendor marketplace", 'string', 'general', 'Tagline'],
            ['support_phone', '+880 1700 000000', 'string', 'support', 'Support phone'],
            ['support_email', 'support@bdmarketplace.local', 'string', 'support', 'Support email'],
            ['support_hours', 'Saturday–Thursday, 9:00–18:00', 'string', 'support', 'Support hours'],
            ['cod_enabled', '1', 'boolean', 'payments', 'Cash on Delivery enabled'],
            ['tax_enabled', '0', 'boolean', 'payments', 'Tax calculation enabled'],
            ['return_policy', 'Returns are accepted within 7 days of delivery for eligible unused items. Perishable goods, personal care items, and underwear cannot be returned. Refunds for COD orders are processed through manual bank or mobile wallet transfer.', 'string', 'policy', 'Return policy'],
            ['about', $storeName.' connects customers with verified sellers across Bangladesh. We focus on transparent pricing, reliable delivery, and accountable sellers.', 'string', 'general', 'About the marketplace'],
            ['store_logo_path', '', 'string', 'general', 'Store logo path'],
            ['store_favicon_path', '', 'string', 'general', 'Favicon path'],
            ['announcement', '', 'string', 'general', 'Storefront announcement'],
            ['footer_text', $storeName.' connects verified sellers with customers across all 8 divisions of Bangladesh.', 'string', 'general', 'Footer text'],
            ['support_address', 'Level 4, 12 Gulshan Avenue, Dhaka 1212', 'string', 'contact', 'Support address'],
            ['whatsapp_number', '+8801700000000', 'string', 'contact', 'WhatsApp number'],
            ['facebook_url', '', 'string', 'contact', 'Facebook URL'],
            ['instagram_url', '', 'string', 'contact', 'Instagram URL'],
            ['youtube_url', '', 'string', 'contact', 'YouTube URL'],
            ['tiktok_url', '', 'string', 'contact', 'TikTok URL'],
            ['linkedin_url', '', 'string', 'contact', 'LinkedIn URL'],
            ['primary_color', '#f85606', 'string', 'appearance', 'Primary brand colour'],
            ['secondary_color', '#0f172a', 'string', 'appearance', 'Secondary brand colour'],
            ['font_family', 'inter', 'string', 'appearance', 'Body font family'],
            ['heading_font_family', 'plus-jakarta', 'string', 'appearance', 'Heading font family'],
            ['font_scale', 'comfortable', 'string', 'appearance', 'Font size scale'],
            ['content_width', 'wide', 'string', 'appearance', 'Content width'],
            ['card_radius', 'soft', 'string', 'appearance', 'Card corner radius'],
            ['product_columns', '5', 'string', 'appearance', 'Product grid columns'],
            ['sticky_header', '1', 'boolean', 'appearance', 'Sticky storefront header'],
            ['show_announcement', '1', 'boolean', 'appearance', 'Show announcement bar'],
            ['newsletter_enabled', '1', 'boolean', 'appearance', 'Show newsletter signup'],
            ['newsletter_title', 'Deals worth opening', 'string', 'appearance', 'Newsletter title'],
            ['newsletter_text', 'New arrivals, honest deals, and marketplace updates. No spam — unsubscribe any time.', 'string', 'appearance', 'Newsletter description'],
            ['currency_symbol', '৳', 'string', 'appearance', 'Currency symbol'],
            ['tax_percent', '0', 'decimal', 'payments', 'Tax percentage'],
            ['min_order_amount', '0', 'decimal', 'payments', 'Minimum order amount'],
            ['order_prefix', 'BDP', 'string', 'payments', 'Order number prefix'],
            ['free_shipping_note', 'Free delivery on qualifying orders — see your shipping zone at checkout.', 'string', 'payments', 'Free shipping note'],
            ['sms_enabled', '0', 'boolean', 'notifications', 'SMS notifications enabled'],
            ['maintenance_mode', '0', 'boolean', 'maintenance', 'Maintenance mode'],
            ['maintenance_message', 'We are performing scheduled maintenance. Please check back shortly.', 'string', 'maintenance', 'Maintenance message'],
            ['meta_title', $storeName.' — Bangladesh\'s multi-vendor marketplace', 'string', 'seo', 'Meta title'],
            ['meta_description', 'Shop from verified sellers across Bangladesh with cash on delivery, bKash, Nagad, Rocket, and Bangla QR.', 'string', 'seo', 'Meta description'],
            ['meta_keywords', 'Bangladesh marketplace, online shopping, bKash, Nagad, cash on delivery', 'string', 'seo', 'Meta keywords'],
            ['privacy_policy', 'We collect only the information needed to process orders, deliver parcels, provide support, and meet legal obligations. Payment references are stored for reconciliation. We never store full card numbers.', 'string', 'legal', 'Privacy policy'],
            ['terms_conditions', 'By placing an order you confirm that the delivery details are accurate and agree to pay the amount shown at checkout. Sellers are responsible for the accuracy of their listings. Marketplace disputes are handled through support.', 'string', 'legal', 'Terms and conditions'],
        ];
        foreach ($settings as [$key, $value, $type, $group, $label]) {
            PlatformSetting::updateOrCreate(['key' => $key], compact('value', 'type', 'group', 'label'));
        }

        if (ShippingZone::count() > 0) {
            return;
        }

        $zones = [
            ['Dhaka city', 'Dhaka', 'Dhaka', true, 60, 2000, 1, 2],
            ['Dhaka division (outside city)', 'Dhaka', null, false, 100, 2500, 2, 3],
            ['Chattogram', 'Chattogram', null, false, 130, 3000, 3, 5],
            ['Khulna', 'Khulna', null, false, 130, 3000, 3, 5],
            ['Rajshahi', 'Rajshahi', null, false, 130, 3000, 3, 5],
            ['Sylhet', 'Sylhet', null, false, 140, 3000, 3, 5],
            ['Barishal', 'Barishal', null, false, 140, 3000, 4, 6],
            ['Rangpur', 'Rangpur', null, false, 140, 3000, 4, 6],
            ['Mymensingh', 'Mymensingh', null, false, 130, 3000, 3, 5],
            ['Rest of Bangladesh', '*', null, false, 160, 3500, 4, 6],
        ];
        foreach ($zones as [$name, $division, $district, $inside, $fee, $free, $min, $max]) {
            ShippingZone::create([
                'name' => $name, 'division' => $division, 'district' => $district,
                'inside_dhaka' => $inside, 'base_fee' => $fee, 'free_shipping_threshold' => $free,
                'estimated_days_min' => $min, 'estimated_days_max' => $max, 'is_active' => true,
            ]);
        }
    }
}
