# Installation and setup

This guide is for a business deploying the marketplace on its own Linux server. It assumes Ubuntu 22.04/24.04 or Debian 12, but the stack (PHP-FPM + Nginx + MySQL + Node build) is portable.

## Requirements

| Component | Minimum | Notes |
| --- | --- | --- |
| OS | Ubuntu 22.04 / Debian 12 | systemd + Nginx |
| PHP | 8.2 (8.3 recommended) | extensions: `bcmath`, `ctype`, `curl`, `dom`, `fileinfo`, `gd` or `imagick`, `intl`, `mbstring`, `openssl`, `pdo_mysql`, `tokenizer`, `xml`, `zip` |
| MySQL | 8.0 | MariaDB 10.6+ generally works |
| Node.js | 20 LTS | only needed to build the SPA |
| Composer | 2.x | only needed to install PHP packages |
| Nginx | 1.18+ | serves the SPA and proxies PHP-FPM |
| TLS | public certificate | required for bKash/SSLCommerz callbacks and secure cookies |

The package intentionally **excludes** `.env`, credentials, `vendor/`, `node_modules/`, build output, logs, uploads, and backups. The installer fetches/builds dependencies and generates secrets.

## Quick install

```bash
# 1. Extract the package
sudo apt install -y unzip
sudo mkdir -p /var/www/marketplace
sudo unzip -q marketplace-setup-*.zip -d /tmp/marketplace-release
sudo cp -a /tmp/marketplace-release/marketplace-setup-*/. /var/www/marketplace/
cd /var/www/marketplace

# 2. Install system packages (example, Ubuntu)
sudo apt update
sudo apt install -y nginx mysql-server php8.3-fpm php8.3-cli php8.3-mysql \
  php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath \
  php8.3-intl php8.3-gd composer nodejs npm

# 3. Run the installer
sudo DOMAIN=marketplace.example.com ADMIN_EMAIL=owner@example.com bash install.sh
```

The installer:

1. creates `backend/.env` (production values, generated `APP_KEY`, random DB password);
2. creates the MySQL database and user when it can connect as root;
3. installs Composer and npm dependencies and builds the storefront;
4. runs migrations and seeds base data (roles, settings, payment methods, SMS/email templates, plugins) — **no demo products or users**;
5. creates the first administrator;
6. installs Nginx, PHP-FPM upload/opcache limits, a queue worker, and a scheduler;
7. caches configuration/routes/views and prints the URL.

Generated passwords are written once to `.install-credentials` (mode `600`). Move them to a password manager and delete the file.

### Installer options

All are environment variables; combine as needed:

```bash
sudo APP_DIR=/srv/shop APP_USER=www-data DOMAIN=shop.example.com \
  APP_URL=https://shop.example.com \
  DB_NAME=shop DB_USER=shop DB_PASSWORD='strong-password' \
  ADMIN_NAME='Shop Owner' ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='strong-password' \
  bash install.sh
```

| Variable | Default |
| --- | --- |
| `APP_DIR` | directory containing `install.sh` |
| `APP_USER` / `APP_GROUP` | `SUDO_USER` (or `www-data`) / `www-data` |
| `DOMAIN` | first server IP |
| `APP_URL` | `https://DOMAIN`, or `http://IP` |
| `DB_NAME` / `DB_USER` | `marketplace` |
| `DB_PASSWORD` | generated |
| `ADMIN_NAME` | `Marketplace Administrator` |
| `ADMIN_EMAIL` | `admin@marketplace.local` |
| `ADMIN_PASSWORD` | generated |
| `PHP_VERSION` | detected from `php` |
| `SKIP_DB_SETUP=1` | skip DB/user creation (use an existing database) |
| `SKIP_BUILD=1` | skip Composer/npm (ship `vendor/`, `node_modules/`, `backend/public/app`) |
| `SKIP_ADMIN=1` | do not create an administrator |

## DNS and TLS

The installer configures HTTP only. Before taking payments or real customer data:

1. Point an `A`/`AAAA` record at the server.
2. Issue a certificate, for example:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d marketplace.example.com
   ```
3. Update `backend/.env`:
   ```
   APP_URL=https://marketplace.example.com
   FRONTEND_URL=https://marketplace.example.com
   SESSION_SECURE_COOKIE=true
   SANCTUM_STATEFUL_DOMAINS=marketplace.example.com
   ```
4. Rebuild caches and restart services:
   ```bash
   cd /var/www/marketplace/backend
   sudo -u www-data php artisan optimize:clear
   sudo -u www-data php artisan config:cache
   sudo systemctl reload nginx
   ```
5. Verify `https://marketplace.example.com/up` returns `200` and that HTTP redirects to HTTPS.

## First-run configuration

Sign in at `/login` with the administrator account, then:

1. **Admin → Settings** — store name, tagline, logo, favicon, support email/phone/address, colours, announcement bar, SEO, legal pages.
2. **Admin → Payment methods** — replace demo wallet numbers and the `DEMO-BILLER` Pay Bill biller with real accounts. Leave `online` (SSLCommerz) and `bkash_online` disabled until credentials are verified. See [PAYMENTS.md](PAYMENTS.md).
3. **Admin → Email center → Settings** — configure SMTP, send a test email, then verify password reset and order emails. See [EMAIL.md](EMAIL.md).
4. **Admin → SMS notifications** — configure a real gateway if SMS is required; otherwise turn SMS off so messages are not queued needlessly. See [SMS.md](SMS.md).
5. **Admin → Shipping zones** — set delivery areas, fees, and free-delivery thresholds for your divisions/districts.
6. **Admin → Categories & brands**, then create seller accounts or approve seller applications.
7. **Admin → Users & roles** — create staff accounts; do not share the owner login.
8. **Admin → Reviews / Support / Coupons & banners** — set policies and moderation habits.

Store settings are database-backed; no redeploy is needed after changing branding.

## Creating sellers and products

- A customer applies at `/sell` (or an admin creates a seller under **Users**).
- The seller completes a store profile in the seller center.
- New products enter `pending`; an admin approves them under **Product moderation**. Approval makes the product visible immediately and emails the seller.
- Every moderation decision is recorded in the audit log.

## Updating an installation

```bash
cd /var/www/marketplace
sudo unzip -q marketplace-update-*.zip -d /tmp/marketplace-update
sudo cp -a /tmp/marketplace-update/marketplace-setup-*/. /var/www/marketplace/
cd frontend && npm ci && npm run build
cd ..
sudo bash install.sh              # preserves .env and data; reinstalls services and migrates
```

The bundled `scripts/deploy.sh` is tailored to `/var/www/bd-marketplace` and the `desktop` user. On another host either adjust `APP_ROOT`/`APP_USER` at the top of the script or use `install.sh` again (it preserves `.env` and data, reinstalls services, runs migrations, and rebuilds caches). Never run `migrate:fresh`, `db:wipe`, or the demo seeder on production.

## Backups

At minimum, back up nightly and store off-host:

```bash
# Database
mysqldump --single-transaction --routines --triggers \
  -u shop -p shop | gzip > /backups/shop-$(date +%F).sql.gz

# Uploads and configuration
tar -czf /backups/shop-files-$(date +%F).tar.gz \
  /var/www/marketplace/backend/storage/app/uploads \
  /var/www/marketplace/backend/.env
```

Test a restore on a separate database before you need it. `.env` contains the application key: without it, encrypted gateway/SMTP secrets cannot be decrypted.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `502 Bad Gateway` | `systemctl status php8.3-fpm`; socket path in the Nginx site must match `PHP_VERSION` |
| `500` on every page | `backend/storage/logs/laravel.log`; usually `.env`, permissions, or a missing `APP_KEY` |
| Storefront loads but API fails | `backend/.env` `APP_URL`/`SANCTUM_STATEFUL_DOMAINS`, then `php artisan config:clear` |
| Emails not delivered | Queue worker running? **Admin → Email center → Messages** for the error; SMTP credentials |
| Payments stay `awaiting_verification` | Staff must verify references in **Admin → Payment verification** |
| bKash callback never arrives | Public HTTPS, `APP_URL` set to it, callback reachable, method enabled with credentials |
| Uploads return `404` | `php artisan storage:link`; Nginx `/media/` location; `storage/app/uploads` permissions |
| Changes do not appear | `php artisan optimize:clear && php artisan config:cache && php artisan route:cache`; hard-refresh the SPA |
| Queue jobs pile up | `systemctl status <site>-queue.service`; `storage/logs/queue.log` |

## Security baseline

- Keep `.env` at mode `640`, owned by the app user, group `www-data`.
- Never expose `backend/storage`, `backend/.env`, or database dumps through Nginx.
- Use unique, long passwords for admin/seller accounts; consider adding 2FA before public launch.
- Keep `APP_DEBUG=false` in production.
- Restrict MySQL to localhost and use a dedicated user.
- Enable a firewall: allow only `22`, `80`, `443`.
- Review **Audit logs** and **Payment verification** regularly.
- Read [SECURITY.md](SECURITY.md) and [LIMITATIONS.md](LIMITATIONS.md) before launch.

## Related documentation

- [Payments](PAYMENTS.md)
- [Receipts](RECEIPTS.md)
- [Email](EMAIL.md)
- [SMS](SMS.md)
- [Operations](OPERATIONS.md)
- [Plugins](PLUGINS.md)
- [Developer API](DEVELOPER_API.md)
- [Settings & branding](SETTINGS_AND_BRANDING.md)
