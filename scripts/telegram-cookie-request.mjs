/**
 * Caminho E: envia instrução pro João via Telegram e faz polling por 20 min.
 * João deve responder com: auth_token=VALOR ct0=VALOR
 * (ou copiar direto em .env.local e responder "ok")
 */
import { writeFileSync, readFileSync } from 'node:fs';

const BOT_TOKEN = '8878073526:AAECfTHdQzOfIpLIQ9q370Mogjrw73IPrJo';
const CHAT_ID = '5166650114';
const OUTPUT = 'D:\\aumi-cockpit\\.cookies-extracted.json';

const api = (method, body = {}) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const msg = `🍪 *Cookie extraction — aumi-cockpit*

Preciso dos cookies do x.com do Chrome. Rápido (30s):

1. Abre https://x.com no Chrome
2. F12 → Application → Cookies → https://x.com
3. Copia os 2 valores:
   • \`auth_token\` (linha rosa/laranja, ~40 chars hex)
   • \`ct0\` (~160 chars hex)
4. Responde aqui neste formato exato:

\`\`\`
auth_token=SEU_VALOR_AQUI
ct0=SEU_VALOR_AQUI
\`\`\`

(Tudo numa mensagem só, cada um numa linha)`;

console.log('Enviando mensagem Telegram...');
const sent = await api('sendMessage', { chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' });
if (!sent.ok) {
  console.error('Falha ao enviar Telegram:', sent);
  process.exit(1);
}
console.log('Mensagem enviada. Aguardando resposta (20 min)...');

// Polling
let offset = 0;
const deadline = Date.now() + 20 * 60 * 1000;
const POLL_INTERVAL = 3000;

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL));

  const updates = await api('getUpdates', { offset, timeout: 2, allowed_updates: ['message'] });
  if (!updates.ok) continue;

  for (const update of updates.result) {
    offset = update.update_id + 1;
    const text = update.message?.text?.trim() ?? '';
    if (!text) continue;

    // Aceita "auth_token=XXX\nct0=YYY" ou "auth_token=XXX ct0=YYY"
    const authMatch = text.match(/auth_token=([a-f0-9]{30,})/i);
    const ct0Match  = text.match(/ct0=([a-f0-9]{100,})/i);

    if (authMatch && ct0Match) {
      const AUTH_TOKEN = authMatch[1];
      const CT0 = ct0Match[1];
      const extracted_at = new Date().toISOString();

      writeFileSync(OUTPUT, JSON.stringify({ AUTH_TOKEN, CT0, extracted_at }, null, 2));

      await api('sendMessage', {
        chat_id: CHAT_ID,
        text: `✅ Cookies capturados!\nauth_token: \`${AUTH_TOKEN.slice(0, 6)}...\`\nct0: \`${CT0.slice(0, 6)}...\`\nSalvo em .cookies-extracted.json`,
        parse_mode: 'Markdown',
      });

      console.log('SUCCESS');
      console.log(`AUTH_TOKEN[:6]=${AUTH_TOKEN.slice(0, 6)}`);
      console.log(`CT0[:6]=${CT0.slice(0, 6)}`);
      console.log('Salvo em .cookies-extracted.json');
      process.exit(0);
    }
  }

  const remaining = Math.round((deadline - Date.now()) / 60000);
  if (remaining % 5 === 0 && remaining > 0) {
    console.log(`Aguardando resposta... ${remaining} min restantes`);
  }
}

console.error('Timeout: João não respondeu em 20 min');
process.exit(1);
