<?php

namespace Database\Seeders;

use App\Models\PaymentMethod;
use Illuminate\Database\Seeder;

class PaymentMethodSeeder extends Seeder
{
    public function run(): void
    {
        $storeName = (string) config('app.name', 'BD Marketplace');

        $methods = [
            [
                'code' => 'cod',
                'name' => 'Cash on Delivery',
                'provider' => 'cod',
                'type' => 'cod',
                'mode' => 'manual',
                'description' => 'Pay the courier in cash when your parcel arrives.',
                'instructions' => 'Pay {amount} in cash to the delivery agent when your order arrives. Please keep the exact amount ready if possible.',
                'enabled' => true,
                'sort_order' => 1,
                'config' => null,
            ],
            [
                'code' => 'bkash',
                'name' => 'bKash',
                'provider' => 'bkash',
                'type' => 'mfs',
                'mode' => 'manual',
                'description' => 'Send money to our bKash merchant account, then submit the transaction ID.',
                'instructions' => "1. Open bKash and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use {order_number} as the reference.\n4. Submit the bKash transaction ID below. We verify payments during business hours.",
                'enabled' => true,
                'sort_order' => 2,
                'config' => [
                    'merchant_number' => '01700000001',
                    'merchant_name' => $storeName,
                    'account_type' => 'Merchant',
                ],
            ],
            [
                'code' => 'nagad',
                'name' => 'Nagad',
                'provider' => 'nagad',
                'type' => 'mfs',
                'mode' => 'manual',
                'description' => 'Send money to our Nagad account, then submit the transaction ID.',
                'instructions' => "1. Open Nagad and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use {order_number} as the reference.\n4. Submit the Nagad transaction ID below. We verify payments during business hours.",
                'enabled' => true,
                'sort_order' => 3,
                'config' => [
                    'merchant_number' => '01700000002',
                    'merchant_name' => $storeName,
                    'account_type' => 'Merchant',
                ],
            ],
            [
                'code' => 'rocket',
                'name' => 'Rocket (DBBL)',
                'provider' => 'rocket',
                'type' => 'mfs',
                'mode' => 'manual',
                'description' => 'Send money via Rocket, then submit the transaction ID.',
                'instructions' => "1. Open Rocket and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use {order_number} as the reference.\n4. Submit the Rocket transaction ID below. We verify payments during business hours.",
                'enabled' => true,
                'sort_order' => 4,
                'config' => [
                    'merchant_number' => '01700000003',
                    'merchant_name' => $storeName,
                    'account_type' => 'Merchant',
                ],
            ],
            [
                'code' => 'banglaqr',
                'name' => 'Bangla QR',
                'provider' => 'banglaqr',
                'type' => 'qr',
                'mode' => 'manual',
                'description' => 'Scan the Bangla QR with any supported bank or MFS app.',
                'instructions' => "1. Scan the QR code on the order page with your bank app or MFS app.\n2. Confirm the merchant name and the amount shown ({amount}).\n3. Complete the payment and keep the reference.\n4. Submit the transaction reference below for verification.",
                'enabled' => true,
                'sort_order' => 5,
                'config' => [
                    'merchant_number' => '01700000004',
                    'merchant_name' => $storeName,
                    'account_type' => 'Merchant',
                    'qr_merchant_name' => $storeName,
                    'qr_merchant_city' => 'Dhaka',
                ],
            ],
            [
                'code' => 'online',
                'name' => 'Card / Online Banking',
                'provider' => 'sslcommerz',
                'type' => 'hosted',
                'mode' => 'sandbox',
                'description' => 'Pay securely with a card, bank account, or internet banking through SSLCommerz.',
                'instructions' => 'You will be redirected to the secure SSLCommerz payment page. Do not close the browser until the payment result is shown.',
                'enabled' => false,
                'sort_order' => 6,
                'config' => [
                    'store_id' => '',
                    'store_password' => '',
                    'sandbox' => true,
                ],
            ],
            [
                'code' => 'bkash_online',
                'name' => 'bKash Online Checkout',
                'provider' => 'bkash',
                'type' => 'hosted',
                'mode' => 'sandbox',
                'description' => 'Pay securely on bKash. You will be redirected to bKash to approve the payment.',
                'instructions' => 'You will be redirected to bKash. Approve the payment with your bKash PIN and return to this site to see the result. Do not close the browser until the payment result is shown.',
                'enabled' => false,
                'sort_order' => 7,
                'config' => [
                    'app_key' => '',
                    'app_secret' => '',
                    'username' => '',
                    'password' => '',
                    'sandbox' => true,
                ],
            ],
            [
                'code' => 'bkash_paybill',
                'name' => 'bKash Pay Bill',
                'provider' => 'bkash_paybill',
                'type' => 'mfs',
                'mode' => 'manual',
                'description' => 'Pay your bill from the bKash app, then submit the Pay Bill transaction ID for verification.',
                'instructions' => "1. Open bKash and choose Pay Bill.\n2. Select biller {biller_name} ({biller_id}).\n3. Enter {amount} as the bill amount and {order_number} as the reference.\n4. Confirm with your bKash PIN and submit the transaction ID below. We verify Pay Bill payments during business hours.",
                'enabled' => true,
                'sort_order' => 8,
                'config' => [
                    'merchant_number' => '01700000001',
                    'merchant_name' => $storeName,
                    'account_type' => 'Pay Bill',
                    'biller_id' => 'DEMO-BILLER',
                    'biller_name' => $storeName,
                ],
            ],
        ];

        foreach ($methods as $method) {
            PaymentMethod::updateOrCreate(['code' => $method['code']], $method);
        }
    }
}
