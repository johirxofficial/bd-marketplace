#!/usr/bin/env bash
#
# BD Marketplace — end-to-end HTTP health check.
#
# Usage:  bash scripts/healthcheck.sh [base-url]
# Default base URL: http://172.16.155.22
#
# Exits non-zero on the first failed check. Safe to run from cron/monitoring.
#
set -euo pipefail

BASE="${1:-http://172.16.155.22}"
FAIL=0

check() {
  local label="$1" url="$2" expect="${3:-200}" extra="${4:-}"
  local code
  code="$(curl -sS -o /tmp/bd-health-body -w '%{http_code}' --max-time 10 ${extra} "${url}" || echo 000)"
  if [[ "${code}" == "${expect}" ]]; then
    echo "OK   ${label} (${code})"
  else
    echo "FAIL ${label} — expected ${expect}, got ${code}  ${url}" >&2
    FAIL=1
  fi
}

check "health endpoint" "${BASE}/up"
check "storefront shell" "${BASE}/"
check "SPA deep link" "${BASE}/products"
check "public settings API" "${BASE}/api/v1/settings/public"
check "product catalogue API" "${BASE}/api/v1/products?per_page=1"
check "categories API" "${BASE}/api/v1/categories"
check "security header" "${BASE}/" 200 "-D /tmp/bd-health-headers"
check "CSRF cookie" "${BASE}/sanctum/csrf-cookie" 204

if ! grep -qi '^x-content-type-options: nosniff' /tmp/bd-health-headers; then
  echo "FAIL security header — X-Content-Type-Options missing" >&2
  FAIL=1
else
  echo "OK   security header content"
fi

rm -f /tmp/bd-health-body /tmp/bd-health-headers

if [[ ${FAIL} -ne 0 ]]; then
  echo
  echo "Health check failed." >&2
  exit 1
fi

echo
echo "All checks passed for ${BASE}"
