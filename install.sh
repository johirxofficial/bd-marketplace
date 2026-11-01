#!/usr/bin/env bash
#
# Marketplace — portable installer for a fresh Linux host.
#
# Run from the extracted package root:
#
#   sudo bash install.sh
#
# Optional environment variables (all have safe defaults):
#
#   APP_DIR=/var/www/marketplace     install/run directory (default: this folder)
#   APP_USER=www-data                owner of application files and queue worker
#   DOMAIN=marketplace.example.com   public hostname (default: server IP / "_")
#   APP_URL=https://example.com      explicit public origin
#   DB_NAME=marketplace              MySQL database
#   DB_USER=marketplace              MySQL user
#   DB_PASSWORD=...                  MySQL password (generated when omitted)
#   ADMIN_NAME="Store Admin"         first administrator name
#   ADMIN_EMAIL=admin@example.com    first administrator email (created when set)
#   ADMIN_PASSWORD=...               administrator password (generated when omitted)
#   PHP_VERSION=8.3                  PHP-FPM major.minor
#   SKIP_DB_SETUP=1                  do not create the MySQL database/user
#   SKIP_BUILD=1                     do not run composer/npm (use existing build)
#   SKIP_ADMIN=1                     do not create an administrator
#
# The script is idempotent: it never overwrites an existing backend/.env, never
# reseeds demo data, never drops tables, and never resets an existing admin
# password. It installs Nginx, PHP-FPM limits, a queue worker, and a scheduler.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"
APP_DIR="$(cd "$APP_DIR" && pwd)"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"
APP_GROUP="${APP_GROUP:-www-data}"
PHP_VERSION="${PHP_VERSION:-$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;' 2>/dev/null || echo 8.3)}"
PHP_BIN="${PHP_BIN:-$(command -v php || echo /usr/bin/php)}"
SITE_NAME="${SITE_NAME:-$(basename "$APP_DIR" | tr -cs 'a-zA-Z0-9-' '-' | sed 's/^-//;s/-$//')}"
SITE_NAME="${SITE_NAME:-marketplace}"
DOMAIN="${DOMAIN:-}"

BACKEND="$APP_DIR/backend"
FRONTEND="$APP_DIR/frontend"
CREDENTIALS="$APP_DIR/.install-credentials"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "This installer must run as root: sudo bash install.sh" >&2
  exit 1
fi

if [[ ! -f "$BACKEND/artisan" ]]; then
  echo "backend/artisan not found under $APP_DIR." >&2
  echo "Run this script from the extracted marketplace package root." >&2
  exit 1
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  sed -n '2,35p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
fi

id "$APP_USER" >/dev/null 2>&1 || { echo "User $APP_USER does not exist." >&2; exit 1; }
getent group "$APP_GROUP" >/dev/null 2>&1 || APP_GROUP="$(id -gn "$APP_USER")"

random_secret() {
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c "${1:-24}" || true
  echo
}

# Read a value from an existing .env without executing it.
env_value() {
  local key="$1"
  [[ -f "$BACKEND/.env" ]] || return 1
  grep -E "^${key}=" "$BACKEND/.env" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

# Replace or append KEY=VALUE in backend/.env without executing it.
set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    index($0, k "=") == 1 {
      if (!done) { print k "=" v; done = 1 }
      next
    }
    { print }
    END { if (!done) print k "=" v }
  ' "$BACKEND/.env" > "$tmp"
  cat "$tmp" > "$BACKEND/.env"
  rm -f "$tmp"
}

as_app() {
  local dir="$1"; shift
  runuser -u "$APP_USER" -- bash -lc "cd $(printf '%q' "$dir") && $(printf '%q ' "$@")"
}

echo "==> Marketplace installer"
echo "    App root: $APP_DIR"
echo "    App user: $APP_USER:$APP_GROUP"
echo "    PHP:      $PHP_VERSION ($PHP_BIN)"

# ---------------------------------------------------------------------------
# 1. Environment file
# ---------------------------------------------------------------------------
FRESH_ENV=0
if [[ -f "$BACKEND/.env" ]]; then
  echo "==> Keeping existing backend/.env (no values overwritten)"
else
  FRESH_ENV=1
  echo "==> Creating backend/.env"

  INSTALL_HOST="${DOMAIN:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
  INSTALL_HOST="${INSTALL_HOST:-_}"
  DOMAIN="$INSTALL_HOST"

  if [[ -z "${APP_URL:-}" ]]; then
    if [[ "$INSTALL_HOST" == "_" || "$INSTALL_HOST" =~ ^[0-9.]+$ ]]; then
      APP_URL="http://${INSTALL_HOST/_/localhost}"
    else
      APP_URL="https://${INSTALL_HOST}"
    fi
  fi

  DB_NAME="${DB_NAME:-marketplace}"
  DB_USER="${DB_USER:-marketplace}"
  DB_PASSWORD="${DB_PASSWORD:-$(random_secret 24)}"

  cp "$BACKEND/.env.example" "$BACKEND/.env"
  set_env APP_NAME "\"${STORE_NAME:-Marketplace}\""
  set_env APP_ENV production
  set_env APP_DEBUG false
  set_env APP_URL "$APP_URL"
  set_env FRONTEND_URL "$APP_URL"
  set_env APP_TIMEZONE Asia/Dhaka
  set_env DB_CONNECTION mysql
  set_env DB_HOST 127.0.0.1
  set_env DB_PORT 3306
  set_env DB_DATABASE "$DB_NAME"
  set_env DB_USERNAME "$DB_USER"
  set_env DB_PASSWORD "$DB_PASSWORD"
  set_env SESSION_DRIVER database
  set_env QUEUE_CONNECTION database
  set_env CACHE_STORE database
  set_env MAIL_MAILER log
  set_env LOG_LEVEL warning
  if [[ "$APP_URL" == https://* ]]; then
    set_env SESSION_SECURE_COOKIE true
  fi
  HOST_FOR_SANCTUM="${DOMAIN/_/localhost}"
  set_env SANCTUM_STATEFUL_DOMAINS "${HOST_FOR_SANCTUM},localhost,127.0.0.1"
fi

APP_URL_EFFECTIVE="$(env_value APP_URL || true)"
DB_NAME_EFFECTIVE="$(env_value DB_DATABASE || echo marketplace)"
DB_USER_EFFECTIVE="$(env_value DB_USERNAME || echo marketplace)"
DB_PASSWORD_EFFECTIVE="$(env_value DB_PASSWORD || true)"

# Derive the Nginx server_name from APP_URL when DOMAIN was not supplied.
if [[ -z "$DOMAIN" && -n "$APP_URL_EFFECTIVE" ]]; then
  DOMAIN="${APP_URL_EFFECTIVE#http://}"
  DOMAIN="${DOMAIN#https://}"
  DOMAIN="${DOMAIN%%/*}"
  DOMAIN="${DOMAIN%%:*}"
fi
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
DOMAIN="${DOMAIN:-_}"

# ---------------------------------------------------------------------------
# 2. Permissions and dependencies
# ---------------------------------------------------------------------------
echo "==> Setting ownership"
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
chmod 640 "$BACKEND/.env"
chmod 600 "$CREDENTIALS" 2>/dev/null || true

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  if [[ ! -d "$BACKEND/vendor" ]]; then
    COMPOSER_BIN="$(command -v composer || true)"
    if [[ -z "$COMPOSER_BIN" ]]; then
      echo "Composer is required to install PHP dependencies." >&2
      echo "Install composer, or ship the vendor/ directory and set SKIP_BUILD=1." >&2
      exit 1
    fi
    echo "==> Installing PHP dependencies"
    as_app "$BACKEND" env "COMPOSER_HOME=/tmp/composer-${APP_USER}" "$COMPOSER_BIN" install --no-dev --optimize-autoloader --no-interaction
  fi

  if [[ ! -f "$BACKEND/public/app/index.html" || -d "$FRONTEND/node_modules" ]]; then
    if ! command -v npm >/dev/null 2>&1; then
      echo "Node.js/npm is required to build the storefront." >&2
      echo "Install Node 20+, or ship node_modules and backend/public/app with SKIP_BUILD=1." >&2
      exit 1
    fi
    echo "==> Building storefront (npm)"
    [[ -d "$FRONTEND/node_modules" ]] || as_app "$FRONTEND" env "npm_config_cache=/tmp/npm-cache-${APP_USER}" npm ci
    as_app "$FRONTEND" env "npm_config_cache=/tmp/npm-cache-${APP_USER}" npm run build
  else
    echo "==> Using prebuilt storefront from backend/public/app"
  fi
fi

if [[ ! -f "$BACKEND/public/app/index.html" ]]; then
  echo "Storefront build missing at backend/public/app/index.html." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 3. Application key and database
# ---------------------------------------------------------------------------
if [[ -z "$(env_value APP_KEY || true)" ]]; then
  echo "==> Generating application key"
  as_app "$BACKEND" "$PHP_BIN" artisan key:generate --force --no-interaction
fi

if [[ "$FRESH_ENV" -eq 1 && "${SKIP_DB_SETUP:-0}" != "1" ]]; then
  echo "==> Creating MySQL database and user"
  if [[ ! "$DB_NAME_EFFECTIVE" =~ ^[A-Za-z0-9_]+$ || ! "$DB_USER_EFFECTIVE" =~ ^[A-Za-z0-9_]+$ ]]; then
    echo "    WARNING: DB_NAME/DB_USER may only contain letters, digits, and underscore." >&2
    echo "    Create the database manually, update backend/.env, then re-run." >&2
  elif [[ "$DB_PASSWORD_EFFECTIVE" == *"'"* ]]; then
    echo "    WARNING: DB_PASSWORD contains a single quote, which this installer cannot safely quote." >&2
    echo "    Create the database/user manually, update backend/.env, then re-run." >&2
  elif mysql -uroot -e 'SELECT 1' >/dev/null 2>&1; then
    mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME_EFFECTIVE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER_EFFECTIVE}'@'localhost' IDENTIFIED BY '${DB_PASSWORD_EFFECTIVE}';
ALTER USER '${DB_USER_EFFECTIVE}'@'localhost' IDENTIFIED BY '${DB_PASSWORD_EFFECTIVE}';
GRANT ALL PRIVILEGES ON \`${DB_NAME_EFFECTIVE}\`.* TO '${DB_USER_EFFECTIVE}'@'localhost';
FLUSH PRIVILEGES;
SQL
    echo "    Database ${DB_NAME_EFFECTIVE} and user ${DB_USER_EFFECTIVE} ready."
  else
    echo "    WARNING: could not connect to MySQL as root." >&2
    echo "    Create the database/user manually, update backend/.env, then re-run." >&2
    echo "    Continuing; migrations may fail." >&2
  fi
fi

echo "==> Running migrations"
as_app "$BACKEND" "$PHP_BIN" artisan migrate --force --no-interaction

echo "==> Seeding base data (roles, settings, payment methods, templates)"
as_app "$BACKEND" "$PHP_BIN" artisan db:seed --class=CoreSeeder --force --no-interaction

if [[ "${SKIP_ADMIN:-0}" != "1" ]]; then
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@marketplace.local}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(random_secret 20)}"
  ADMIN_NAME="${ADMIN_NAME:-Marketplace Administrator}"
  echo "==> Ensuring administrator $ADMIN_EMAIL"
  as_app "$BACKEND" "$PHP_BIN" artisan marketplace:create-admin \
    --name="$ADMIN_NAME" --email="$ADMIN_EMAIL" --password="$ADMIN_PASSWORD" --no-interaction \
    || echo "    Administrator already exists; password left unchanged."
fi

# ---------------------------------------------------------------------------
# 4. Web server, PHP-FPM, systemd
# ---------------------------------------------------------------------------
PHP_SOCK="/run/php/php${PHP_VERSION}-fpm.sock"
if [[ ! -S "$PHP_SOCK" ]]; then
  echo "WARNING: $PHP_SOCK not found. Install php${PHP_VERSION}-fpm or set PHP_VERSION." >&2
fi

echo "==> Installing Nginx site"
NGINX_SITE="/etc/nginx/sites-available/${SITE_NAME}"
LISTEN_DEFAULT=""
REMOVE_STOCK_DEFAULT=0
if [[ "${DOMAIN:-_}" == "_" || "${DOMAIN:-}" =~ ^[0-9.]+$ ]]; then
  LISTEN_DEFAULT=" default_server"
fi

cat > "$NGINX_SITE" <<NGINX
# Generated by install.sh for ${APP_DIR}
server {
    listen 80${LISTEN_DEFAULT};
    listen [::]:80${LISTEN_DEFAULT};

    server_name ${DOMAIN:-_};

    root ${BACKEND}/public;
    index index.php;

    charset utf-8;
    client_max_body_size 12m;

    location ~ /\.(?!well-known).* {
        deny all;
    }

    location ^~ /app/assets/ {
        try_files \$uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        access_log off;
    }

    location = /app/index.html {
        try_files \$uri =404;
        add_header Cache-Control "no-cache, must-revalidate";
        add_header X-Content-Type-Options "nosniff" always;
    }

    location ^~ /app/ {
        try_files \$uri =404;
        add_header X-Content-Type-Options "nosniff" always;
        access_log off;
    }

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:${PHP_SOCK};
        fastcgi_param SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT \$realpath_root;
        fastcgi_read_timeout 60s;
    }

    location ^~ /media/ {
        try_files \$uri /index.php?\$query_string;
        add_header X-Content-Type-Options "nosniff" always;
        access_log off;
    }

    location ~* \.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|eot|css|js|map)\$ {
        try_files \$uri =404;
        expires 7d;
        add_header Cache-Control "public";
        add_header X-Content-Type-Options "nosniff" always;
        access_log off;
    }
}
NGINX

ln -sfn "$NGINX_SITE" "/etc/nginx/sites-enabled/${SITE_NAME}"
if [[ "$LISTEN_DEFAULT" == " default_server" ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

echo "==> Installing PHP-FPM overrides"
if [[ -d "/etc/php/${PHP_VERSION}/fpm/conf.d" ]]; then
  install -m 644 "$APP_DIR/deployment/php/99-bd-marketplace.ini" \
    "/etc/php/${PHP_VERSION}/fpm/conf.d/99-bd-marketplace.ini"
  systemctl restart "php${PHP_VERSION}-fpm"
fi

echo "==> Installing systemd units"
cat > "/etc/systemd/system/${SITE_NAME}-queue.service" <<UNIT
[Unit]
Description=${SITE_NAME} queue worker
After=network-online.target mysql.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
Restart=always
RestartSec=5
WorkingDirectory=${BACKEND}
ExecStart=${PHP_BIN} artisan queue:work --sleep=3 --tries=3 --max-time=3600 --no-interaction
KillSignal=SIGTERM
TimeoutStopSec=30
StandardOutput=append:${BACKEND}/storage/logs/queue.log
StandardError=append:${BACKEND}/storage/logs/queue.log
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=false
ReadWritePaths=${BACKEND}/storage ${BACKEND}/bootstrap/cache

[Install]
WantedBy=multi-user.target
UNIT

cat > "/etc/systemd/system/${SITE_NAME}-scheduler.service" <<UNIT
[Unit]
Description=${SITE_NAME} scheduler
After=network-online.target mysql.service
Wants=network-online.target

[Service]
Type=oneshot
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${BACKEND}
ExecStart=${PHP_BIN} artisan schedule:run --no-interaction
TimeoutStartSec=120
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=false
ReadWritePaths=${BACKEND}/storage ${BACKEND}/bootstrap/cache
UNIT

cat > "/etc/systemd/system/${SITE_NAME}-scheduler.timer" <<UNIT
[Unit]
Description=Run the ${SITE_NAME} scheduler every minute

[Timer]
OnCalendar=*-*-* *:*:00
AccuracySec=15s
Persistent=false
Unit=${SITE_NAME}-scheduler.service

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable "${SITE_NAME}-queue.service" >/dev/null
systemctl restart "${SITE_NAME}-queue.service"
systemctl enable "${SITE_NAME}-scheduler.timer" >/dev/null
systemctl restart "${SITE_NAME}-scheduler.timer"

nginx -t
systemctl reload nginx

# ---------------------------------------------------------------------------
# 5. Final permissions, caches, and summary
# ---------------------------------------------------------------------------
echo "==> Finalising permissions"
chown -R "$APP_USER:$APP_GROUP" "$BACKEND/storage" "$BACKEND/bootstrap/cache"
find "$BACKEND/storage" "$BACKEND/bootstrap/cache" -type d -exec chmod 2775 {} +
find "$BACKEND/storage" "$BACKEND/bootstrap/cache" -type f -exec chmod 664 {} +
chmod 640 "$BACKEND/.env"

echo "==> Rebuilding caches"
as_app "$BACKEND" "$PHP_BIN" artisan optimize:clear
as_app "$BACKEND" "$PHP_BIN" artisan config:cache
as_app "$BACKEND" "$PHP_BIN" artisan route:cache
as_app "$BACKEND" "$PHP_BIN" artisan view:cache
as_app "$BACKEND" "$PHP_BIN" artisan storage:link || true
systemctl restart "${SITE_NAME}-queue.service"

umask 077
{
  echo "Marketplace installation — generated $(date -Is)"
  echo "App root: $APP_DIR"
  echo "Public URL: ${APP_URL_EFFECTIVE:-http://${DOMAIN:-localhost}}"
  echo "Database: ${DB_NAME_EFFECTIVE} / ${DB_USER_EFFECTIVE} / ${DB_PASSWORD_EFFECTIVE:-<from existing .env>}"
  echo "Admin email: ${ADMIN_EMAIL:-<not created>}"
  echo "Admin password: ${ADMIN_PASSWORD:-<unchanged / not created>}"
  echo
  echo "Next: open the site, sign in as the administrator, set the store name,"
  echo "branding, payment numbers, SMTP, and SMS gateway. See docs/INSTALL.md."
} > "$CREDENTIALS"
chmod 600 "$CREDENTIALS"
chown "$APP_USER:$APP_GROUP" "$CREDENTIALS"

echo
echo "Installation complete."
echo "  URL:         ${APP_URL_EFFECTIVE:-http://${DOMAIN:-localhost}}"
echo "  Health:      ${APP_URL_EFFECTIVE:-http://${DOMAIN:-localhost}}/up"
echo "  Credentials: $CREDENTIALS (mode 600)"
echo "  Services:    ${SITE_NAME}-queue.service, ${SITE_NAME}-scheduler.timer"
echo
echo "Post-install checklist: docs/INSTALL.md"
