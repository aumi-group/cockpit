# Prompt pra Claude Code — Task Scheduler Windows pro bird worker

> Cole o conteúdo abaixo (a partir de "Você é") na sessão do Claude Code rodando em `D:\aumi-cockpit\`.

---

Você é um agente Claude Code (Sonnet 4.6) operando no projeto `D:\aumi-cockpit\` (AUMI Cockpit, Next.js 15). Sua tarefa: configurar o worker `workers/bird-mentions.mjs` pra rodar 24/7 no Windows via Task Scheduler quando o PC estiver ligado.

## Contexto

- `aumi-cockpit` é um dashboard de inteligência de mercado (https://cockpit.aumi.group). Deploy na Vercel feito.
- O **pulso worker** (HN/Bluesky/RSS) já roda 24/7 no **GitHub Actions cron a cada 15min** — não mexer nele.
- O **bird worker** (X/Twitter via `bird` CLI da `@steipete/bird`) precisa rodar localmente porque depende de cookies `auth_token` + `ct0` do navegador do João — esses cookies não podem sair da máquina dele.
- Banco Postgres Neon compartilhado (`DATABASE_URL` já está em `.env.local`).
- Workers: `D:\aumi-cockpit\workers\bird-mentions.mjs` (já implementado, carrega `.env.local` via dotenv).
- O bird CLI já está instalado globalmente em `C:\Users\blzja\AppData\Roaming\nvm\v22.22.3\bird.cmd`.

## Pré-requisitos a verificar antes de mexer

1. `node --version` ≥ 22.5 (precisa de `node:sqlite` pro bird CLI ler cookies)
2. `bird.cmd` no PATH ou caminho conhecido
3. `D:\aumi-cockpit\.env.local` existe com `DATABASE_URL` setado
4. `node workers/bird-mentions.mjs --once` roda sem erro fatal (pode dar "missing AUTH_TOKEN" — esperado por enquanto)

## O que fazer

### Etapa 1 — script wrapper PowerShell

Crie `D:\aumi-cockpit\scripts\run-bird-worker.ps1`:

```powershell
# Wrapper pra Task Scheduler. Loga em D:\aumi-cockpit\logs\bird-YYYY-MM-DD.log
$ErrorActionPreference = "Continue"
$ProjectDir = "D:\aumi-cockpit"
$LogDir = "$ProjectDir\logs"
$Today = (Get-Date).ToString("yyyy-MM-dd")
$LogFile = "$LogDir\bird-$Today.log"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

Set-Location $ProjectDir
$Stamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
Add-Content -Path $LogFile -Value "===== $Stamp ====="

# Usa Node 22.22+ explicitamente
$Node = "C:\Program Files\nodejs\node.exe"

& $Node "workers\bird-mentions.mjs" --once 2>&1 | Out-File -FilePath $LogFile -Append -Encoding utf8

$ExitCode = $LASTEXITCODE
Add-Content -Path $LogFile -Value "exit code: $ExitCode"
exit $ExitCode
```

### Etapa 2 — registrar Task Scheduler

Crie `D:\aumi-cockpit\scripts\install-bird-task.ps1` que registra a tarefa via `New-ScheduledTask`. Requisitos:

- Nome: `AUMI-Cockpit-Bird-Worker`
- Trigger: a cada 15min, indefinidamente, começa no logon do usuário
- Action: `powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File D:\aumi-cockpit\scripts\run-bird-worker.ps1`
- Configurações: roda mesmo se em bateria, não trava o PC, timeout 5min, não rodar nova instância se anterior ainda ativa (`-MultipleInstances IgnoreNew`)
- Principal: roda como o usuário atual (`$env:USERNAME`), no contexto interativo (pra acessar cookies do navegador se bird CLI precisar)
- Não exige elevação (sem `RunLevel Highest`)

Forneça também `D:\aumi-cockpit\scripts\uninstall-bird-task.ps1` (`Unregister-ScheduledTask -TaskName "AUMI-Cockpit-Bird-Worker" -Confirm:$false`).

### Etapa 3 — instruções de uso

Crie `D:\aumi-cockpit\scripts\WINDOWS-TASK-README.md` explicando:

1. Como rodar `install-bird-task.ps1` (provavelmente precisa abrir PowerShell como Admin)
2. Como ver a tarefa: `Get-ScheduledTask -TaskName "AUMI-Cockpit-Bird-Worker"`
3. Como disparar agora: `Start-ScheduledTask -TaskName "AUMI-Cockpit-Bird-Worker"`
4. Onde ver os logs: `D:\aumi-cockpit\logs\bird-YYYY-MM-DD.log`
5. Como desinstalar: rodar `uninstall-bird-task.ps1`
6. Aviso: workers só funcionam **com `AUTH_TOKEN` e `CT0` setados** no `.env.local`. Sem isso o worker loga "missing cookies" e exit não-zero. Não é bug — é por design.

### Etapa 4 — teste

Execute manualmente:

```powershell
powershell -ExecutionPolicy Bypass -File D:\aumi-cockpit\scripts\run-bird-worker.ps1
```

Confirme que:
- Cria `D:\aumi-cockpit\logs\bird-YYYY-MM-DD.log`
- Log contém output do `bird-mentions.mjs --once`
- Exit code é capturado corretamente

Reporte:
- Path completo dos 3 arquivos criados
- Resultado do teste manual (exit code + 5 últimas linhas do log)
- Confirmação se a tarefa foi registrada no Task Scheduler (`Get-ScheduledTask -TaskName "AUMI-Cockpit-Bird-Worker" | Format-List TaskName, State, NextRunTime`)

## Restrições

- **Não** alterar `workers/bird-mentions.mjs` — está pronto.
- **Não** commitar `.env.local` (já está no `.gitignore`).
- Se algo não puder ser feito sem privilégio de Admin, documente claramente em `WINDOWS-TASK-README.md` o passo manual que o João precisa fazer.
- Logs em arquivo de texto puro UTF-8, append-only por dia.

## Critério de sucesso

João deve conseguir:
1. Rodar `install-bird-task.ps1` uma vez
2. Adicionar `AUTH_TOKEN` e `CT0` em `.env.local`
3. Quando reabrir o PC ou após 15min, a tarefa dispara automaticamente e logs aparecem
4. Sinais do X começam a aparecer em `cockpit_signals` (`source='twitter'`) e o dashboard mostra

Não execute por conta própria a parte que precisa do bird CLI funcionar de fato — `AUTH_TOKEN`+`CT0` não estão no `.env.local` ainda. O teste manual é só pra validar que o pipeline PowerShell → Node → worker está OK.
