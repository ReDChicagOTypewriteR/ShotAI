#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[ShotAI] 未检测到 Node.js，请先在主机安装 Node.js 20 或更高版本。"
  exit 1
fi

echo "[ShotAI] 正在启动内网网页版..."
exec node server.mjs
