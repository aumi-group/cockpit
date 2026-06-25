/**
 * Lê cookies do Chrome (já fechado ou não) e extrai auth_token + ct0 de x.com.
 *
 * Como Windows usa DPAPI para encrypted_value, precisamos decifrar via win32.
 * Estratégia: spawn um pequeno script Node que usa @primno/dpapi.
 *
 * Se @primno/dpapi não estiver instalado, instala-o.
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const CHROME_DIR = `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\User Data\\Default`;
const COOKIES_DB = `${CHROME_DIR}\\Network\\Cookies`;
const LOCAL_STATE = `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\User Data\\Local State`;
const TMP_DB = path.join(os.tmpdir(), `chrome-cookies-${Date.now()}.db`);

console.log('source:', COOKIES_DB, existsSync(COOKIES_DB) ? `(${statSync(COOKIES_DB).size}b)` : '(MISSING)');
copyFileSync(COOKIES_DB, TMP_DB);
console.log('copied to:', TMP_DB, `(${statSync(TMP_DB).size}b)`);

let db;
try {
  db = new DatabaseSync(TMP_DB, { readOnly: false });
} catch (e) {
  console.error('open db failed:', e.message);
  process.exit(1);
}

const rows = db
  .prepare(
    "SELECT host_key, name, encrypted_value FROM cookies WHERE name IN ('auth_token','ct0') AND (host_key LIKE '%x.com' OR host_key LIKE '%twitter.com')"
  )
  .all();

console.log(`\nfound ${rows.length} rows for auth_token/ct0:`);
for (const r of rows) console.log(`  ${r.host_key} · ${r.name} · encrypted ${r.encrypted_value.length}b`);
db.close();

if (rows.length === 0) {
  console.error('\nnenhum cookie x.com/twitter.com encontrado. Você está logado no x.com no Chrome?');
  process.exit(2);
}

// Tentar decifrar via @primno/dpapi
let dpapi;
try {
  dpapi = await import('@primno/dpapi');
} catch {
  console.log('\ninstalling @primno/dpapi…');
  spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '@primno/dpapi'], {
    stdio: 'inherit', shell: true
  });
  dpapi = await import('@primno/dpapi');
}

const Dpapi = dpapi.Dpapi || dpapi.default?.Dpapi || dpapi.default;

// Chrome v10+ usa AES com chave do Local State. v80+ é sempre AES.
// encrypted_value prefix:
//   "v10" / "v11" → AES-GCM com chave master do Local State (DPAPI protegida)
//   antigo: DPAPI direto
import { readFileSync } from 'node:fs';
import { createDecipheriv } from 'node:crypto';

const localState = JSON.parse(readFileSync(LOCAL_STATE, 'utf8'));
const encryptedKeyB64 = localState.os_crypt.encrypted_key;
const encryptedKey = Buffer.from(encryptedKeyB64, 'base64').subarray(5); // remove "DPAPI" prefix
const masterKey = Dpapi.unprotectData(encryptedKey, null, 'CurrentUser');

console.log('\nmaster key obtained:', masterKey.length, 'bytes');

function decryptValue(encrypted) {
  const prefix = encrypted.subarray(0, 3).toString();
  if (prefix === 'v10' || prefix === 'v11') {
    const iv = encrypted.subarray(3, 15);
    const payload = encrypted.subarray(15, encrypted.length - 16);
    const authTag = encrypted.subarray(encrypted.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);
    let plain = decipher.update(payload);
    plain = Buffer.concat([plain, decipher.final()]);
    // Chrome v24+ adiciona um header de 32 bytes "v10..." na frente do plaintext do cookie
    if (plain.length >= 32 && plain.subarray(0, 3).toString() === 'v10') {
      plain = plain.subarray(32);
    }
    return plain.toString();
  }
  // legacy
  return Dpapi.unprotectData(encrypted, null, 'CurrentUser').toString();
}

console.log('\n=== COOKIES DECRYPTED ===');
const out = {};
for (const r of rows) {
  try {
    const value = decryptValue(r.encrypted_value);
    out[r.name] = value;
    console.log(`  ${r.name} = ${value.slice(0, 20)}... (${value.length}b)`);
  } catch (e) {
    console.error(`  ${r.name}: decrypt failed: ${e.message}`);
  }
}

if (out.auth_token && out.ct0) {
  console.log('\n✓ ambos cookies extraídos. Use:');
  console.log(`AUTH_TOKEN=${out.auth_token}`);
  console.log(`CT0=${out.ct0}`);
}
