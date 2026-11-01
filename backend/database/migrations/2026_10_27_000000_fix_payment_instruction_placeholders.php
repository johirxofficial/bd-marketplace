<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The public payment-method list is rendered before an order exists, so
 * {amount} / {order_number} used to collapse to empty strings and produce
 * text like "Send  to 01700000001". The renderer now substitutes neutral
 * wording, and these templates read correctly both before and after checkout.
 *
 * Only rows that still match the original seeded wording are touched, so an
 * administrator's customised instructions are left alone.
 */
return new class extends Migration
{
    private array $updates = [
        'cod' => [
            'old' => 'Pay {amount} in cash to the delivery agent when you receive order {order_number}. Please keep the exact amount ready if possible.',
            'new' => 'Pay {amount} in cash to the delivery agent when your order arrives. Please keep the exact amount ready if possible.',
        ],
        'bkash' => [
            'old' => "1. Open bKash and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use order {order_number} as the reference.\n4. Submit the bKash transaction ID below. We verify payments during business hours.",
            'new' => "1. Open bKash and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use {order_number} as the reference.\n4. Submit the bKash transaction ID below. We verify payments during business hours.",
        ],
        'nagad' => [
            'old' => "1. Open Nagad and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use order {order_number} as the reference.\n4. Submit the Nagad transaction ID below. We verify payments during business hours.",
            'new' => "1. Open Nagad and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use {order_number} as the reference.\n4. Submit the Nagad transaction ID below. We verify payments during business hours.",
        ],
        'rocket' => [
            'old' => "1. Open Rocket and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use order {order_number} as the reference.\n4. Submit the Rocket transaction ID below. We verify payments during business hours.",
            'new' => "1. Open Rocket and choose Send Money.\n2. Send {amount} to {merchant_number} ({merchant_name}).\n3. Use {order_number} as the reference.\n4. Submit the Rocket transaction ID below. We verify payments during business hours.",
        ],
        'bkash_paybill' => [
            'old' => "1. Open bKash and choose Pay Bill.\n2. Select biller {biller_name} ({biller_id}).\n3. Enter {amount} for bill/order {order_number}.\n4. Confirm with your bKash PIN and submit the transaction ID below. We verify Pay Bill payments during business hours.",
            'new' => "1. Open bKash and choose Pay Bill.\n2. Select biller {biller_name} ({biller_id}).\n3. Enter {amount} as the bill amount and {order_number} as the reference.\n4. Confirm with your bKash PIN and submit the transaction ID below. We verify Pay Bill payments during business hours.",
        ],
    ];

    public function up(): void
    {
        foreach ($this->updates as $code => $change) {
            DB::table('payment_methods')
                ->where('code', $code)
                ->where('instructions', $change['old'])
                ->update(['instructions' => $change['new'], 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        foreach ($this->updates as $code => $change) {
            DB::table('payment_methods')
                ->where('code', $code)
                ->where('instructions', $change['new'])
                ->update(['instructions' => $change['old'], 'updated_at' => now()]);
        }
    }
};
