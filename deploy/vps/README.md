# AUMI Cockpit · deploy VPS (Alice)

Workers de coleta rodando 24/7 na VPS Tailscale `100.114.118.80`.

## Instalação inicial (1×)

Execute na VPS (como user padrão, com sudo disponível):

```bash
curl -fsSL https://raw.githubusercontent.com/aumi-group/cockpit/main/deploy/vps/install.sh -o /tmp/install.sh
DATABASE_URL='postgresql://neondb_owner:npg_o9esli8Fjacq@ep-gentle-glitter-actv0on7-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require' \
TELEGRAM_BOT_TOKEN='8878073526:AAECfTHdQzOfIpLIQ9q370Mogjrw73IPrJo' \
TELEGRAM_CHAT_ID='5166650114' \
AUTH_TOKEN='<cookie auth_token do João>' \
CT0='<cookie ct0 do João>' \
  bash /tmp/install.sh
```

(Se `AUTH_TOKEN`/`CT0` ainda não tiverem, omite — o pulso roda sem X, depois reroda o install com eles.)

## Update (após git push novo no repo)

```bash
curl -fsSL https://raw.githubusercontent.com/aumi-group/cockpit/main/deploy/vps/update.sh | bash
```

## O que fica no sistema

- `~/aumi-cockpit/` — clone do repo
- `~/aumi-cockpit/.env` — segredos (chmod 600, não-versionado)
- `/etc/systemd/system/aumi-cockpit-pulso.service` — coletor HN/Bluesky/RSS
- `/etc/systemd/system/aumi-cockpit-bird.service` — coletor X/Twitter (só se AUTH_TOKEN+CT0)
- `/var/log/aumi-cockpit-*.log` — logs persistidos

## Operação

```bash
# Status
sudo systemctl status aumi-cockpit-pulso
sudo systemctl status aumi-cockpit-bird

# Logs em tempo real
sudo journalctl -fu aumi-cockpit-pulso
sudo journalctl -fu aumi-cockpit-bird

# Restart manual
sudo systemctl restart aumi-cockpit-pulso

# Desligar temporário
sudo systemctl stop aumi-cockpit-pulso

# Forçar 1 tick agora (sem o serviço)
cd ~/aumi-cockpit && node workers/pulso.mjs --once
```

## Como Alice valida pós-install

```bash
# Conta sinais no banco
cd ~/aumi-cockpit && node -e "
const {Pool}=require('pg');require('dotenv').config({path:'.env'});
const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
(async()=>{
  const r=await p.query('select source,count(*)::int from cockpit_signals group by source order by source');
  console.log(r.rows); p.end();
})();
"
```

Esperado em primeira execução (5-10min após install): linhas pra `hn`, `bluesky`, e talvez `tabnews`/`google-news`/`lobsters` (depende se há menção da AUMI nas últimas 24h).
