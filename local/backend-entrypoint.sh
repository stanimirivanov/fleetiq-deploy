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
  # Accept one Windows line ending; reject embedded line breaks.
  FLEETIQ_OIDC_CLIENT_SECRET="${FLEETIQ_OIDC_CLIENT_SECRET%$'\r'}"
  [[ -n "$FLEETIQ_OIDC_CLIENT_SECRET" && ${#FLEETIQ_OIDC_CLIENT_SECRET} -le 4096 && "$FLEETIQ_OIDC_CLIENT_SECRET" != *$'\r'* && "$FLEETIQ_OIDC_CLIENT_SECRET" != *$'\n'* ]] || { echo "Invalid OIDC secret file" >&2; exit 1; }
  export FLEETIQ_OIDC_CLIENT_SECRET
elif [[ "$count" != 0 ]]; then
  echo "Incomplete identity configuration" >&2; exit 1
fi
exec /usr/local/bin/fleetiq-server "$@"
