/**
 * Conecta no Chrome DevTools Protocol (CDP) na porta 9222 e extrai
 * auth_token + ct0 de x.com via Network.getAllCookies — sem precisar decifrar nada.
 */
import WebSocket from 'ws';

const VERSION_URL = 'http://127.0.0.1:9222/json/version';
const TARGETS_URL = 'http://127.0.0.1:9222/json';

const v = await (await fetch(VERSION_URL)).json();
const browserWsUrl = v.webSocketDebuggerUrl;
if (!browserWsUrl) {
  console.error('webSocketDebuggerUrl ausente. CDP não está ativo na 9222?');
  process.exit(1);
}
console.log('connecting:', browserWsUrl);

const ws = new WebSocket(browserWsUrl);
let nextId = 1;
const pending = new Map();

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((r) => ws.once('open', r));
console.log('connected');

// Storage.getCookies funciona globalmente (Network.getAllCookies só pega da tab atual)
const { cookies } = await call('Storage.getCookies');
console.log(`total cookies: ${cookies.length}`);

const x = cookies.filter((c) => c.domain.endsWith('x.com') || c.domain.endsWith('twitter.com'));
console.log(`x.com/twitter.com cookies: ${x.length}`);

const auth = x.find((c) => c.name === 'auth_token');
const ct0 = x.find((c) => c.name === 'ct0');

if (!auth || !ct0) {
  console.error('\nauth_token ou ct0 ausentes. Você está logado no x.com no Chrome que está rodando com CDP?');
  console.error('cookies x.com encontrados:', x.map((c) => `${c.domain}/${c.name}`).join(', '));
  ws.close();
  process.exit(2);
}

console.log('\n=== EXTRACTED ===');
console.log(`AUTH_TOKEN=${auth.value}`);
console.log(`CT0=${ct0.value}`);
console.log(`\n(auth_token: ${auth.value.length}b, ct0: ${ct0.value.length}b)`);

// Salva pra ser lido por script seguinte
import { writeFileSync } from 'node:fs';
writeFileSync(
  new URL('../.cookies-extracted.json', import.meta.url),
  JSON.stringify({ AUTH_TOKEN: auth.value, CT0: ct0.value, extracted_at: new Date().toISOString() }, null, 2)
);
console.log('saved to .cookies-extracted.json');

ws.close();
process.exit(0);
