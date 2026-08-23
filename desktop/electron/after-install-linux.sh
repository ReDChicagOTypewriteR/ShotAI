#!/bin/sh
set -e

LOG_DIRECTORY=/var/log/shotai
INSTALL_LOG_LINK=/opt/ShotAI/logs

mkdir -p "$LOG_DIRECTORY"
chmod 1777 "$LOG_DIRECTORY"

if [ ! -e "$INSTALL_LOG_LINK" ] && [ ! -L "$INSTALL_LOG_LINK" ]; then
  ln -s "$LOG_DIRECTORY" "$INSTALL_LOG_LINK"
fi

exit 0
