#!/usr/bin/env bash
# AUMI Cockpit · install workers na VPS Alice.
#
# Roda como o user padrão da VPS (com sudo onde precisar).
# Idempotente — pode rodar várias vezes.
#
# O que faz:
#   1. Garante Node 22 LTS
#   2. Clona/atualiza repo aumi-group/cockpit em ~/aumi-cockpit
#   3. npm install
#   4. Cria .env com DATABASE_URL + TELEGRAM + AUTH_TOKEN/CT0 (passados via env do install)
#   5. Cria systemd units: aumi-cockpit-pulso.service + aumi-cockpit-bird.service
#   6. Cada uma roda em loop, restart=always
#
# Uso:
#   DATABASE_URL='postgresql://...' \
#   TELEGRAM_BOT_TOKEN='...' \
#   TELEGRAM_CHAT_ID='...' \
#   AUTH_TOKEN='...' CT0='...' \
#     bash install.sh

set -euo pipefail

REPO_URL="https://github.com/aumi-group/cockpit.git"
TARGET_DIR="$HOME/aumi-cockpit"
SERVICE_USER="${SUDO_USER:-$USER}"

echo "→ AUMI Cockpit · instalando workers na VPS ($SERVICE_USER)"

# 1) Node 22 LTS via nvm (não exige sudo, persistente por user)
if ! command -v node >/dev/null 2>&1 || ! node --version | grep -qE '^v(22|23|24)\.'; then
  echo "→ instalando Node 22 via nvm"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  nvm install 22 --lts
  nvm alias default 22
fi
node --version

# 2) Clone ou pull
if [ -d "$TARGET_DIR/.git" ]; then
  echo "→ git pull em $TARGET_DIR"
  cd "$TARGET_DIR" && git pull --rebase origin main
else
  echo "→ git clone em $TARGET_DIR"
  git clone "$REPO_URL" "$TARGET_DIR"
  cd "$TARGET_DIR"
fi

# 3) Deps
echo "→ npm install"
npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund
npm install dotenv pg --no-audit --no-fund

# 4) .env (lê variáveis do ambiente no momento do install)
echo "→ escrevendo .env (não-versionado)"
cat > "$TARGET_DIR/.env" <<EOF
DATABASE_URL="${DATABASE_URL:?missing}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
CT0="${CT0:-}"
EOF
chmod 600 "$TARGET_DIR/.env"

# 5) Garante schema aplicado
echo "→ aplicando db/schema.sql (idempotente)"
node -e "
const {Pool}=require('pg');require('dotenv').config({path:'$TARGET_DIR/.env'});
const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
const ddl=require('fs').readFileSync('$TARGET_DIR/db/schema.sql','utf8');
(async()=>{const c=await p.connect();try{await c.query(ddl);console.log('  ✓ schema ok')}catch(e){console.error(e.message)}finally{c.release();p.end()}})();
"

# 6) systemd units
NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"
SYSTEMD_DIR="/etc/systemd/system"

write_unit() {
  local NAME="$1"; local SCRIPT="$2"; local DESC="$3"
  sudo tee "$SYSTEMD_DIR/$NAME.service" >/dev/null <<UNIT
[Unit]
Description=$DESC
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$TARGET_DIR
EnvironmentFile=$TARGET_DIR/.env
ExecStart=$NODE_BIN $TARGET_DIR/workers/$SCRIPT
Restart=always
RestartSec=10
StandardOutput=append:/var/log/$NAME.log
StandardError=append:/var/log/$NAME.log

[Install]
WantedBy=multi-user.target
UNIT
}

echo "→ criando systemd units"
write_unit "aumi-cockpit-pulso" "pulso.mjs" "AUMI Cockpit · Pulso worker (HN/Bluesky/RSS)"
write_unit "aumi-cockpit-bird" "bird-mentions.mjs" "AUMI Cockpit · Bird CLI worker (X/Twitter)"

sudo touch /var/log/aumi-cockpit-pulso.log /var/log/aumi-cockpit-bird.log
sudo chown "$SERVICE_USER" /var/log/aumi-cockpit-*.log

sudo systemctl daemon-reload
sudo systemctl enable --now aumi-cockpit-pulso.service

if [ -n "${AUTH_TOKEN:-}" ] && [ -n "${CT0:-}" ]; then
  # Bird CLI precisa ser instalado globalmente pro worker chamar
  if ! command -v bird >/dev/null 2>&1; then
    echo "→ instalando bird CLI globalmente"
    sudo npm install -g @steipete/bird@latest
  fi
  sudo systemctl enable --now aumi-cockpit-bird.service
else
  echo "⚠ AUTH_TOKEN/CT0 ausentes — aumi-cockpit-bird não foi ligado"
  sudo systemctl disable --now aumi-cockpit-bird.service 2>/dev/null || true
fi

echo ""
echo "✓ instalado. Status:"
sudo systemctl status aumi-cockpit-pulso --no-pager | head -8
[ -n "${AUTH_TOKEN:-}" ] && sudo systemctl status aumi-cockpit-bird --no-pager | head -8
echo ""
echo "Logs:"
echo "  sudo journalctl -fu aumi-cockpit-pulso"
echo "  sudo journalctl -fu aumi-cockpit-bird"
echo "  tail -f /var/log/aumi-cockpit-*.log"
