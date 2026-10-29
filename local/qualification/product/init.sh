#!/bin/bash
# Disposable volume only: never touches host trust or host credentials.
set -euo pipefail
umask 077
[[ ! -e /state/initialized ]] || { echo 'Refusing initialized fixture state' >&2; exit 1; }
mkdir /state/database /state/backend /state/issuer /state/edge /state/public
openssl rand -hex 32 > /state/database/database_password
cp /state/database/database_password /state/backend/database_password
openssl rand -hex 32 > /state/backend/oidc_client_secret
cp /state/backend/oidc_client_secret /state/issuer/oidc_client_secret
openssl rand -hex 32 > /state/issuer/cookie-key
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 2 -keyout /state/ca.key -out /state/public/ca.crt -subj /CN=FleetIQ-disposable-qualification-CA >/dev/null 2>&1
for role in edge issuer; do
  host=fleet.test
  [[ "$role" != issuer ]] || host=issuer.test
  printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$host" > /state/extensions
  openssl req -newkey rsa:2048 -nodes -keyout /state/"$role"/tls.key -out /state/request -subj /CN="$host" >/dev/null 2>&1
  openssl x509 -req -in /state/request -CA /state/public/ca.crt -CAkey /state/ca.key -CAcreateserial -days 2 -sha256 -extfile /state/extensions -out /state/"$role"/tls.crt >/dev/null 2>&1
 done
rm /state/ca.key /state/public/ca.srl /state/request /state/extensions
# These paths are isolated volume subpaths; no consumer mounts the complete state.
find /state -type d -exec chmod 755 {} +
find /state -type f -exec chmod 444 {} +
touch /state/initialized
