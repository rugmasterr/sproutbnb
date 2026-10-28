#!/bin/sh
# fly volumes mount root-owned: give /data to the unprivileged user, lock it down, then drop privileges.
set -eu
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R node:node /data
  chmod 700 /data
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
