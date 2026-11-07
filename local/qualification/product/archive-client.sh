#!/bin/bash
# Signed fault injection is confined to the disposable loopback bucket.
set -euo pipefail
auth="$(cat /run/secrets/archive_access_key):$(cat /run/secrets/archive_secret_key)"
url=http://127.0.0.1:9000/qualification-archive
request() {
  curl --noproxy "*" --silent --show-error --fail --max-time 8 --max-filesize 2097152 \
    --aws-sigv4 aws:amz:us-east-1:s3 --user "$auth" "$@"
}
if [[ "$#" == 1 && "$1" == bucket ]]; then
  request --request PUT "$url"
  exit
fi
[[ "$#" == 2 && "$2" =~ ^fleetiq/archive/v1/74656e616e742d6c6966656379636c65/[0-9a-f]{64}\.parquet$ ]]
case "$1" in
  read) request "$url/$2" | base64 -w0 ;;
  write) base64 -d > /tmp/object; request --upload-file /tmp/object "$url/$2" ;;
  *) exit 1 ;;
esac
