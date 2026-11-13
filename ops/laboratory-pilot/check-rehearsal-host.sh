#!/bin/sh
# Refuse inherited remote Docker overrides before any rehearsal resources exist.
set -eu
test -z "${DOCKER_HOST:-}"
test -z "${DOCKER_CONTEXT:-}"
