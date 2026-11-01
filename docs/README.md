# Marketplace documentation

This index is the starting point for operators, administrators, and developers. Each document distinguishes what has been verified from what still requires external credentials.

## Read in this order

| Document | Audience | Contents |
| --- | --- | --- |
| [INSTALL.md](INSTALL.md) | New operators | Server requirements, portable installer, DNS/TLS, first-run setup, backups, troubleshooting |
| [PAYMENTS.md](PAYMENTS.md) | Operations, finance | Methods, manual verification, bKash Online/Pay Bill, SSLCommerz, fees, Bangla QR |
| [RECEIPTS.md](RECEIPTS.md) | Operations, support | Order/payment/refund receipts, public links, printing, email integration |
| [EMAIL.md](EMAIL.md) | Operations | Automatic status emails, SMTP, templates, queue, message log, campaigns |
| [MESSAGING.md](MESSAGING.md) | Staff, sellers, customers | Direct messages, inbox, unread counts, role avatars, admin account and password management |
| [SMS.md](SMS.md) | Operations | Gateways, templates, drivers, delivery and retries |
| [PLUGINS.md](PLUGINS.md) | Developers | Manifest format, hook API, install/enable workflow |
| [DEVELOPER_API.md](DEVELOPER_API.md) | Integrators | API tokens, webhook signatures, events, retries |
| [SETTINGS_AND_BRANDING.md](SETTINGS_AND_BRANDING.md) | Administrators | Every setting, logo/favicon upload, theming |
| [OPERATIONS.md](OPERATIONS.md) | Operators | Services, deploy, logs, backups, runbooks |
| [SECURITY.md](SECURITY.md) | Everyone | Controls in place, secrets, known gaps |
| [LIMITATIONS.md](LIMITATIONS.md) | Decision makers | What is **not** production-ready |

## System map

```
Browser ──HTTP(S)──► Nginx
                       ├── /            → Laravel SPA shell (backend/public/app/index.html)
                       ├── /app/assets  → hashed Vite assets (1-year cache)
                       ├── /media/...   → Laravel MediaController (uploads outside docroot)
                       ├── /api/v1/...  → Laravel API (Sanctum sessions or bearer tokens)
                       └── /up          → health check
                                         │
                             ┌───────────┴────────────┐
                             │ Laravel 12 (PHP 8.3)   │
                             │ MySQL 8 · database     │
                             │ queue: database        │
                             └───────────┬────────────┘
                                         │
                        <site>-queue.service     (email, SMS, webhooks)
                        <site>-scheduler.timer   (scheduled maintenance/reports)
```

- The SPA is served by Laravel, so browser calls are same-origin (`/api/v1`); no CORS hop is needed.
- Laravel serves uploaded media from `backend/storage/app/uploads` — never from a public directory.
- Queue and scheduler run under systemd. On the bundled staging deployment the units are `bd-marketplace-queue.service` and `bd-marketplace-scheduler.timer`; the portable installer names them after the install directory.
- Transactional email and SMS both use the database queue; if the worker is stopped, both silently accumulate.

## Roles

Roles and permissions are seeded by `RolePermissionSeeder` and enforced **server-side** by the `role` and `permission` middleware.

| Role | Scope |
| --- | --- |
| `admin` | All permissions |
| `manager` | Catalog, orders, payments, refunds, shipping, promotions, reviews, reports, settlements, SMS, email |
| `support` | Dashboard, support tickets, orders, refunds |
| `seller` | Seller center for an approved store |
| `customer` | Shopping, orders, returns, support, messages |

Administrative permissions added with the power features:

- `payments.manage` — verify/reject manual payments, configure methods
- `sms.manage` — gateways, templates, message log, test SMS
- `email.manage` — SMTP, templates, message log, compose, campaigns, subscribers
- `plugins.manage` — list, sync, enable/disable plugins
- `developer.manage` — API tokens and webhooks

## Environments

| Environment | URL | Notes |
| --- | --- | --- |
| Staging (current) | `http://172.16.155.22:8081` | HTTP, private IP, restricted evaluation |
| Local API | `http://localhost:8000` after `php artisan serve` | SQLite/MySQL per `.env` |
| Tests | SQLite `:memory:` only | Guard in `tests/TestCase.php` |

Production `.env` essentials: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://your-domain`, `FRONTEND_URL=https://your-domain`, MySQL database/user, `SESSION_DRIVER=database`, `QUEUE_CONNECTION=database`, `CACHE_STORE=database`, `SESSION_SECURE_COOKIE=true` behind TLS, and `SANCTUM_STATEFUL_DOMAINS` containing the site host.

## Convention notes

- All money is stored/returned as decimal strings and formatted with `৳` in the UI.
- All timestamps are displayed in `Asia/Dhaka`.
- Manual payment/QR/Pay Bill verification is a deliberate two-step human workflow; do not "fix" it by auto-marking orders paid.
- Receipts are immutable snapshots; edits to products, prices, or addresses do not rewrite issued receipts.
- Plugin uploads and arbitrary code execution from the admin UI are intentionally not implemented.
- The base seeder (`CoreSeeder`) is production-safe; `DatabaseSeeder` adds demo data and must not run on a live store.
