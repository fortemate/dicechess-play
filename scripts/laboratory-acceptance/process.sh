#!/usr/bin/env bash
# Disposable acceptance process only. Never sources operator/service environments.
set -euo pipefail
action=${1:?action}; stage=${2:?stage}; java=${3:?java}; state=${4:?state}
port=${5:?port}; database_port=${6:?database port}; origin=${7:?origin}; mode=${8:?mode}
join_seconds=${9:-300}; admission=${10:-true}
[[ "$port" =~ ^[0-9]+$ && "$database_port" =~ ^[0-9]+$ ]] || exit 2
[[ "$mode" == laboratory || "$mode" == classic ]] || exit 2
[[ "$origin" == http://127.0.0.1:* ]] || exit 2
[[ -x "$stage/bin/dicechess-play-api" && -x "$java/bin/java" && -d "$state" ]] || exit 2
pidfile="$state/$mode.pid"
if [[ "$action" == stop || "$action" == crash ]]; then
  if [[ -f "$pidfile" ]]; then
    pid=$(cat "$pidfile")
    [[ "$pid" =~ ^[0-9]+$ ]] || exit 2
    if kill -0 "$pid" 2>/dev/null; then
      # Refuse to stop a process that does not belong to this staged acceptance server.
      [[ "$(tr '\0' ' ' < "/proc/$pid/cmdline")" == *"$stage"* ]] || exit 2
      if [[ "$action" == crash ]]; then kill -KILL "$pid"; else kill -TERM "$pid"; fi
      for _ in {1..50}; do kill -0 "$pid" 2>/dev/null || break; sleep .1; done
      if kill -0 "$pid" 2>/dev/null && [[ "$(tr '\0' ' ' < "/proc/$pid/cmdline")" == *"$stage"* ]]; then
        kill -KILL "$pid"
        sleep .2
      fi
    fi
    rm -- "$pidfile"
  fi
  exit 0
fi
[[ "$action" == serve && ! -e "$pidfile" ]] || exit 2
echo $$ > "$pidfile"
# The disposable database uses host trust on a loopback port. A random, unused password satisfies
# the app's required setting; no credential is written to disk or included in evidence.
password=$(openssl rand -hex 16)
bind_host=127.0.0.1
if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then bind_host=0.0.0.0; fi
if [[ "$mode" == laboratory ]]; then
  exec env -i PATH=/usr/bin:/bin JAVA_HOME="$java" \
    PLAY_RUNTIME_MODE=laboratory LAB_DB_URL="jdbc:postgresql://127.0.0.1:$database_port/lab225_lab" \
    LAB_DB_USER=lab225_lab LAB_DB_PASSWORD="$password" LAB_FRONTEND_ORIGIN="$origin" \
    LAB_BIND_HOST="$bind_host" LAB_PORT="$port" LAB_JOIN_WINDOW_SECONDS="$join_seconds" \
    LAB_ADMISSION_OPEN="$admission" \
    "$stage/bin/dicechess-play-api" </dev/null >"$state/$mode.log" 2>&1
else
  exec env -i PATH=/usr/bin:/bin JAVA_HOME="$java" PORT="$port" \
    PLAY_DB_URL="jdbc:postgresql://127.0.0.1:$database_port/lab225_classic" \
    PLAY_DB_USER=lab225_classic PLAY_DB_PASSWORD="$password" \
    "$stage/bin/dicechess-play-api" </dev/null >"$state/$mode.log" 2>&1
fi
