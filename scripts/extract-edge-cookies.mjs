/**
 * Edge usa o mesmo schema do Chrome (Chromium). Mesma cripto até v127+,
 * mas Edge App-Bound Encryption ainda não está totalmente padrão (out-of-box).
 *
 * Tenta decifrar; se falhar, sugere CDP ou manual.
 */
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, statSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDecipheriv } from 'node:crypto';
import { Dpapi } from '@primno/dpapi';

const EDGE_DIR = `${os.homedir()}\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default`;
const COOKIES_DB = `${EDGE_DIR}\\Network\\Cookies`;
const LOCAL_STATE = `${os.homedir()}\\AppData\\Local\\Microsoft\\Edge\\User Data\\Local State`;
const TMP_DB = path.join(os.tmpdir(), `edge-cookies-${Date.now()}.db`);

console.log('source:', COOKIES_DB, existsSync(COOKIES_DB) ? `(${statSync(COOKIES_DB).size}b)` : '(MISSING)');
copyFileSync(COOKIES_DB, TMP_DB);

const db = new DatabaseSync(TMP_DB, { readOnly: false });
const rows = db
  .prepare(
    "SELECT host_key, name, encrypted_value FROM cookies WHERE name IN ('auth_token','ct0') AND (host_key LIKE '%x.com' OR host_key LIKE '%twitter.com')"
  )
  .all();
console.log(`\nfound ${rows.length} rows`);
for (const r of rows) console.log(`  ${r.host_key} · ${r.name} · ${r.encrypted_value.length}b`);
db.close();

if (rows.length === 0) {
  console.error('\nnenhum cookie de x.com no Edge. Você está logado em x.com no Edge?');
  process.exit(2);
}

const localState = JSON.parse(readFileSync(LOCAL_STATE, 'utf8'));
const encryptedKeyB64 = localState.os_crypt.encrypted_key;
const encryptedKey = Buffer.from(encryptedKeyB64, 'base64').subarray(5);
const masterKey = Dpapi.unprotectData(encryptedKey, null, 'CurrentUser');

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
    if (plain.length >= 32 && plain.subarray(0, 3).toString() === 'v10') plain = plain.subarray(32);
    return plain.toString();
  }
  return Dpapi.unprotectData(encrypted, null, 'CurrentUser').toString();
}

console.log('\n=== DECRYPTED ===');
const out = {};
for (const r of rows) {
  try {
    const v = decryptValue(r.encrypted_value);
    out[r.name] = v;
    console.log(`  ${r.name} = ${v.slice(0, 20)}... (${v.length}b)`);
  } catch (e) {
    console.error(`  ${r.name}: ${e.message}`);
  }
}

if (out.auth_token && out.ct0) {
  console.log(`\nAUTH_TOKEN=${out.auth_token}`);
  console.log(`CT0=${out.ct0}`);
}
