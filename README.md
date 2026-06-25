# AUMI Cockpit

> Inteligência de mercado, criação de conteúdo e monitoramento — pra time AUMI e agentes.

5 painéis (cada um responde uma pergunta):

| Painel | Pergunta | Status |
|---|---|---|
| �� **Pulso** | O que está acontecendo agora? | ✅ Sprint 1 |
| �� **Mercado** | Quem é a concorrência e o que ela fala? | �� Sprint 3 |
| ✏️ **Criação** | Que post escrever agora e por quê? | �� Sprint 2 |
| �� **Conversão** | O que vira lead? | �� Sprint 3 |
| �� **Saúde** | Sistema ok? | �� Sprint 4 |

## Setup

```bash
cd D:/aumi-cockpit
cp .env.example .env.local
# Edita .env.local com DATABASE_URL (Neon, pode reusar o do content-engine)

# Aplica schema
psql "$DATABASE_URL" -f db/schema.sql

# Roda workers
npm run worker:pulso          # loop contínuo HN/Reddit/Bluesky/Tabnews/GoogleNews/Lobsters
npm run worker:pulso -- --once   # uma rodada e sai
npm run worker:bird           # X/Twitter via bird CLI (precisa AUTH_TOKEN + CT0)

# Dev server
npm run dev
# → http://localhost:3000
```

## Bird CLI (X)

Cookies do X são extraídos do browser ou passados como env. Como pegar:

1. Abre x.com no Chrome (logado na conta certa)
2. F12 → Application → Cookies → `https://x.com`
3. Copia `auth_token` e `ct0`
4. Cola em `.env.local`:
   ```
   AUTH_TOKEN=...
   CT0=...
   ```

## Arquitetura

- **Frontend**: Next.js 15 + React 19 + Tailwind 4
- **DB**: Postgres (Neon serverless) — coexiste com aumi-content-engine
- **Workers**: Node 22.22+, em loop, cada fonte com `interval_seconds` próprio
- **Alertas**: Telegram bot reusando token do site
- **Auth** (Sprint 2): email allowlist + magic link

## Próximos passos

- [ ] Sprint 1 (atual): Pulso funcional + alertas Telegram + bird worker
- [ ] Sprint 2: Criação (conecta content-engine, persona AUMI, QC inline, publisher dev.to/Bluesky/Hashnode)
- [ ] Sprint 3: Mercado (grafo de tópicos, tracking actors) + Conversão (UTM + funil real)
- [ ] Sprint 4: Saúde + auth + polish

## Deploy

Vercel (subdomínio `cockpit.aumi.group`).

```bash
vercel link --project aumi-cockpit
vercel env pull
vercel --prod
```

DNS: CNAME `cockpit` → `cname.vercel-dns.com`
