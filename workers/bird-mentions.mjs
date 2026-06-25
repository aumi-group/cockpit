#!/usr/bin/env node
/**
 * bird-mentions.mjs — coleta menções de X/Twitter via bird CLI.
 *
 * Para cada query habilitada com source='twitter':
 *   - chama `bird search <query> --json`
 *   - extrai tweets, persiste em cockpit_signals
 *   - dispara alertas no cockpit_alerts conforme regras (negativo, alta engajamento)
 *
 * Para cada actor monitorado em source='twitter':
 *   - chama `bird user-tweets <handle> --limit 20 --json`
 *   - persiste posts deles em cockpit_signals com author marcado
 *
 * Roda em loop com intervalo dinâmico baseado em cockpit_queries.interval_seconds.
 * Usa AUTH_TOKEN + CT0 do .env.
 */
import { spawn } from 'node:child_process';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({ path: new URL('../.env', import.meta.url) });
config({ path: new URL('../.env.local', import.meta.url) });

const sql = neon(process.env.DATABASE_URL);
const BIRD = process.platform === 'win32'
  ? 'C:\\Users\\blzja\\AppData\\Roaming\\nvm\\v22.22.3\\bird.cmd'
  : 'bird';

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

function runBird(args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (process.env.AUTH_TOKEN) env.AUTH_TOKEN = process.env.AUTH_TOKEN;
    if (process.env.CT0) env.CT0 = process.env.CT0;
    const proc = spawn(BIRD, args, { env, shell: false });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`bird exited ${code}: ${stderr}`));
    });
  });
}

function parseTweets(stdout) {
  // bird saída padrão é texto formatado. JSON precisa de --json se suportado, senão parse manual.
  // Estratégia robusta: tenta JSON primeiro, cai pra regex.
  try {
    const json = JSON.parse(stdout);
    if (Array.isArray(json)) return json;
    if (json.tweets) return json.tweets;
  } catch { /* fallthrough */ }
  // Parse manual de "ID: 12345... | @handle | <text>" estilo bird text output.
  const tweets = [];
  const blocks = stdout.split(/\n\s*\n/);
  for (const b of blocks) {
    const idMatch = b.match(/(?:tweet|status)[\/=](\d+)/i) || b.match(/^(\d{15,})/m);
    const handleMatch = b.match(/@([a-zA-Z0-9_]+)/);
    if (!idMatch) continue;
    tweets.push({
      id_str: idMatch[1],
      user: { screen_name: handleMatch?.[1] || 'unknown' },
      full_text: b.slice(0, 1000),
      created_at: new Date().toISOString(),
      favorite_count: 0,
      retweet_count: 0,
      reply_count: 0
    });
  }
  return tweets;
}

async function persistTweet(t, matchedQuery, matchedKeywords) {
  const url = `https://x.com/${t.user?.screen_name || t.author || 'i'}/status/${t.id_str || t.id}`;
  const engagement = {
    likes: t.favorite_count ?? 0,
    retweets: t.retweet_count ?? 0,
    replies: t.reply_count ?? 0,
    quotes: t.quote_count ?? 0,
    views: t.view_count ?? 0
  };
  try {
    const [row] = await sql`
      insert into cockpit_signals (
        source, source_id, url, author, author_url, title, body,
        matched_query, matched_keywords, engagement, posted_at, raw
      )
      values (
        'twitter', ${t.id_str || String(t.id)}, ${url},
        ${'@' + (t.user?.screen_name || t.author || 'unknown')},
        ${'https://x.com/' + (t.user?.screen_name || t.author || '')},
        ${(t.full_text || t.text || '').slice(0, 200)},
        ${t.full_text || t.text || ''},
        ${matchedQuery},
        ${matchedKeywords},
        ${JSON.stringify(engagement)}::jsonb,
        ${t.created_at ? new Date(t.created_at).toISOString() : new Date().toISOString()},
        ${JSON.stringify(t)}::jsonb
      )
      on conflict (source, source_id) do nothing
      returning id, body
    `;
    return row;
  } catch (e) {
    console.error('  persist error:', e.message);
    return null;
  }
}

function detectKeywords(text) {
  const kw = [];
  const t = (text || '').toLowerCase();
  if (/\baumi\b|aumi\.group/.test(t)) kw.push('aumi');
  if (/\bmind\b/.test(t)) kw.push('mind');
  if (/ai\s*native/.test(t)) kw.push('ai-native');
  if (/agent\s*os|agentos/.test(t)) kw.push('agent-os');
  if (/brain\s*corporativo/.test(t)) kw.push('brain');
  if (/\bslop\b/.test(t)) kw.push('slop');
  if (/jo[ãa]o\s*boy|@blzzjao/.test(t)) kw.push('joao');
  return kw;
}

async function maybeAlert(row, engagement) {
  if (!row) return;
  if ((engagement.likes ?? 0) >= 100 || (engagement.retweets ?? 0) >= 30) {
    await sql`
      insert into cockpit_alerts (signal_id, rule, severity, message)
      values (${row.id}, 'high_engagement', 'warning',
        ${`Tweet com alto engajamento mencionando AUMI: ${row.body.slice(0, 120)}`})
    `;
    await sendTelegram(`�� <b>Tweet quente</b>\n${row.body.slice(0, 200)}`);
  }
}

async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML', disable_web_page_preview: false })
    });
  } catch {}
}

async function processQuery(q) {
  console.log(`→ [${q.source}] ${q.query}`);
  try {
    const out = await runBird(['search', q.query, '--limit', '50']);
    const tweets = parseTweets(out);
    let inserted = 0;
    for (const t of tweets) {
      const text = t.full_text || t.text || '';
      const kw = detectKeywords(text);
      if (kw.length === 0) continue;
      const row = await persistTweet(t, q.query, kw);
      if (row) {
        inserted++;
        await maybeAlert(row, {
          likes: t.favorite_count,
          retweets: t.retweet_count
        });
      }
    }
    await sql`update cockpit_queries set last_run_at=now(), last_count=${inserted} where id=${q.id}`;
    console.log(`  ✓ ${inserted} novos sinais`);
    return inserted;
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
    return 0;
  }
}

async function processActor(a) {
  console.log(`→ actor @${a.handle}`);
  try {
    const out = await runBird(['user-tweets', a.handle.replace(/^@/, ''), '--limit', '10']);
    const tweets = parseTweets(out);
    let inserted = 0;
    for (const t of tweets) {
      const text = t.full_text || t.text || '';
      const kw = detectKeywords(text);
      const row = await persistTweet(t, `actor:${a.handle}`, kw.length ? kw : [a.label || 'actor']);
      if (row) inserted++;
    }
    console.log(`  ✓ ${inserted} novos`);
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
  }
}

async function tick() {
  const now = new Date();
  const queries = await sql`
    select * from cockpit_queries
    where source='twitter' and enabled=true
    and (last_run_at is null or last_run_at < now() - (interval_seconds * interval '1 second'))
  `;
  console.log(`[${now.toISOString()}] ${queries.length} queries devidas`);
  for (const q of queries) await processQuery(q);

  const actors = await sql`
    select * from cockpit_actors where source='twitter'
  `;
  // actors rodam a cada 4 ticks (~1h)
  if (Math.floor(Date.now() / 60000) % 60 === 0) {
    for (const a of actors) await processActor(a);
  }
}

async function main() {
  console.log('AUMI Cockpit · bird-mentions worker iniciado');
  console.log(`Bird CLI: ${BIRD}`);
  if (!process.env.AUTH_TOKEN || !process.env.CT0) {
    console.warn('⚠ AUTH_TOKEN/CT0 ausentes — bird usará fallback de cookies do browser');
  }
  while (true) {
    try { await tick(); }
    catch (e) { console.error('tick error:', e.message); }
    await new Promise(r => setTimeout(r, 60_000));
  }
}

if (process.argv.includes('--once')) {
  tick().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
} else {
  main();
}
