#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${GENFREN_ROOT:-/root/genfren}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"

install -m 0644 "$ROOT_DIR/ops/systemd/genfren-api.service" "$SYSTEMD_DIR/genfren-api.service"
install -m 0644 "$ROOT_DIR/ops/systemd/genfren-worker.service" "$SYSTEMD_DIR/genfren-worker.service"

systemctl daemon-reload
systemctl enable genfren-api.service genfren-worker.service
systemctl restart genfren-api.service genfren-worker.service
