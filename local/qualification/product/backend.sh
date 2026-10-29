#!/bin/bash
set -euo pipefail
password="$(cat /run/secrets/database_password)"
[[ "$password" =~ ^[a-f0-9]{64}$ ]] || exit 1
export DATABASE_URL="postgres://fleetiq:$password@postgres:5432/fleetiq"
unset password
if [[ "$1" == serve ]]; then
  exec /bin/bash /opt/fleetiq/backend-entrypoint.sh "$@"
fi
exec /usr/local/bin/fleetiq-server "$@"
