# Bird Worker — Task Scheduler Windows

O worker `workers/bird-mentions.mjs` coleta menções do X/Twitter via `bird` CLI.
Ele precisa rodar localmente porque depende dos cookies do navegador do João.

## Pré-requisitos

- Node.js ≥ 22.5 (`node --version`)
- `bird.cmd` em `C:\Users\blzja\AppData\Roaming\nvm\v22.22.3\bird.cmd`
- `AUTH_TOKEN` e `CT0` setados em `D:\aumi-cockpit\.env.local` (veja seção abaixo)

## 1. Instalar a tarefa

Abra **PowerShell como Administrador** e rode:

```powershell
powershell -ExecutionPolicy Bypass -File "D:\aumi-cockpit\scripts\install-bird-task.ps1"
```

Isso registra a tarefa `AUMI-Cockpit-Bird-Worker` que dispara:
- No logon do usuário
- A cada 15 minutos depois, indefinidamente
- Sem iniciar nova instância se a anterior ainda estiver rodando

## 2. Verificar a tarefa

```powershell
Get-ScheduledTask -TaskName "AUMI-Cockpit-Bird-Worker" | Format-List TaskName, State, NextRunTime
```

## 3. Disparar manualmente agora

```powershell
Start-ScheduledTask -TaskName "AUMI-Cockpit-Bird-Worker"
```

## 4. Ver os logs

Os logs ficam em `D:\aumi-cockpit\logs\bird-YYYY-MM-DD.log` (um arquivo por dia, append-only, UTF-8).

```powershell
# Últimas 30 linhas do log de hoje
Get-Content "D:\aumi-cockpit\logs\bird-$(Get-Date -Format 'yyyy-MM-dd').log" -Tail 30
```

## 5. Desinstalar

```powershell
powershell -ExecutionPolicy Bypass -File "D:\aumi-cockpit\scripts\uninstall-bird-task.ps1"
```

## Configurar AUTH_TOKEN e CT0

Sem esses cookies o worker loga `"⚠ AUTH_TOKEN/CT0 ausentes"` e sai com exit 0 (é por design — não é bug).

Para pegar os cookies:
1. Abra `x.com` no Chrome/Firefox logado como João
2. DevTools → Application → Cookies → `https://x.com`
3. Copie `auth_token` e `ct0`
4. Adicione no `.env.local`:

```
AUTH_TOKEN=seu_auth_token_aqui
CT0=seu_ct0_aqui
```

Depois que os cookies estiverem setados, na próxima execução (ou dispare manualmente) os sinais do X começam a aparecer em `cockpit_signals` com `source='twitter'`.

## Estrutura dos arquivos

```
scripts/
  install-bird-task.ps1    # registra a tarefa (Admin)
  uninstall-bird-task.ps1  # remove a tarefa
  run-bird-worker.ps1      # wrapper chamado pelo Task Scheduler
logs/
  bird-2026-06-25.log      # criado automaticamente
```
