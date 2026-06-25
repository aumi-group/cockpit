#!/usr/bin/env bash
# AUMI Cockpit · update workers (após git push novo).
set -euo pipefail
cd "$HOME/aumi-cockpit"
git pull --rebase origin main
npm install --omit=dev --no-audit --no-fund
sudo systemctl restart aumi-cockpit-pulso
sudo systemctl restart aumi-cockpit-bird 2>/dev/null || true
sudo systemctl status aumi-cockpit-pulso --no-pager | head -5
