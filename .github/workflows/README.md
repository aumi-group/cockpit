# GitHub Actions · cron workers

## pulso.yml

Coleta de sinais (HN, Bluesky, Tabnews, Google News, Lobsters) a cada **15min**.

### Setup (1×)

Adiciona estes secrets em https://github.com/aumi-group/cockpit/settings/secrets/actions

| Secret | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_o9esli8Fjacq@ep-gentle-glitter-actv0on7-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require` |
| `TELEGRAM_BOT_TOKEN` | `8878073526:AAECfTHdQzOfIpLIQ9q370Mogjrw73IPrJo` |
| `TELEGRAM_CHAT_ID` | `5166650114` |

### Disparar manualmente

UI: Actions → Pulso → **Run workflow**
CLI: `gh workflow run pulso.yml`

### Logs

Cada execução fica em https://github.com/aumi-group/cockpit/actions/workflows/pulso.yml — output completo do worker + sumário do banco.

### Custo

Grátis. Repos públicos têm Actions ilimitado. ~30s por execução, 96 execuções/dia = 48min/dia (negligível).

### Limitações

- Cron do GitHub Actions é "best effort" — pode atrasar 5-15min em horário de pico (irrelevante pra coleta de menções).
- Bird CLI (X/Twitter) **não roda aqui** — cookies precisam ficar locais. Ver `D:/aumi-cockpit/scripts/win-task-scheduler-bird.md` pra setup no Windows.
