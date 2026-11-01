<?php

namespace Database\Seeders;

use App\Models\SmsGateway;
use App\Models\SmsTemplate;
use Illuminate\Database\Seeder;

class SmsSeeder extends Seeder
{
    public function run(): void
    {
        SmsGateway::updateOrCreate(
            ['driver' => 'log'],
            [
                'name' => 'Log file (development)',
                'sender_id' => 'BDMARKET',
                'enabled' => true,
                'is_default' => true,
                'config' => null,
            ],
        );

        $templates = [
            ['order_placed', 'Order placed', 'Hi {customer_name}, your {site_name} order {order_number} for Tk {amount} is placed. Payment: {payment_method}. Track it in your account.'],
            ['order_confirmed', 'Order confirmed', 'Your {site_name} order {order_number} has been confirmed by {store_name}. We will update you when it ships.'],
            ['order_processing', 'Order processing', 'Your {site_name} order {order_number} is being packed by {store_name}.'],
            ['order_shipped', 'Order shipped', 'Good news! Your {site_name} order {order_number} has been shipped. Keep your phone nearby for the delivery call.'],
            ['order_delivered', 'Order delivered', 'Your {site_name} order {order_number} has been delivered. Thank you for shopping with us!'],
            ['order_completed', 'Order completed', 'Your {site_name} order {order_number} is complete. We would love your review.'],
            ['order_cancelled', 'Order cancelled', 'Your {site_name} order {order_number} was cancelled. Reason: {reason}. Contact support if you need help.'],
            ['payment_received', 'Payment received', 'Payment of Tk {amount} for {site_name} order {order_number} is confirmed. Thank you!'],
            ['payment_rejected', 'Payment needs attention', 'We could not verify the payment for order {order_number}. Reason: {reason}. Please resubmit from your account or contact support.'],
            ['payment_submitted', 'Payment submitted', 'We received your payment reference for order {order_number}. Verification usually completes within one business day.'],
            ['return_status_changed', 'Return update', 'Your return for order {order_number} is now: {status}. We will contact you if anything else is needed.'],
        ];

        foreach ($templates as [$event, $name, $body]) {
            SmsTemplate::updateOrCreate(['event' => $event], [
                'name' => $name,
                'body' => $body,
                'enabled' => true,
            ]);
        }
    }
}
