#!/bin/sh
# Rehearsal only: restore a private dump into a new database in this owned cluster.
set -eu
container=$1
state=$2
umask 077
docker --host unix:///var/run/docker.sock exec "$container" pg_dump -U postgres -d laboratory --format=custom > "$state/backup.dump"
docker --host unix:///var/run/docker.sock exec "$container" createdb -U postgres laboratory_restore
docker --host unix:///var/run/docker.sock exec -i "$container" pg_restore --exit-on-error -U postgres -d laboratory_restore < "$state/backup.dump"
