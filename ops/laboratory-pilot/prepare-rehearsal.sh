#!/bin/sh
# Disposable localhost-only credentials. No output contains a password or private key.
set -eu
state=$1
artifact=$2
umask 077
app_password=$(openssl rand -hex 32)
admin_password=$(openssl rand -hex 32)
printf '%s' "$app_password" > "$state/app-password"
printf '%s' "$admin_password" > "$state/admin-password"
unset app_password admin_password
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
  -keyout "$state/tls.key" -out "$state/tls.crt" >/dev/null 2>&1
# Compose file secrets are bind mounts: mode/uid attributes cannot fix file permissions.
# The private parent directory stays 0700; individual bind sources must be readable by container UIDs.
chmod 444 "$state/app-password" "$state/admin-password" "$state/tls.key" "$state/tls.crt"
cat > "$state/operator.env" <<EOF
LAB_FRONTEND_DIR=$artifact
LAB_FRONTEND_ORIGIN=https://localhost:8443
LAB_TLS_CERT_FILE=$state/tls.crt
LAB_TLS_KEY_FILE=$state/tls.key
LAB_DATABASE_PASSWORD_FILE=$state/app-password
LAB_DATABASE_ADMIN_PASSWORD_FILE=$state/admin-password
LAB_ADMISSION_OPEN=false
EOF
