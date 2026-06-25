# Prompt pra Claude Code (Sonnet 4.6) — extrair cookies do X.com

> Cole tudo a partir de "Você é" no Claude Code rodando em `D:\aumi-cockpit\`.

---

Você é um agente Claude Code (Sonnet 4.6) operando em `D:\aumi-cockpit\` no PC do João (Windows 11). Sua tarefa: extrair os cookies `auth_token` e `ct0` do x.com (conta `@blzzjao`, perfil Chrome `Default` = email `carkadan@gmail.com`) e salvá-los em `D:\aumi-cockpit\.cookies-extracted.json`.

## Contexto técnico (já mapeado — não repita o trabalho)

Outro agente (pi) já tentou e bateu nestes muros:

1. **SQLite Cookies do Chrome 139**: usa App-Bound Encryption (ABE) desde v127. DPAPI normal não decifra. Erro 13 da `@primno/dpapi`.
2. **Chrome DevTools Protocol (CDP)**: bloqueado por **política corporativa** no perfil `Default` (existe `HKLM\Software\Policies\Google\Chrome`). Quando inicia Chrome com `--remote-debugging-port=9222`, a flag é ignorada silenciosamente e `DevToolsActivePort` não é criado.
3. **Profile temporário com Cookies copiado**: Chrome reescreve o arquivo Cookies ao subir; copiar o original não funciona porque a master key DPAPI está atrelada ao path original do user.
4. **Edge**: João não tem login no x.com no Edge.
5. **Selenium com profile temp**: rodou (`scripts/extract-via-selenium.py`), abriu janela, mas João não conseguiu visualizar/usar a janela na barra de tarefas e timeout de 7 min.

## Caminhos que VOCÊ pode tentar (em ordem)

### Caminho A — Chrome Canary ou Chromium standalone
- Verifica se `Chrome Canary` ou `Chromium` standalone existem no sistema (`Get-Command chrome.exe`, procurar em `%LOCALAPPDATA%\Google\Chrome SxS\Application\`)
- Estas builds normalmente **ignoram policies do Chrome stable**
- Se existe, abre Chrome Canary com `--remote-debugging-port=9222 --user-data-dir=<dir-com-cookies-do-default>` e tenta CDP
- Se conecta, usa o script `scripts/extract-via-cdp.mjs` (já pronto) ou escreve novo

### Caminho B — Bypass de policy via Edge (modo IE / WebView2)
- Edge respeita os mesmos cookies do Chrome quando importados, MAS só se importados explicitamente pelo user
- Verifica se Edge tem perfil com `https://x.com` logado: `dir "%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Network\Cookies"`
- Edge na versão atual ainda **não usa ABE** por padrão. `scripts/extract-edge-cookies.mjs` (já pronto) funcionaria se houvesse login.
- Se Edge não tem login → não dá pra usar.

### Caminho C — Decifrar ABE direto via injection (técnico)
- ABE master key fica em `Local State` mas é **wrapped duas vezes**: DPAPI normal + um segundo wrap que só o processo Chrome assinado pode desempacotar
- Existem libs Python como `pycookiecheat`, `browser-cookie3` (≥ 0.20) que tentam o bypass
- Tenta: `pip install browser-cookie3` (na venv certa: `C:/Users/blzja/AppData/Local/Programs/Python/Python310/python.exe -m pip install browser-cookie3`)
- Roda:
  ```python
  import browser_cookie3
  cj = browser_cookie3.chrome(domain_name='x.com')
  for c in cj:
      if c.name in ('auth_token', 'ct0'):
          print(c.name, c.value)
  ```
- Se `browser-cookie3` falhar com ABE, **NÃO seguir frente** — vai dar mesmo erro do pi

### Caminho D — Selenium MAS forçando janela em foco e captura imediata
- Pega o melhor do que pi tentou: rode Selenium, mas:
  - Maximize a janela: `driver.maximize_window()`
  - Use `pyautogui` para trazer a janela pra frente e dar um beep audível pro João (`import winsound; winsound.Beep(1000, 1000)`)
  - **Importante**: enviar uma notificação Telegram explícita (token e chat ID estão em `.env.local`) avisando "JANELA SELENIUM ABERTA — clica no Chrome novo, loga, capturo automático"
  - Timeout de 20 min, polling a cada 3s
- Quando João logar, captura.

### Caminho E — instruir João via Telegram a fazer F12 manual e mandar via Telegram
- Manda mensagem Telegram com instrução curta e o caminho exato do arquivo onde colar
- João abre x.com, F12 → Application → Cookies → x.com → copia 2 valores
- Cria um endpoint local ou diretamente lê via clipboard
- **Não é "preguiça"**: 30s deste caminho > 1h tentando bypass técnico

## Stack disponível

- Node 22.22.3 em `C:\Program Files\nodejs\node.exe`
- Python 3.10 em `C:\Users\blzja\AppData\Local\Programs\Python\Python310\python.exe` com Selenium 4.31.1
- Chrome 139.0.7258.128 em `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Edge instalado mas sem login no x.com
- Cookies do Chrome em `C:\Users\blzja\AppData\Local\Google\Chrome\User Data\Default\Network\Cookies`
- Telegram bot configurado (`.env.local` tem `TELEGRAM_BOT_TOKEN`=8878073526:AAECfTHdQzOfIpLIQ9q370Mogjrw73IPrJo e `TELEGRAM_CHAT_ID`=5166650114)

## Critério de sucesso

Salvar em `D:\aumi-cockpit\.cookies-extracted.json`:
```json
{
  "AUTH_TOKEN": "<40+ chars hex>",
  "CT0": "<160 chars hex>",
  "extracted_at": "<ISO timestamp>"
}
```

## O que NÃO fazer

- Não tentar de novo o que pi já tentou (decifrar ABE com `@primno/dpapi`, CDP no profile `Default`, copiar Cookies pra profile temp).
- Não criar scripts redundantes — modifica os existentes ou escreve UM novo com nome claro.
- Não pedir cookies em texto pro João como primeira opção — só se A-D falharem **todos**.
- Não rodar Chrome interativo por mais de 10 min sem checkpoint (notifica via Telegram a cada 2-3 min).

## Quando reportar de volta

Reporte:
1. Qual caminho A/B/C/D/E você seguiu
2. Se sucesso: hash dos primeiros 6 chars de cada cookie (não cole valor inteiro) + path do arquivo salvo
3. Se falha: por quê, com erro exato
4. Tempo gasto em cada caminho

Execute. Você tem permissão pra editar arquivos, rodar comandos, instalar pacotes Python/Node, e usar Telegram do João.
