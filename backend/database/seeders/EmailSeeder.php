<?php

namespace Database\Seeders;

use App\Models\EmailTemplate;
use App\Models\MailSetting;
use Illuminate\Database\Seeder;

class EmailSeeder extends Seeder
{
    public function run(): void
    {
        MailSetting::firstOrCreate([], [
            'enabled' => true,
            'driver' => 'log',
            'from_address' => config('mail.from.address', 'no-reply@example.com'),
            'from_name' => config('mail.from.name', 'Marketplace'),
            'footer_note' => 'You are receiving this email because you have an account or placed an order on our marketplace.',
        ]);

        $button = fn (string $label, string $url = '{action_url}') =>
            '<p style="margin:22px 0 22px;"><a class="email-btn" href="'.$url.'" style="display:inline-block;color:#ffffff;font-weight:700;font-size:14px;padding:14px 22px;border-radius:10px;text-decoration:none;">'.e($label).'</a></p>';

        $signature = '<p style="margin:22px 0 0;color:#64748b;">— The {site_name} team</p>';

        $simple = fn (string $intro, string $cta = 'Open your account', string $extra = '', string $note = '') =>
            '<p>Hi {customer_name},</p><p>'.$intro.'</p>'.$extra.$button($cta).($note ? '<p style="font-size:13px;color:#64748b;">'.$note.'</p>' : '').$signature;

        $templates = [
            ['welcome', 'Welcome email', 'Welcome to {site_name}, {customer_name}', $simple(
                'Your account is ready. You can now shop verified sellers, save addresses, track orders, and manage returns in one place.',
                'Start shopping',
                '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Your sign-in email: <strong>{customer_email}</strong></p>',
                'For your security we never ask for your password by email.'
            )],

            ['password_reset', 'Password reset', 'Reset your {site_name} password',
                '<p>Hi {customer_name},</p><p>We received a request to reset the password for your account.</p>'.$button('Reset my password', '{reset_url}')
                .'<p>This link expires in 60 minutes. If you did not request a reset, you can safely ignore this email — your password will not change.</p>'.$signature],

            ['password_changed', 'Password changed', 'Your {site_name} password was changed',
                $simple('The password for your account was changed successfully. If this was you, no action is needed.', 'Review your account', '', 'If you did not make this change, contact support immediately and reset your password.')],

            ['account_suspended', 'Account suspended', 'Your {site_name} account has been suspended',
                $simple('Your account has been suspended by an administrator.', 'Contact support', '<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;"><strong>Reason:</strong> {reason}</p>', 'You can contact support to appeal this decision.')],

            ['seller_application', 'Seller application received', 'We received your seller application',
                $simple('Thank you for applying to sell on {site_name}. Our team is reviewing your store details and will contact you by email.', 'View application status', '', 'Review usually takes 1–3 business days.')],

            ['seller_application_staff', 'New seller application (staff)', 'New seller application: {customer_name}',
                '<p>Hi {customer_name},</p><p>A new seller application needs review.</p><p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">{message}</p>'.$button('Review applications', '{action_url}').$signature],

            ['seller_approved', 'Seller approved', 'Your store is approved 🎉',
                $simple('Your store has been approved. You can now publish products and start receiving orders.', 'Open seller center', '', 'Keep your stock, prices, and shipping details up to date.')],

            ['seller_rejected', 'Seller application rejected', 'Update on your seller application',
                $simple('Thank you for your interest in selling on {site_name}. We are unable to approve your application at this time.', 'Contact support', '<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;"><strong>Reason:</strong> {reason}</p>', 'You may contact support if you believe this decision was made in error.')],

            ['seller_suspended', 'Store suspended', 'Your store has been suspended',
                $simple('Your seller store has been suspended and new orders are paused.', 'Contact support', '<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;"><strong>Reason:</strong> {reason}</p>')],

            ['order_placed', 'Order placed', 'Order {order_number} received',
                $simple('Thank you for your order! We received order <strong>{order_number}</strong> for <strong>{amount}</strong>. It is awaiting seller confirmation.', 'View order',
                    '<table role="presentation" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:0 0 16px;"><tr><td style="padding:4px 0;color:#64748b;">Order</td><td align="right" style="padding:4px 0;font-weight:700;">{order_number}</td></tr><tr><td style="padding:4px 0;color:#64748b;">Total</td><td align="right" style="padding:4px 0;font-weight:700;">{amount}</td></tr><tr><td style="padding:4px 0;color:#64748b;">Payment</td><td align="right" style="padding:4px 0;font-weight:700;">{payment_method}</td></tr></table>'
                    .'<p style="font-size:13px;color:#64748b;">Your printable receipt is ready: <a href="{receipt_url}" style="color:#0f172a;font-weight:700;">view receipt</a>.</p>',
                    'We will email you again when your order is confirmed or shipped.')],

            ['order_new_seller', 'New order (seller)', 'New order {order_number}',
                $simple('You have received a new order for <strong>{amount}</strong>. Please confirm it and prepare the parcel.', 'Open seller orders', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Order <strong>{order_number}</strong> · Payment: <strong>{payment_method}</strong></p>')],

            ['order_confirmed', 'Order confirmed', 'Order {order_number} confirmed',
                $simple('Good news — your order <strong>{order_number}</strong> has been confirmed by the seller.', 'View order')],

            ['order_processing', 'Order processing', 'Order {order_number} is being prepared',
                $simple('Your order <strong>{order_number}</strong> is being packed and prepared for dispatch.', 'Track order')],

            ['order_ready_to_ship', 'Order ready to ship', 'Order {order_number} is ready to ship',
                $simple('Your order <strong>{order_number}</strong> is packed and waiting for the courier.', 'Track order')],

            ['order_shipped', 'Order shipped', 'Order {order_number} has shipped',
                $simple('Your order <strong>{order_number}</strong> is on the way. Keep your phone nearby for the delivery call.', 'Track order', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Status: <strong>{status}</strong></p>')],

            ['order_delivered', 'Order delivered', 'Order {order_number} delivered',
                $simple('Your order <strong>{order_number}</strong> has been delivered. Please confirm receipt in your account so the seller can be settled.', 'Confirm receipt')],

            ['order_completed', 'Order completed', 'Order {order_number} completed',
                $simple('Your order <strong>{order_number}</strong> is complete. We would love to hear what you think.', 'Write a review')],

            ['order_cancelled', 'Order cancelled', 'Order {order_number} cancelled',
                $simple('Order <strong>{order_number}</strong> has been cancelled.', 'View order', '<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;"><strong>Reason:</strong> {reason}</p>', 'Any reserved stock has been released. If you were charged, a refund will follow your payment method.')],

            ['order_status', 'Order status changed', 'Update on order {order_number}',
                $simple('{message}', 'View order', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Current status: <strong>{status}</strong></p>')],

            ['payment_submitted', 'Payment submitted', 'We received your payment reference',
                $simple('Thank you. We received the payment reference for order <strong>{order_number}</strong> and our team will verify it shortly.', 'View payment status', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Amount: <strong>{amount}</strong> · Method: <strong>{payment_method}</strong></p>', 'Verification usually completes within one business day.')],

            ['payment_collected', 'Payment confirmed', 'Payment confirmed for order {order_number}',
                $simple('We confirmed your payment of <strong>{amount}</strong> for order <strong>{order_number}</strong>.', 'View order', '', 'Your payment receipt is ready: <a href="{receipt_url}" style="color:#0f172a;font-weight:700;">view and print it</a>.')],

            ['payment_rejected', 'Payment rejected', 'We could not verify your payment',
                $simple('We could not match the payment reference for order <strong>{order_number}</strong>.', 'Try again', '<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;"><strong>Reason:</strong> {reason}</p>', 'You can submit a new transaction reference from the order page or contact support.')],

            ['shipment_created', 'Shipment created', 'Your parcel is on the way',
                $simple('Order <strong>{order_number}</strong> has been handed to the courier.', 'Track shipment', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">{message}</p>')],

            ['shipment_delivered', 'Shipment delivered', 'Parcel delivered for order {order_number}',
                $simple('Your parcel for order <strong>{order_number}</strong> was delivered. Please confirm receipt in your account.', 'Confirm receipt')],

            ['return_requested', 'Return requested (customer)', 'Return request {return_number} received',
                $simple('We received your return request <strong>{return_number}</strong>. The seller will review it and update you.', 'View order', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Reason: <strong>{reason}</strong></p>')],

            ['return_requested_seller', 'Return requested (seller)', 'New return request {return_number}',
                $simple('A customer requested a return for order <strong>{order_number}</strong>. Please review it from your seller center.', 'Review return', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Reason: <strong>{reason}</strong></p>')],

            ['return_status', 'Return status changed', 'Return {return_number} updated',
                $simple('Your return <strong>{return_number}</strong> is now <strong>{status}</strong>.', 'View return', $note = '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">{message}</p>')],

            ['return_received', 'Return received', 'Return {return_number} received',
                $simple('We received the returned item for <strong>{return_number}</strong>. A refund is now being processed.', 'View order')],

            ['refund_processed', 'Refund processed', 'Refund of {amount} processed',
                $simple('A refund of <strong>{amount}</strong> has been processed for return <strong>{return_number}</strong>.', 'View order', '', 'Your refund receipt is ready: <a href="{receipt_url}" style="color:#0f172a;font-weight:700;">view and print it</a>. The time for the money to appear depends on your bank or mobile wallet.')],

            ['settlement_created', 'Settlement prepared', 'Settlement prepared for {store_name}',
                $simple('A new settlement has been prepared for your store.', 'View settlements', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Settlement: <strong>#{settlement_id}</strong> · Net payable: <strong>{amount}</strong></p>')],

            ['settlement_paid', 'Settlement paid', 'Settlement #{settlement_id} paid',
                $simple('Your settlement has been paid.', 'View settlements', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">Amount: <strong>{amount}</strong> · Method: <strong>{payment_method}</strong></p>')],

            ['product_approved', 'Product approved', 'Your product is live: {message}',
                $simple('Your product <strong>{message}</strong> has been approved and is now visible in the marketplace.', 'View products')],

            ['product_rejected', 'Product rejected', 'Your product needs changes',
                $simple('Your product <strong>{message}</strong> was not approved in its current form.', 'Edit product', '<p style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;"><strong>Reason:</strong> {reason}</p>')],

            ['product_moderation', 'Product awaiting moderation (staff)', 'Product awaiting review: {message}',
                '<p>Hi {customer_name},</p><p>A seller submitted a product for moderation.</p><p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">{message}</p>'.$button('Review products').$signature],

            ['review_approved', 'Review approved', 'Your review is published',
                $simple('Your review ({message}) is now published. Thank you for helping other shoppers.', 'View product')],

            ['review_rejected', 'Review rejected', 'Update on your review',
                $simple('Your review ({message}) was not published because it did not meet our review guidelines.', 'Contact support')],

            ['support_reply', 'Support replied', 'Support replied to ticket {ticket_number}',
                $simple('Our support team replied to your ticket <strong>{ticket_number}</strong>.', 'View conversation', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">{message}</p>')],

            ['support_created', 'Support ticket created', 'We received your support ticket {ticket_number}',
                $simple('Your support ticket <strong>{ticket_number}</strong> has been created. Our team will reply as soon as possible.', 'View ticket', '<p style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;">{message}</p>')],

            ['newsletter_welcome', 'Newsletter welcome', 'Welcome to {site_name} updates',
                $simple('Thanks for subscribing. You will receive new arrivals, curated deals, and marketplace updates — no spam.', 'Start shopping', '', 'You can unsubscribe at any time using the link in the footer.')],
        ];

        foreach ($templates as [$event, $name, $subject, $body]) {
            EmailTemplate::firstOrCreate(
                ['event' => $event],
                ['name' => $name, 'subject' => $subject, 'body' => $body, 'enabled' => true],
            );
        }
    }
}
