#!/usr/bin/env bash
#
# BD Marketplace — restore a database (and optionally media) from a backup.
#
# Usage:  bash scripts/restore.sh <db-backup.sql.gz> [uploads-backup.tgz] [--yes]
#
# WARNING: the database restore drops and recreates every table in the
# configured database. Stop the queue worker first if you can:
#   sudo systemctl stop bd-marketplace-queue.service
# and start it again afterwards (or re-run scripts/deploy.sh).
#
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="${APP_ROOT}/backend"

DB_ARCHIVE="${1:-}"
UPLOAD_ARCHIVE="${2:-}"
CONFIRM="${3:-}"

if [[ -z "${DB_ARCHIVE}" || ! -f "${DB_ARCHIVE}" ]]; then
  echo "Usage: bash scripts/restore.sh <db-backup.sql.gz> [uploads-backup.tgz] [--yes]" >&2
  exit 1
fi

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

echo "Database : ${DB_NAME} @ ${DB_HOST}:${DB_PORT}"
echo "Dump     : ${DB_ARCHIVE}"
[[ -n "${UPLOAD_ARCHIVE}" ]] && echo "Uploads  : ${UPLOAD_ARCHIVE}"
echo

if [[ "${CONFIRM}" != "--yes" ]]; then
  read -r -p "Type RESTORE to overwrite the current database: " answer
  [[ "${answer}" == "RESTORE" ]] || { echo "Aborted."; exit 1; }
fi

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

echo "==> Restoring database"
gunzip -c "${DB_ARCHIVE}" | mysql --defaults-extra-file="${DEFAULTS_FILE}" "${DB_NAME}"

if [[ -n "${UPLOAD_ARCHIVE}" ]]; then
  if [[ ! -f "${UPLOAD_ARCHIVE}" ]]; then
    echo "Uploads archive not found: ${UPLOAD_ARCHIVE}" >&2
    exit 1
  fi
  echo "==> Restoring uploaded media"
  rm -rf "${BACKEND}/storage/app/uploads"
  tar xzf "${UPLOAD_ARCHIVE}" -C "${BACKEND}/storage/app"
fi

echo "==> Clearing caches"
( cd "${BACKEND}" && php artisan optimize:clear )

echo
echo "Restore complete. Rebuild caches and permissions with:"
echo "  sudo bash scripts/deploy.sh"
