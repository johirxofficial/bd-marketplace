# Limitations and production-readiness

This deployment is a **restricted staging environment**. The list below is deliberately blunt: it distinguishes what is implemented and verified from what still needs credentials, infrastructure, or process.

## Must fix before real customers

| # | Limitation | Impact | Required action |
| --- | --- | --- | --- |
| 1 | **No public HTTPS/domain** — served over HTTP at `172.16.155.22` | Credentials and sessions travel unencrypted; no secure cookies/HSTS; bKash/SSLCommerz cannot call back | Provision a domain + TLS, set `APP_URL`/`FRONTEND_URL`, `SESSION_SECURE_COOKIE=true`, update `SANCTUM_STATEFUL_DOMAINS`, re-test |
| 2 | **Real online payments unverified** — bKash Online and SSLCommerz both ship disabled with blank credentials | Hosted card/wallet checkout cannot be used | Obtain merchant credentials, enable sandbox, run full success/fail/cancel/callback tests, then live |
| 3 | **Demo wallet numbers and Pay Bill biller** `01700000001`–`01700000004`, `DEMO-BILLER` | Customers would pay placeholder accounts/billers | Replace with real bKash/Nagad/Rocket/QR merchant numbers and the bKash-issued biller ID |
| 4 | **bKash Pay Bill reconciliation is manual** | Orders stay `awaiting_verification` until staff match references | Keep staff on the verification queue, or complete bKash merchant/biller API onboarding for automatic settlement matching |
| 5 | **Bangla QR not certified** | Bank/PSP apps may not accept the generated EMVCo payload | Confirm payload/tag layout and merchant GUI with the acquiring bank or PSP |
| 6 | **SMS delivery unverified** — only the log driver is configured; `sms_enabled=1` | No customer actually receives SMS; messages are only marked `sent` in the log | Configure a real gateway, test to handsets, monitor delivery/cost |
| 7 | **Production email delivery unverified** — staging uses a Mailtrap sandbox SMTP account | Order/payment/reset emails leave the app but are captured by Mailtrap, not delivered to real customer inboxes | Configure the business's production SMTP under **Admin → Email center**, send tests, add SPF/DKIM/DMARC. See [EMAIL.md](EMAIL.md) |
| 8 | **Manual payment verification is human** | Orders stay `awaiting_verification` until staff act; fraud risk if procedures are skipped | Staff the queue in business hours, enforce statement matching, reconcile daily |
| 9 | **Demo accounts and data** | Publicly known credentials; demo orders/products/transactions remain | Change passwords, delete demo users/orders/products/transactions, rotate `.admin-credentials`/`.demo-credentials` |
| 10 | **No automated backups** | Data loss on failure is unrecoverable | Schedule encrypted off-host MySQL + uploads + `.env` backups and test restores |
| 11 | **No 2FA/MFA** | Admin accounts rely on passwords + rate limiting | Add TOTP/WebAuthn and enforce for staff |

## Feature limitations

### Payments
- Refunds are recorded administratively (`refunds` + status updates); **no gateway refund API** (bKash or SSLCommerz) is called.
- No automated reconciliation against merchant statements, bKash Pay Bill settlements, or SSLCommerz settlements.
- Payment fees are simple fixed/percentage; no tiered or method-specific tax rules.
- COD collection is a record only; no courier cash integration.
- bKash Online Checkout validates callback payment ID, amount, currency, invoice prefix, and executes/status-queries the payment — but **no live/sandbox merchant transaction has been run**.
- No saved cards, subscriptions, instalments, or partial payments.

### Email
- Templates are HTML edited in the admin panel; there is no visual drag-and-drop builder or MJML compilation.
- The transport is synchronous inside the queue job. A slow SMTP host reduces queue throughput.
- No provider webhooks (bounces/complaints), automatic suppression list, or per-domain throttling.
- Campaigns send through the same single queue worker; very large lists need scheduling/throttling.
- Attachment support is not exposed in the UI.
- `{receipt_url}` appears only where the seeded template includes it; editing it out removes the email link (the receipt remains in the account).

### Receipts
- PDF output uses the browser's print dialog ("Save as PDF"); there is no server-side PDF renderer or emailed PDF attachment.
- Receipts are immutable snapshots; corrections require issuing a new receipt, not editing the old one.
- Public links are bearer tokens in URLs; anyone with the link can view the receipt.
- Receipt numbering is time-based; there is no per-store fiscal sequence or VAT invoice compliance layer.

### SMS
- SSL Wireless, BulkSMSBD, and Alpha drivers follow documented HTTP APIs but were **not tested live**; provider response formats may need adjustment.
- No delivery receipts/webhook ingestion, no per-provider failover, no opt-out management, no cost tracking.
- Bodies are plain text truncated at 1,000 chars (provider segment limits apply).
- Queued with a single database-backed worker; throughput is limited.

### Plugins
- **No admin plugin upload/install** by design (would be RCE). Installation requires server access.
- Only two hook points are currently exposed: filter `home.announcement` and action `order.placed`.
- Plugins run with full application privileges and no sandbox.
- No dependency management, version constraints, marketplace, or automatic updates.
- A plugin config blob is one encrypted JSON object; no schema/UI generation.

### Developer API/webhooks
- API token `abilities` (`read`, `*`) are **advisory labels**, not enforced scopes. Tokens inherit the full permissions of the creating user.
- Webhook URLs may be HTTP; no IP allow-list, replay protection, automatic pause, or manual replay UI.
- Retries: 3 attempts, 60-second backoff. No dead-letter queue.
- `return.*`, `settlement.paid`, and `product.approved` are wired at dispatch sites but were not exercised over HTTP in staging.
- No API versioning beyond `/v1`, no OpenAPI schema, no rate limit tiers per token.

### Messaging and account management
- Direct messages are **polled** (5 s open thread, 15 s inbox, 30 s header badge); there are no websockets, typing indicators, or delivery/read receipts beyond the unread counter.
- No group chat, attachments, emoji picker, reactions, block/report, spam scoring, or admin-wide conversation audit. Only the two participants can read a thread.
- A new chat message does **not** send an email or SMS; the recipient sees it on the next poll or page load.
- User search exposes name, email, phone, and role to any signed-in active user (as requested). Tighten this to seller/staff relationships before production if that is too broad.
- Administrators can set a new password or send a reset link, but **cannot view or recover an existing password** — passwords are one-way hashes.
- Password resets are refused for suspended accounts until they are reactivated; tokens are revoked whenever an administrator sets a password.

### Storefront and platform
- English-only, BDT-only, `Asia/Dhaka` only. No multi-currency or localization.
- No server-side rendering: SEO depends on the SPA shell and meta injection; crawlers that do not execute JavaScript see limited content.
- Search is SQL `LIKE`; no typo tolerance, faceting engine, or Elasticsearch/Meilisearch.
- No real-time tracking; shipment events are manual.
- No PWA/offline support or native mobile apps.
- Uploaded images are not resized/optimized; no CDN. The main JS bundle is ~769 KB (196 KB gzipped) and Vite warns about the 500 KB chunk; route-level code splitting is not implemented.
- Local disk storage only; not horizontally scalable without shared storage/queue/cache.
- Queue/cache/session use the database; a single worker. Move to Redis for higher volume.
- Maintenance mode is a **frontend gate only** — the API remains reachable.
- No automated settlement generation; staff create/approve/pay settlements manually.
- Tax is a single percentage toggle; no per-region/product tax engine or accounting integration.
- No automated fraud scoring, velocity checks beyond rate limits, or address validation.

### Operations and quality
- The package now includes a portable installer, `.gitignore`, and a GitHub Actions workflow, but the current staging host is **not** deployed from git and has no CD pipeline. Releases are built and copied in place; rollback relies on backups.
- No automated backups, log rotation policy, uptime monitoring, or alerting configured here.
- Test coverage: **111 tests / 576 assertions**, focused on domain flows; no browser E2E suite and no live gateway/provider tests.
- Accessibility: contrast is auto-corrected for the brand colour, but no WCAG audit or screen-reader testing has been performed.
- Load/performance testing has not been done.

## What *is* verified

- Backend suite passes (111/111, 576 assertions).
- Frontend type-check and production build pass.
- Deployed HTTP smoke tests:
  - admin login, dashboard, and all new admin APIs return `200`;
  - manual bKash checkout → `awaiting_verification` → staff verify → `paid`;
  - bKash Pay Bill order `BDP-261027-OPCIVH` placed, reference submitted, staff-verified, and marked `paid` end-to-end; checkout showed the biller and exact amount, and the order page showed the exact order number;
  - payment-method instructions render neutral wording before an order exists (`the order total`, `your order number`) and the exact amount/order number after checkout;
  - order and payment receipts issued; printable receipt page and account receipt list render;
  - public receipt token works; a wrong token or another customer returns `404`;
  - order detail returns the receipt link, and `order_placed` / `payment_collected` emails contain the same receipt URL;
  - admin product approval works without a rejection reason and emails the seller;
  - Bangla QR payload generated with valid CRC16 (compatibility still unverified);
  - SMS test + order/payment messages through the log gateway;
  - email messages delivered for order placement, payment, cancellation, and moderation through the Mailtrap sandbox; a temporary provider rate-limit rejection retried and sent successfully;
  - plugin disable/enable changes the announcement and hook counts;
  - API token create/list/revoke with one-time plaintext;
  - webhook create/test failure logging/delete;
  - logo upload + `/media/...` serving with correct MIME;
  - direct messaging end-to-end: user search by email, conversation creation, send/reply, unread counts, mark-read, and `403` for outsiders;
  - messaging UI: conversation list, unread badges, thread bubbles/timestamps, composer clearing, and New Message search with role badges;
  - admin account management: detail view without password, name/phone edit, password set with old-token `401`, reset-link email, and role avatars in the users table;
  - dynamic primary/secondary theme and logo rendering in the browser;
  - guest API without JSON `Accept` returns `401` (not `500`).

## Production readiness checklist

- [ ] Domain + TLS + secure cookies; update URLs and stateful domains.
- [ ] Rotate all demo credentials; remove demo data.
- [ ] Replace merchant numbers and the demo Pay Bill biller; confirm each payment method.
- [ ] Configure and test a real SMS gateway; confirm cost and sender mask.
- [ ] Configure SMTP, send a test, and verify password reset/order/refund emails.
- [ ] Configure bKash/SSLCommerz sandbox, then live; test callbacks and reconciliation.
- [ ] Add 2FA for staff and review admin roles.
- [ ] Decide the production messaging policy (open search vs. seller/customer only) and add block/report tooling if needed.
- [ ] Schedule/test off-host backups and document restore.
- [ ] Add uptime/error monitoring and alerting.
- [ ] Load test checkout, payment verification, email/SMS queue.
- [ ] Legal review of privacy/terms/return policies and refund process.
- [ ] Remove or restrict the staging banner/copy.
