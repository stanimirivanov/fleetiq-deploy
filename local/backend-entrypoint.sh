#!/bin/bash
# Fail before exec on partial identity configuration. Never echo credentials.
set -euo pipefail
password="$(cat /run/secrets/database_password)"
[[ "$password" =~ ^[a-f0-9]{64}$ ]] || { echo "Invalid database password file" >&2; exit 1; }
export DATABASE_URL="postgres://fleetiq:$password@postgres:5432/fleetiq"
unset password
count=0
for name in FLEETIQ_BROWSER_ORIGIN FLEETIQ_OIDC_ISSUER FLEETIQ_OIDC_CLIENT_ID FLEETIQ_OIDC_IDENTITY_AUTHORITY; do
  if [[ -v "$name" ]]; then
    [[ -n "${!name}" ]] || { echo "Empty identity setting" >&2; exit 1; }
    count=$((count + 1))
  fi
done
if [[ "$count" == 4 ]]; then
  FLEETIQ_OIDC_CLIENT_SECRET="$(cat /run/secrets/oidc_client_secret)"
  # Accept one CRLF line ending; reject embedded line breaks.
  FLEETIQ_OIDC_CLIENT_SECRET="${FLEETIQ_OIDC_CLIENT_SECRET%$'\r'}"
  [[ -n "$FLEETIQ_OIDC_CLIENT_SECRET" && ${#FLEETIQ_OIDC_CLIENT_SECRET} -le 4096 && "$FLEETIQ_OIDC_CLIENT_SECRET" != *$'\r'* && "$FLEETIQ_OIDC_CLIENT_SECRET" != *$'\n'* ]] || { echo "Invalid OIDC secret file" >&2; exit 1; }
  export FLEETIQ_OIDC_CLIENT_SECRET
elif [[ "$count" != 0 ]]; then
  echo "Incomplete identity configuration" >&2; exit 1
fi
# The Compose model carries only public storage settings and secret mounts.
read_archive_secret() {
  local value
  if IFS= read -r -n 4097 -d '' value < "$1"; then
    echo "Invalid archive secret file" >&2
    return 1
  fi
  value="${value%$'\n'}"
  value="${value%$'\r'}"
  [[ -n "$value" && ${#value} -le 4096 && "$value" != *$'\r'* && "$value" != *$'\n'* ]] || {
    echo "Invalid archive secret file" >&2
    return 1
  }
  printf '%s' "$value"
}
if [[ -v FLEETIQ_ARCHIVE_ENDPOINT || -v FLEETIQ_ARCHIVE_BUCKET || -v FLEETIQ_ARCHIVE_REGION ]]; then
  [[ -n "${FLEETIQ_ARCHIVE_ENDPOINT:-}" && -n "${FLEETIQ_ARCHIVE_BUCKET:-}" && -n "${FLEETIQ_ARCHIVE_REGION:-}" ]] || {
    echo "Incomplete archive storage configuration" >&2
    exit 1
  }
  FLEETIQ_ARCHIVE_ACCESS_KEY="$(read_archive_secret /run/secrets/archive_access_key)"
  FLEETIQ_ARCHIVE_SECRET_KEY="$(read_archive_secret /run/secrets/archive_secret_key)"
  export FLEETIQ_ARCHIVE_ACCESS_KEY FLEETIQ_ARCHIVE_SECRET_KEY
fi
exec /usr/local/bin/fleetiq-server "$@"
