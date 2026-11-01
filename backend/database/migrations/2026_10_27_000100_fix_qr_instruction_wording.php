<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Follow-up to the placeholder fix: the pre-order QR sentence read
 * "Confirm the merchant name and amount the order total." Only replace the
 * exact original wording so customised instructions are preserved.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('payment_methods')
            ->where('code', 'banglaqr')
            ->where('instructions', "1. Scan the QR code on the order page with your bank app or MFS app.\n2. Confirm the merchant name and amount {amount}.\n3. Complete the payment and keep the reference.\n4. Submit the transaction reference below for verification.")
            ->update([
                'instructions' => "1. Scan the QR code on the order page with your bank app or MFS app.\n2. Confirm the merchant name and the amount shown ({amount}).\n3. Complete the payment and keep the reference.\n4. Submit the transaction reference below for verification.",
                'updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        DB::table('payment_methods')
            ->where('code', 'banglaqr')
            ->where('instructions', "1. Scan the QR code on the order page with your bank app or MFS app.\n2. Confirm the merchant name and the amount shown ({amount}).\n3. Complete the payment and keep the reference.\n4. Submit the transaction reference below for verification.")
            ->update([
                'instructions' => "1. Scan the QR code on the order page with your bank app or MFS app.\n2. Confirm the merchant name and amount {amount}.\n3. Complete the payment and keep the reference.\n4. Submit the transaction reference below for verification.",
                'updated_at' => now(),
            ]);
    }
};
