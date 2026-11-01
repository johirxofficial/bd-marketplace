<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * "Order placed" is sent while the order is still pending seller confirmation,
 * so a subject/body saying "confirmed" and "being prepared" is misleading.
 * Only the original seeded wording is replaced.
 */
return new class extends Migration
{
    public function up(): void
    {
        $template = DB::table('email_templates')->where('event', 'order_placed')->first();

        if (! $template) {
            return;
        }

        $updates = [];

        if ($template->subject === 'Order {order_number} confirmed') {
            $updates['subject'] = 'Order {order_number} received';
        }

        if (str_contains((string) $template->body, 'and it is being prepared.')) {
            $updates['body'] = str_replace(
                'and it is being prepared.',
                'It is awaiting seller confirmation.',
                (string) $template->body,
            );
        }

        if ($updates) {
            $updates['updated_at'] = now();
            DB::table('email_templates')->where('id', $template->id)->update($updates);
        }
    }

    public function down(): void
    {
        $template = DB::table('email_templates')->where('event', 'order_placed')->first();

        if (! $template) {
            return;
        }

        $updates = [];

        if ($template->subject === 'Order {order_number} received') {
            $updates['subject'] = 'Order {order_number} confirmed';
        }

        if (str_contains((string) $template->body, 'It is awaiting seller confirmation.')) {
            $updates['body'] = str_replace(
                'It is awaiting seller confirmation.',
                'and it is being prepared.',
                (string) $template->body,
            );
        }

        if ($updates) {
            $updates['updated_at'] = now();
            DB::table('email_templates')->where('id', $template->id)->update($updates);
        }
    }
};
