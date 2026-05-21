#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${GENFREN_ROOT:-/root/genfren}"
ENV_FILE="${GENFREN_ENV_FILE:-$ROOT_DIR/.env.vps}"

cd "$ROOT_DIR"
set -a
source "$ENV_FILE"
set +a
node --import tsx scripts/migrate.ts
