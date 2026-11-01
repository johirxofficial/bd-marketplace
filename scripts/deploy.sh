#!/usr/bin/env bash
#
# BD Marketplace — privileged deployment / re-deployment script.
#
# Usage:  sudo bash scripts/deploy.sh
#
# Idempotent. Installs the Nginx site, PHP-FPM limits, systemd units, fixes
# permissions, runs migrations, and rebuilds the Laravel caches. It does NOT
# reseed data and never drops tables.
#
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "This script must run as root: sudo bash scripts/deploy.sh" >&2
  exit 1
fi

APP_ROOT="/var/www/bd-marketplace"
BACKEND="${APP_ROOT}/backend"
APP_USER="desktop"
WEB_GROUP="www-data"
PHP_BIN="/usr/bin/php"
PHP_VERSION="8.3"

echo "==> Validating application tree"
[[ -f "${BACKEND}/.env" ]] || { echo "Missing ${BACKEND}/.env" >&2; exit 1; }
[[ -f "${BACKEND}/public/app/index.html" ]] || { echo "Frontend build missing. Run: cd frontend && npm run build" >&2; exit 1; }

echo "==> Installing Nginx site"
install -m 644 "${APP_ROOT}/deployment/nginx/bd-marketplace.conf" /etc/nginx/sites-available/bd-marketplace
ln -sfn /etc/nginx/sites-available/bd-marketplace /etc/nginx/sites-enabled/bd-marketplace
# This site listens on :8081; :80 is reserved for the Apache2 default page.
# The stock "default" site also declares default_server on :80 and would
# shadow this one. Its file is left untouched in sites-available.
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> Installing PHP-FPM overrides"
install -m 644 "${APP_ROOT}/deployment/php/99-bd-marketplace.ini" \
  "/etc/php/${PHP_VERSION}/fpm/conf.d/99-bd-marketplace.ini"
systemctl restart "php${PHP_VERSION}-fpm"

echo "==> Fixing ownership and permissions"
chown "${APP_USER}:${WEB_GROUP}" "${BACKEND}/.env"
chmod 640 "${BACKEND}/.env"
chown -R "${APP_USER}:${WEB_GROUP}" "${BACKEND}/storage" "${BACKEND}/bootstrap/cache"
find "${BACKEND}/storage" "${BACKEND}/bootstrap/cache" -type d -exec chmod 2775 {} +
find "${BACKEND}/storage" "${BACKEND}/bootstrap/cache" -type f -exec chmod 664 {} +
chmod 600 "${APP_ROOT}/.db-credentials" "${APP_ROOT}/.admin-credentials" "${APP_ROOT}/.demo-credentials" 2>/dev/null || true

echo "==> Installing systemd units"
install -m 644 "${APP_ROOT}/deployment/systemd/bd-marketplace-queue.service" /etc/systemd/system/
install -m 644 "${APP_ROOT}/deployment/systemd/bd-marketplace-scheduler.service" /etc/systemd/system/
install -m 644 "${APP_ROOT}/deployment/systemd/bd-marketplace-scheduler.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable bd-marketplace-queue.service >/dev/null
systemctl restart bd-marketplace-queue.service
systemctl enable bd-marketplace-scheduler.timer >/dev/null
systemctl restart bd-marketplace-scheduler.timer

echo "==> Running migrations"
runuser -u "${APP_USER}" -- "${PHP_BIN}" "${BACKEND}/artisan" migrate --force --no-interaction

echo "==> Rebuilding caches"
runuser -u "${APP_USER}" -- "${PHP_BIN}" "${BACKEND}/artisan" optimize:clear
runuser -u "${APP_USER}" -- "${PHP_BIN}" "${BACKEND}/artisan" config:cache
runuser -u "${APP_USER}" -- "${PHP_BIN}" "${BACKEND}/artisan" route:cache
runuser -u "${APP_USER}" -- "${PHP_BIN}" "${BACKEND}/artisan" view:cache
runuser -u "${APP_USER}" -- "${PHP_BIN}" "${BACKEND}/artisan" storage:link >/dev/null 2>&1 || true

echo "==> Restarting queue worker"
systemctl restart bd-marketplace-queue.service

echo "==> Service status"
systemctl --no-pager --lines=0 status nginx "php${PHP_VERSION}-fpm" bd-marketplace-queue.service bd-marketplace-scheduler.timer | grep -E "^(●|   Active)" || true

echo
echo "Deployment applied."
echo "  Storefront: http://172.16.155.22/"
echo "  Health:     http://172.16.155.22/up"
