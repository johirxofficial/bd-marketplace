#!/usr/bin/env bash
#
# BD Marketplace — logical backup (database + uploaded media + environment).
#
# Usage:  bash scripts/backup.sh
#
# Writes to backups/:
#   db-<timestamp>.sql.gz       MySQL dump (schema + data)
#   uploads-<timestamp>.tgz     storage/app/uploads
#   env-<timestamp>.backup      copy of backend/.env (contains secrets)
#   SHA256SUMS-<timestamp>.txt  checksums
#
# Retention: 14 days for database/upload archives. Environment copies are
# kept for 30 days. Everything is created with mode 600/700.
#
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="${APP_ROOT}/backend"
BACKUP_DIR="${APP_ROOT}/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DAYS_DB=14
KEEP_DAYS_ENV=30

umask 077
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

# --- read database settings from .env without executing it ------------------
env_value() {
  grep -E "^${1}=" "${BACKEND}/.env" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

DB_HOST="$(env_value DB_HOST)"
DB_PORT="$(env_value DB_PORT)"
DB_NAME="$(env_value DB_DATABASE)"
DB_USER="$(env_value DB_USERNAME)"
DB_PASS="$(env_value DB_PASSWORD)"

: "${DB_HOST:=127.0.0.1}"
: "${DB_PORT:=3306}"

if [[ -z "${DB_NAME}" || -z "${DB_USER}" ]]; then
  echo "Could not read DB settings from ${BACKEND}/.env" >&2
  exit 1
fi

# --- dump database ----------------------------------------------------------
DEFAULTS_FILE="$(mktemp)"
trap 'rm -f "${DEFAULTS_FILE}"' EXIT
cat >"${DEFAULTS_FILE}" <<EOF
[client]
user=${DB_USER}
password=${DB_PASS}
host=${DB_HOST}
port=${DB_PORT}
EOF
chmod 600 "${DEFAULTS_FILE}"

DB_FILE="${BACKUP_DIR}/db-${STAMP}.sql.gz"
echo "==> Dumping database ${DB_NAME}"
mysqldump --defaults-extra-file="${DEFAULTS_FILE}" \
  --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF \
  "${DB_NAME}" | gzip -9 >"${DB_FILE}"
chmod 600 "${DB_FILE}"

# --- archive uploads --------------------------------------------------------
UPLOAD_FILE="${BACKUP_DIR}/uploads-${STAMP}.tgz"
echo "==> Archiving uploaded media"
tar czf "${UPLOAD_FILE}" -C "${BACKEND}/storage/app" uploads 2>/dev/null || {
  # storage/app/uploads may not exist on a fresh install
  mkdir -p "${BACKEND}/storage/app/uploads"
  tar czf "${UPLOAD_FILE}" -C "${BACKEND}/storage/app" uploads
}
chmod 600 "${UPLOAD_FILE}"

# --- capture environment (secrets!) ----------------------------------------
ENV_FILE="${BACKUP_DIR}/env-${STAMP}.backup"
cp -p "${BACKEND}/.env" "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

# --- checksums --------------------------------------------------------------
SUMS_FILE="${BACKUP_DIR}/SHA256SUMS-${STAMP}.txt"
( cd "${BACKUP_DIR}" && sha256sum "db-${STAMP}.sql.gz" "uploads-${STAMP}.tgz" "env-${STAMP}.backup" >"${SUMS_FILE}" )
chmod 600 "${SUMS_FILE}"

# --- retention --------------------------------------------------------------
find "${BACKUP_DIR}" -maxdepth 1 -name 'db-*.sql.gz' -mtime +"${KEEP_DAYS_DB}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -name 'uploads-*.tgz' -mtime +"${KEEP_DAYS_DB}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -name 'SHA256SUMS-*.txt' -mtime +"${KEEP_DAYS_DB}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -name 'env-*.backup' -mtime +"${KEEP_DAYS_ENV}" -delete

echo
echo "Backup complete:"
ls -lh "${DB_FILE}" "${UPLOAD_FILE}" "${ENV_FILE}" "${SUMS_FILE}"
echo
echo "Verify with:  sha256sum -c ${SUMS_FILE}"
echo "Restore with: bash scripts/restore.sh ${DB_FILE} ${UPLOAD_FILE}"
