#!/usr/bin/env bash

set -u

report_path="${1:-$PWD/shotai-model-diagnostics.txt}"

{
  echo "ShotAI Ubuntu model diagnostics"
  date -Is
  echo
  echo "== System =="
  uname -a
  command -v lsb_release >/dev/null 2>&1 && lsb_release -a 2>/dev/null
  echo
  echo "== Storage =="
  df -h "$HOME" 2>&1
  echo
  echo "== NVIDIA =="
  if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi 2>&1
  else
    echo "nvidia-smi not found"
  fi
  echo
  echo "== Ollama endpoint =="
  curl --max-time 5 -sS http://127.0.0.1:11434/api/version 2>&1
  echo
  curl --max-time 10 -sS http://127.0.0.1:11434/api/tags 2>&1
  echo
  echo "== Ollama processes and service =="
  pgrep -af ollama 2>&1 || true
  systemctl is-active ollama 2>&1 || true
  systemctl status ollama --no-pager -n 40 2>&1 || true
  echo
  echo "== ShotAI logs =="
  tail -n 160 "$HOME/.config/ShotAI/data/logs/desktop.log" 2>&1 || true
  echo
  tail -n 240 "$HOME/.config/ShotAI/data/logs/ollama.log" 2>&1 || true
  echo
  echo "== System Ollama log =="
  journalctl -u ollama --no-pager -n 240 2>&1 || true
  echo
  echo "== Model directories =="
  du -sh "$HOME/.config/ShotAI/data/models/ollama" 2>&1 || true
  du -sh /usr/share/ollama/.ollama/models 2>&1 || true
  du -sh "$HOME/.ollama/models" 2>&1 || true
} >"$report_path"

echo "Diagnostics saved to: $report_path"
