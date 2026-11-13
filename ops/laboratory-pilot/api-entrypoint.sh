#!/bin/sh
set -eu

password_file=/run/secrets/laboratory_password
if [ ! -r "$password_file" ]; then
  echo "laboratory database password secret is not readable" >&2
  exit 1
fi

LAB_DB_PASSWORD=$(cat "$password_file")
if [ -z "$LAB_DB_PASSWORD" ]; then
  echo "laboratory database password secret is empty" >&2
  exit 1
fi
export LAB_DB_PASSWORD
exec /app/bin/dicechess-play-api
