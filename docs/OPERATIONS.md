# Operations

Everything below assumes the deployment at `/var/www/bd-marketplace` on the staging host (`172.16.155.22`). Commands are run from the repository root unless noted.

## Runtime layout

| Item | Value |
| --- | --- |
| App root | `/var/www/bd-marketplace` |
| Laravel root | `/var/www/bd-marketplace/backend` |
| SPA build | `/var/www/bd-marketplace/backend/public/app` |
| Web root | `/var/www/bd-marketplace/backend/public` |
| Uploads | `backend/storage/app/uploads` (served at `/media/...`) |
| App owner / web group | `desktop` / `www-data` |
| PHP | 8.3 FPM (`/run/php/php8.3-fpm.sock`) |
| Database | MySQL 8, database `bd_marketplace` |
| Web | Nginx 1.18, port 80, HTTP only |
| Queue | database driver; `bd-marketplace-queue.service` |
| Scheduler | `bd-marketplace-scheduler.timer`, runs every minute |

The Nginx site, PHP-FPM overrides, and systemd units are versioned in `deployment/` and installed by the deploy script.

## Services

```bash
systemctl status nginx php8.3-fpm bd-marketplace-queue.service bd-marketplace-scheduler.timer
sudo systemctl restart nginx php8.3-fpm
sudo systemctl restart bd-marketplace-queue.service
sudo systemctl restart bd-marketplace-scheduler.timer
```

Queue worker command:

```
php artisan queue:work --sleep=3 --tries=3 --max-time=3600 --no-interaction
```

It runs as `www-data`, restarts automatically, and writes to `backend/storage/logs/queue.log`.

## Build and deploy

```bash
cd /var/www/bd-marketplace/frontend
npm ci
npm run lint          # tsc --noEmit
npm run build         # Vite → backend/public/app

cd /var/www/bd-marketplace
sudo bash scripts/deploy.sh
```

`deploy.sh` is idempotent and:

1. validates `.env` and the SPA build exist;
2. installs the Nginx site and PHP-FPM overrides, reloads Nginx;
3. fixes ownership/permissions on `.env`, `storage`, `bootstrap/cache`, credentials;
4. installs and restarts the queue/scheduler units;
5. runs `php artisan migrate --force` (never seeds, never drops);
6. clears and rebuilds config/route/view caches;
7. restarts the queue worker.

**Do not run `migrate:fresh` or `db:seed` on this deployment** — they would destroy live data. Seed only a fresh local environment.

After editing backend PHP, caches are rebuilt by the deploy. After editing frontend code, you must rebuild before deploying.

## Smoke checks

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://172.16.155.22:8081/           # 200
curl -sS -o /dev/null -w '%{http_code}\n' http://172.16.155.22:8081/up         # 200
curl -sS http://172.16.155.22:8081/api/v1/settings/public | head -c 300
curl -sS -o /dev/null -w '%{http_code}\n' http://172.16.155.22:8081/app/assets/<hashed>.js
```

API/admin checks need a session cookie + CSRF token (or a bearer token). Unauthenticated API calls must return **401** with either a JSON or HTML `Accept` header — a regression test protects this.

## Logs

| Log | Contents |
| --- | --- |
| `backend/storage/logs/laravel.log` | Application errors, SMS log-driver messages, plugin warnings |
| `backend/storage/logs/queue.log` | Queue worker output |
| `journalctl -u bd-marketplace-queue.service` | Worker lifecycle |
| `/var/log/nginx/access.log`, `/var/log/nginx/error.log` | HTTP traffic |
| Audit log (`audit_logs` table, **Admin → Audit logs**) | Staff actions |

```bash
tail -f /var/www/bd-marketplace/backend/storage/logs/laravel.log
sudo journalctl -u bd-marketplace-queue.service -n 100 --no-pager
```

## Database and credentials

Credentials are **not** in this repository or documentation:

- `.db-credentials` — database name/user/password
- `.admin-credentials` — administrator login
- `.demo-credentials` — demo customer/seller logins

All are mode `600`, owned by `desktop`.

Useful read-only checks:

```bash
cd /var/www/bd-marketplace/backend
php artisan migrate:status
php artisan tinker --execute="echo App\Models\Order::count();"
```

## Backups

**No automated backup is configured.** Before upgrades or data changes, take a database dump and copy uploads:

```bash
cd /var/www/bd-marketplace
# Read credentials from .db-credentials and use them with mysqldump, e.g.:
mysqldump -u <db_user> -p bd_marketplace | gzip > backups/bd_marketplace_$(date +%F_%H%M).sql.gz
tar -czf backups/uploads_$(date +%F_%H%M).tar.gz -C backend/storage/app uploads
```

Store backups off-host, restrict access, and test a restore periodically. `backups/` contains ad-hoc safety archives and is **not** managed by `deploy.sh` or the installer; create your own schedule.

Restore outline (requires downtime):

```bash
sudo systemctl stop bd-marketplace-queue.service
gunzip -c backups/<file>.sql.gz | mysql -u <db_user> -p bd_marketplace
sudo systemctl start bd-marketplace-queue.service
php artisan optimize:clear && php artisan config:cache && php artisan route:cache
```

## Tests

```bash
cd /var/www/bd-marketplace/backend
php artisan optimize:clear
php artisan test --colors=never
```

- `tests/TestCase.php` aborts if the database is anything other than SQLite `:memory:`.
- Expected result: **111 tests / 576 assertions**, all passing.
- Always `optimize:clear` first; cached config can point at the production database.
- After testing, rebuild production caches with `sudo bash scripts/deploy.sh`.

Frontend:

```bash
cd frontend && npm run lint && npm run build
```

## Runbooks

### Verify a manual payment
1. Open **Admin → Payment verification**.
2. Match order, amount, method, sender number, and transaction ID against the merchant statement.
3. **Verify** with an optional bank/merchant reference, or **Reject** with a clear reason (4–300 chars).
4. Confirm the order becomes `paid` (verify) or returns to `unpaid` (reject), and that the customer notification/SMS is logged.
5. Never verify from a screenshot alone.

### Enable real SMS
See [SMS.md](SMS.md). Add credentials, mark one gateway default, enable the master switch, send a test to a real handset, then place a test order.

### Enable online payments
See [PAYMENTS.md](PAYMENTS.md). Requires a public HTTPS domain and verified bKash and/or SSLCommerz credentials. Do not enable hosted methods on the current HTTP staging host.

### Enable email delivery
1. **Admin → Email center → Settings**: driver `smtp`, host, port, encryption, username, password, from address.
2. **Send test email** and confirm receipt.
3. Place a test order; check **Messages** for `order_placed` and the receipt link.
4. Complete a password reset from the inbox.
5. Review the queue worker if messages stay `queued`. See [EMAIL.md](EMAIL.md).

### Reissue or find a receipt
1. The customer opens **Account → Receipts**; staff can open the receipt from the admin order.
2. Receipt links use a public token and should not be posted publicly.
3. Receipts are immutable snapshots. If data was wrong, correct the order and issue the appropriate new receipt rather than editing the snapshot. See [RECEIPTS.md](RECEIPTS.md).

### Reset a user's password (administrator)
1. **Admin → Users**, search the account, then **Manage**.
2. Confirm the identity through order history or another out-of-band check before acting.
3. Prefer **Email reset link** so the owner chooses the password. Use **Set password** only when the user cannot receive email.
4. Setting a password signs the user out on other devices and emails them a “password changed” notice; both actions are in the audit log.
5. Never ask for, store, or send a plaintext password. The old password cannot be viewed. See [MESSAGING.md](MESSAGING.md).

### Investigate a message complaint
The messaging API only lets the two participants read a thread, so support cannot open a conversation from the admin panel. Ask the reporter to forward or screenshot the thread, and use the audit log and account history. Do not add a bypass to the participant check without a written policy.

### Install a plugin
See [PLUGINS.md](PLUGINS.md): add folder → `composer dump-autoload -o` → sync → enable → deploy. No browser uploads.

### Rotate the administrator password
Use the password-reset flow when email works, or:

```bash
cd /var/www/bd-marketplace/backend
php artisan tinker
>>> $u = App\Models\User::where('email','admin@bdmarketplace.test')->first();
>>> $u->password = Illuminate\Support\Facades\Hash::make('new-strong-password');
>>> $u->save();
```

Update `.admin-credentials` afterwards (mode `600`). This rotates one account; also review API tokens and webhook secrets if a credential leak is suspected.

### Revoke a leaked API token / webhook
**Admin → API & webhooks**: revoke the token or delete/rotate the webhook. Rotation stops the old signing secret immediately.

### Clear sessions / force re-login
The session driver is `database`, so clear the `sessions` table during a maintenance window:

```bash
cd /var/www/bd-marketplace/backend
php artisan tinker --execute="Illuminate\Support\Facades\DB::table('sessions')->truncate();"
```

Users must sign in again. API tokens are stored in `personal_access_tokens` and are unaffected.

### Rollback
The source package includes git/CI files, but this staging host is **not** deployed from git and has no built-in release switch. Rolling back means restoring the previous code, SPA build, and database backup. Take a backup before every change. Nginx serves hashed assets, so a rebuilt SPA picks up new filenames automatically.

## Performance notes

- `/app/assets/*` is cached for one year (immutable); `/app/index.html` is always revalidated.
- `opcache` is enabled with timestamp validation (2-second revalidation).
- API rate limits: general 120/min, login 6/min, register 10/hour, password reset 4/min, checkout 12/min, uploads 20/min, support 10/min.
- The queue is database-backed; monitor table growth and worker latency under load. For higher volume, move to Redis and run multiple workers.
