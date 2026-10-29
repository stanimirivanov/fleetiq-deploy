#!/bin/sh
# Sourced by the official image's temporary, socket-only initialization server.
# A subshell prevents fixture shell options from changing the image entrypoint.
(
  set -eu
  pg_isready -U fleetiq -d fleetiq >/dev/null
  if pg_isready -h 127.0.0.1 -U fleetiq -d fleetiq >/dev/null; then
    echo 'Unexpected TCP readiness during temporary initialization' >&2
    exit 1
  else
    # pg_isready: 2 means no server response; missing commands/invalid options fail.
    result=$?
    [ "$result" -eq 2 ] || exit 1
  fi
  # Cross several real health intervals: the old socket-only probe would start
  # the backend here. This adds no domain rows and executes only for fresh data.
  sleep 5
  set -C
  printf '%s\n' 'socket-only-readiness-rejected' > /tmp/fleetiq-readiness-proof
)
