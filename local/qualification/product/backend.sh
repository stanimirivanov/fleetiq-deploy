#!/bin/bash
set -euo pipefail
password="$(cat /run/secrets/database_password)"
[[ "$password" =~ ^[a-f0-9]{64}$ ]] || exit 1
export DATABASE_URL="postgres://fleetiq:$password@postgres:5432/fleetiq"
unset password
if [[ "$1" == serve ]]; then
  exec /bin/bash /opt/fleetiq/backend-entrypoint.sh "$@"
fi
if [[ "$1" == archive-worker || "$1" == reclaim-once ]]; then
  FLEETIQ_ARCHIVE_ACCESS_KEY="$(cat /run/secrets/archive_access_key)"
  FLEETIQ_ARCHIVE_SECRET_KEY="$(cat /run/secrets/archive_secret_key)"
  [[ "$FLEETIQ_ARCHIVE_ACCESS_KEY" =~ ^[a-f0-9]{48}$ &&
     "$FLEETIQ_ARCHIVE_SECRET_KEY" =~ ^[a-f0-9]{48}$ ]] || exit 1
  export FLEETIQ_ARCHIVE_ACCESS_KEY FLEETIQ_ARCHIVE_SECRET_KEY
fi
# Only the archive publisher sees the disposable database age clock.
if [[ "$1" == archive-worker ]]; then
  DATABASE_URL+="?options=-csearch_path%3Dqualification_clock%2Cpg_catalog%2Cpublic"
fi
# Only report the exact expected application failure, without child diagnostics.
if [[ "$1" == qualify-summary-unavailable ]]; then
  status=0
  output="$(/usr/local/bin/fleetiq-server summarize-once 2>&1)" || status=$?
  [[ "$status" == 1 && "$output" == 'numeric summary rejected: CoverageUnavailable' ]] || exit 1
  printf '%s\n' 'summary coverage unavailable'
  exit 0
fi
exec /usr/local/bin/fleetiq-server "$@"
