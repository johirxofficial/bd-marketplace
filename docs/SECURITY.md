# Security

This document summarises what is implemented and what is **not** safe yet. The deployment is staging; see [LIMITATIONS.md](LIMITATIONS.md).

## Authentication and authorization

- **SPA authentication:** Laravel Sanctum stateful sessions with CSRF protection (`/sanctum/csrf-cookie`, `X-XSRF-TOKEN`), `SESSION_DRIVER=database`, `SameSite=Lax`.
- **Server-to-server authentication:** Sanctum personal access tokens via `Authorization: Bearer`. Only token hashes are stored; plaintext is shown once.
- **Guest API behaviour:** unauthenticated `/api/v1/*` requests return `401` whether or not the client sends `Accept: application/json`. A regression test covers the previous 500 (`Route [login] not defined`).
- **Roles and permissions:** enforced by middleware (`role`, `permission`) on every admin/seller route. UI hiding is not the control.
- **Ownership checks:** customer order/payment/return routes scope records to the authenticated user; sellers are scoped to their store.
- **Account state:** inactive/suspended users are blocked by the `active` middleware.
- **Rate limits:** general API 120/min per user or IP; login 6/min per email+IP; register 10/hour per IP; password reset 4/min; checkout 12/min; uploads 20/min; support 10/min; payment submission and SMS tests 6/min.
- **Sessions:** invalidated on logout. Password resets invalidate existing sessions. When an administrator sets another user's password, that user's tokens are revoked; an administrator changing their own password keeps only the current token.
- **Admin password actions:** existing passwords are one-way hashes and are never returned by the API or UI. Administrators with `users.manage` can set a new password (strength-checked, audit-logged, owner notified) or email a reset link; reset tokens are never exposed to the administrator.
- **Direct messages:** every read/write checks conversation membership and returns `403` otherwise. Suspended accounts are excluded from user search and cannot be messaged. Message bodies are plain text and are not logged in the audit trail.

Not implemented: 2FA/MFA, SSO, email verification gate, login anomaly detection, account lockout beyond rate limiting.

## Secret handling

- `APP_KEY` encrypts:
  - payment method config (`PaymentMethod.config` — including SSLCommerz passwords and bKash App Secret/API password);
  - SMTP password (`mail_settings.password`);
  - SMS gateway credentials;
  - plugin configuration;
  - webhook signing secrets.
- Webhook secrets are `$hidden` from model serialization.
- Admin APIs mask secrets: `store_password`, `api_key`, `api_secret`, `app_secret`, and `password` are returned blank with `has_*` flags. Blank values on update preserve the existing secret.
- Tokens are hashed by Sanctum. `.admin-credentials`, `.demo-credentials`, `.db-credentials` are mode `600`.
- Payment/SMS/provider secrets are never included in public settings or customer payment payloads (`publicConfig()` allow-list).
- Receipt links use a 48-character per-receipt token compared with `hash_equals`; without a token, only the owning customer or staff can read the receipt. Treat receipt URLs as sensitive because they contain customer/order details.

Operational requirements:

- Never commit `.env`, credential files, or database dumps.
- Rotate any credential that has appeared in a screenshot, ticket, chat, or log.
- Do not log request bodies containing card data. The platform does not accept card numbers; hosted payments redirect to SSLCommerz.
- Back up `APP_KEY` securely: losing it makes encrypted config and webhook secrets unrecoverable.

## Upload security

- Uploads are validated server-side by MIME type (JPEG/PNG/WebP), not file extension alone.
- Maximum 5 MB per image; PHP allows 8 MB uploads / 12 MB POST.
- Files receive random 32-character names and are stored outside the web root under `storage/app/uploads/YYYY/MM`.
- Media is streamed by Laravel (`/media/...`) with `X-Content-Type-Options: nosniff`.
- There is **no plugin/admin code upload** feature.
- Product/branding images are public by design; do not upload sensitive documents.

## HTTP and browser controls

Laravel's `SecurityHeaders` middleware sets:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'`
- `Strict-Transport-Security` **only when the request is HTTPS** (so it is absent on the current HTTP staging host).

Nginx serves the SPA, blocks dotfiles, enforces `client_max_body_size 12m`, and passes `/media/` to Laravel so uploads cannot be executed. PHP execution is limited to `index.php` through the front controller.

Gaps: no WAF/CDN, no TLS, no HSTS on HTTP, `style-src` allows inline styles (needed by the theme), and CSP is not nonce-based.

## Webhooks

- Signed with HMAC-SHA256 over the raw body; header `X-BD-Signature: sha256=<hex>`.
- Receivers must verify with a constant-time comparison and reject mismatches.
- Delivery retries 3 times / 60 seconds; at-least-once semantics.
- URLs may currently be HTTP (staging); require HTTPS in production.
- No IP allow-list, replay protection, or automatic pause on repeated failures. Handlers should be idempotent.

## Auditing and monitoring

- Audited actions include: payment verified/rejected, settings updated, payment method updated, SMS gateway/template changes, plugin sync/toggle, API token create/revoke, webhook create/update/delete, product moderation, order cancellation, refunds, settlements, user status/role changes.
- Audit entries record actor, target, before/after values, IP, and user agent where applicable.
- Monitor `laravel.log`, `queue.log`, Nginx logs, and the audit log. Alert on spikes in 401/403/429 and payment rejection rates.

## Payment-specific risks

- Manual MFS/QR payments are verified by **humans**. Fraud controls are procedural: match the merchant statement, check sender/transaction ID, never trust screenshots, and reconcile daily.
- Seeded merchant numbers are placeholders — paying them would send money to the wrong account.
- Bangla QR payload compatibility is not certified with a bank/PSP.
- Hosted SSLCommerz is disabled and unverified; do not accept real cards until configured and tested.
- Refunds are recorded administratively; no gateway refund API is called.

## Reporting a vulnerability

This is a private staging deployment without a public security contact. Report issues directly to the deployment operator. Do not test with real customer data, real payments, or destructive actions.
