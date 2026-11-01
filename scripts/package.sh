#!/usr/bin/env bash
#
# Build a sanitized setup archive for another business.
#
#   bash scripts/package.sh
#   OUTPUT=/tmp/shop.zip bash scripts/package.sh
#
# The archive contains source, the production SPA build, docs, installer, and
# CI files. It never contains .env, credentials, vendor/, node_modules/, logs,
# uploads, backups, or runtime caches.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATE="$(date +%Y%m%d)"
NAME="marketplace-setup-${DATE}"
DIST="${DIST:-$ROOT/dist}"
OUTPUT="${OUTPUT:-$DIST/${NAME}.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

command -v zip >/dev/null || { echo "zip is required." >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync is required." >&2; exit 1; }

DEST="$STAGE/$NAME"
mkdir -p "$DEST" "$DIST"

echo "==> Staging files"
rsync -a \
  --exclude='.git/' \
  --exclude='dist/' \
  --exclude='backups/' \
  --exclude='backend/vendor/' \
  --exclude='frontend/node_modules/' \
  --exclude='backend/bootstrap/cache/*' \
  --exclude='backend/storage/logs/*' \
  --exclude='backend/storage/framework/cache/data/*' \
  --exclude='backend/storage/framework/sessions/*' \
  --exclude='backend/storage/framework/views/*' \
  --exclude='backend/storage/app/uploads/*' \
  --exclude='backend/public/storage' \
  --exclude='backend/public/hot' \
  --exclude='backend/.phpunit.result.cache' \
  --exclude='.phpunit.result.cache' \
  --exclude='frontend/tsconfig.tsbuildinfo' \
  --exclude='backend/database/*.sqlite' \
  --exclude='.install-credentials' \
  --exclude='.admin-credentials' \
  --exclude='.demo-credentials' \
  --exclude='.db-credentials' \
  --include='backend/.env.example' \
  --exclude='backend/.env' \
  --exclude='backend/.env.*' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='Thumbs.db' \
  "$ROOT/" "$DEST/"

# Recreate empty runtime directories with safe placeholders.
mkdir -p \
  "$DEST/backend/storage/logs" \
  "$DEST/backend/storage/framework/cache/data" \
  "$DEST/backend/storage/framework/sessions" \
  "$DEST/backend/storage/framework/views" \
  "$DEST/backend/storage/app/uploads" \
  "$DEST/backend/bootstrap/cache"

for dir in \
  backend/storage/logs \
  backend/storage/framework/cache/data \
  backend/storage/framework/sessions \
  backend/storage/framework/views \
  backend/storage/app/uploads \
  backend/bootstrap/cache; do
  printf '*\n!.gitignore\n' > "$DEST/$dir/.gitignore"
done

chmod +x "$DEST/install.sh" "$DEST/scripts/"*.sh 2>/dev/null || true

echo "==> Scanning for secrets"
SECRET_FILES="$(find "$DEST" -type f | grep -E '/(\.env(\..+)?|\.(admin|demo|db|install)-credentials)$' | grep -v '/\.env\.example$' || true)"
if [[ -n "$SECRET_FILES" ]]; then
  echo "Refusing to package: secret files found:" >&2
  echo "$SECRET_FILES" >&2
  exit 1
fi
if grep -rIl --exclude='*.example' --exclude='package.sh' -E 'APP_KEY=base64:|-----BEGIN [A-Z ]*PRIVATE KEY-----' "$DEST" >/dev/null 2>&1; then
  echo "Refusing to package: a real application key or private key was found." >&2
  exit 1
fi

echo "==> Writing archive"
{
  echo "Marketplace setup package"
  echo "Built: $(date -Is)"
  echo "Source: $ROOT"
  echo
  echo "Contains: application source, production SPA build, database migrations, seeders,"
  echo "documentation, portable installer, deployment templates, and CI workflow."
  echo "Excludes: .env, credentials, vendor/, node_modules/, logs, uploads, backups, caches."
  echo
  echo "Install: docs/INSTALL.md or the top-level README.md"
} > "$DEST/PACKAGE-CONTENTS.txt"

rm -f "$OUTPUT"
(cd "$STAGE" && zip -qr "$OUTPUT" "$NAME")
sha256sum "$OUTPUT" > "${OUTPUT}.sha256"

SIZE="$(du -h "$OUTPUT" | cut -f1)"
echo
echo "Package ready: $OUTPUT ($SIZE)"
echo "Checksum:      ${OUTPUT}.sha256"
echo "Staged files:  $(find "$DEST" -type f | wc -l)"
