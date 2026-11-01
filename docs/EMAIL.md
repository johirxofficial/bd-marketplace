# Email system

The marketplace sends transactional email automatically for every customer-visible status change. SMTP is configured in the admin panel (stored in the database), templates are editable, delivery is queued, and every message is logged.

> **Current staging state:** SMTP is configured against a **Mailtrap sandbox** for verification. Messages leave the application and are captured by Mailtrap, but they are **not delivered to real customer inboxes** until a production SMTP provider is configured. A fresh installation defaults to the `log` driver until an administrator configures SMTP in the admin panel.

## Admin panel

**Admin → Email center** has these sections:

| Section | Purpose |
| --- | --- |
| Overview | Enabled state, driver, recent failures, counts |
| Settings | Enable/disable, driver (`log` or `smtp`), host, port, encryption, username, password, from address/name, reply-to, footer note |
| Templates | Edit subject + HTML body for all events, preview with sample data, enable/disable per event |
| Messages | Delivery log with recipient, event, subject, status, error, timestamps; retry failed messages |
| Compose | Send a one-off message to a user or arbitrary address |
| Campaigns | Send a template/manual message to newsletter subscribers |
| Subscribers | Manage the newsletter list |

Permissions: `email.manage` (admin and manager by default).

## Configuration

SMTP settings are stored in `mail_settings` (single row) and applied at send time, so changes take effect without editing `.env` or restarting PHP-FPM. The password is encrypted at rest and never returned by the API.

Minimum production setup:

1. Open **Admin → Email center → Settings**.
2. Set driver to `smtp`, then host, port, encryption (`tls` on 587 or `ssl` on 465), username, password.
3. Set a verified **From address** and a real **From name**.
4. Save, then use **Send test email** and confirm receipt.
5. Check **Messages** for a `sent` status and any provider error.

`backend/.env` values are only a fallback for a brand-new database; the database row wins once saved. `MAIL_MAILER=log` in `.env` does **not** override the admin setting.

## Automatic events

Every event below has a seeded template and is triggered from application code, not cron:

| Area | Events |
| --- | --- |
| Account | `welcome`, `password_reset`, `password_changed`, `account_suspended` |
| Seller | `seller_application`, `seller_application_staff`, `seller_approved`, `seller_rejected`, `seller_suspended` |
| Orders | `order_placed`, `order_new_seller`, `order_confirmed`, `order_processing`, `order_ready_to_ship`, `order_shipped`, `order_delivered`, `order_completed`, `order_cancelled`, `order_status` (fallback) |
| Payments | `payment_submitted`, `payment_collected`, `payment_rejected` |
| Shipping | `shipment_created`, `shipment_delivered` |
| Returns/refunds | `return_requested`, `return_requested_seller`, `return_status`, `return_received`, `refund_processed` |
| Settlements | `settlement_created`, `settlement_paid` |
| Products | `product_approved`, `product_rejected`, `product_moderation` |
| Reviews | `review_approved`, `review_rejected` |
| Support | `support_created`, `support_reply` |
| Newsletter | `newsletter_welcome` |
| Manual | `manual` |

Receipt links: `order_placed`, `payment_collected`, and `refund_processed` include `{receipt_url}`. See [RECEIPTS.md](RECEIPTS.md).

## Placeholders

Templates support these replacements:

`{site_name}`, `{store_name}`, `{store_url}`, `{support_email}`, `{customer_name}`, `{customer_email}`, `{current_year}`, `{action_url}`, `{unsubscribe_url}`, `{order_number}`, `{amount}`, `{payment_method}`, `{status}`, `{reason}`, `{message}`, `{ticket_number}`, `{return_number}`, `{settlement_id}`, `{receipt_url}`.

Event-specific values are merged over the base set. Unknown placeholders are left untouched so a typo is visible in preview rather than silently blank.

## Delivery and retries

- Sending is queued through `SendEmailMessage` on the database queue; the worker runs as `bd-marketplace-queue.service`.
- Each attempt is recorded in `email_messages` with status (`queued`, `sent`, `failed`), error text, and timestamps.
- Failed messages can be retried from **Admin → Email center → Messages**.
- If the queue worker is stopped, mail queues but is not delivered. Check `systemctl status bd-marketplace-queue.service` first when mail is "missing".
- The transport is synchronous inside the job; a slow SMTP host affects queue throughput, not page load.

## Newsletter and campaigns

- Storefront newsletter signups are double-opt-in friendly: a token-based unsubscribe link is included in every message.
- `GET /api/v1/newsletter/status/{token}` and `POST /api/v1/newsletter/unsubscribe/{token}` are public.
- Campaigns send to active subscribers and record per-recipient messages.
- Bulk sending uses the same queue; throttle or schedule large campaigns to protect deliverability.

## API

All admin endpoints require `permission:email.manage`:

| Method | Endpoint |
| --- | --- |
| `GET` | `/api/v1/admin/email/overview` |
| `GET/PATCH` | `/api/v1/admin/email/settings` |
| `POST` | `/api/v1/admin/email/test` |
| `GET` | `/api/v1/admin/email/templates` |
| `PATCH` | `/api/v1/admin/email/templates/{template}` |
| `POST` | `/api/v1/admin/email/templates/{template}/preview` |
| `GET` | `/api/v1/admin/email/messages` |
| `GET` | `/api/v1/admin/email/messages/{message}` |
| `POST` | `/api/v1/admin/email/messages/{message}/retry` |
| `POST` | `/api/v1/admin/email/compose` |
| `GET/POST` | `/api/v1/admin/email/campaigns` |
| `GET` | `/api/v1/admin/email/campaigns/{campaign}` |
| `GET/POST` | `/api/v1/admin/email/subscribers` |
| `DELETE` | `/api/v1/admin/email/subscribers/{subscriber}` |

## Operational checklist

- [ ] Configure SMTP and send a test message.
- [ ] Send a real password reset and complete it from the inbox.
- [ ] Place a test order and confirm `order_placed` plus the receipt link.
- [ ] Confirm order status, payment, refund, and cancellation emails.
- [ ] Check spam placement and add SPF/DKIM/DMARC records for the sending domain.
- [ ] Keep the queue worker and scheduler running.
- [ ] Review **Messages** for failures after each release.

## Verified in staging

- 39 event templates seeded and editable; all `MailService::EVENTS` keys have a template.
- Automated tests assert `email_messages` rows for order placement, every order status, cancellation, payment collection, product approval/rejection, and password-related flows.
- Admin template editing, preview, test send, message log, and retry endpoints are exercised in `tests/Feature/EmailSystemTest.php`.
- SMTP delivery to the configured **Mailtrap sandbox** is verified: order placed, payment collected, product moderation, and manual test messages all reached the sandbox inbox. A transient Mailtrap rate-limit rejection retried automatically and succeeded on the third attempt.
- **No production SMTP provider has been verified.** Real inbox delivery, bounces/complaints, and SPF/DKIM/DMARC alignment still need to be tested with the provider the business chooses.
