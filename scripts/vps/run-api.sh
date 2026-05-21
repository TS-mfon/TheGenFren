#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${GENFREN_ROOT:-/root/genfren}"
ENV_FILE="${GENFREN_ENV_FILE:-$ROOT_DIR/.env.vps}"

cd "$ROOT_DIR"
set -a
source "$ENV_FILE"
set +a
exec npm exec tsx apps/api/src/server.ts
