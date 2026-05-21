#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${GENFREN_ROOT:-/root/genfren}"

cd "$ROOT_DIR"
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d postgres redis
