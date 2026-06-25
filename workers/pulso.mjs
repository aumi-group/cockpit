#!/usr/bin/env node
/**
 * pulso.mjs — orquestra todos os coletores não-Twitter:
 *   - HackerNews via Algolia (público, sem auth)
 *   - Reddit via PRAW (auth opcional)
 *   - Bluesky via @atproto/api
 *   - Tabnews via RSS público
 *   - Google News BR via RSS
 *   - Lobste.rs via RSS
 *
 * Persiste em cockpit_signals. Dispara alertas conforme regras simples.
 */
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import Parser from 'rss-parser';

config({ path: new URL('../.env', import.meta.url) });
config({ path: new URL('../.env.local', import.meta.url) });

const sql = neon(process.env.DATABASE_URL);
const parser = new Parser({ timeout: 20_000 });
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;

// Regex precisos pra evitar falso-positivo ("mind" sozinho é muito comum em inglês).
const KEYWORD_PATTERNS = {
  aumi: /\baumi\b|aumi\.group/i,
  // MIND só pega quando contexto AUMI/agente/tauri está perto
  mind: /(?:\bmind\b.*(?:agent|tauri|aumi|desktop\s*agent|presence)|aumi.*\bmind\b|aumi-group\/mind)/i,
  'ai-native': /ai[\s-]native/i,
  'agent-os': /\bagent[\s-]os\b|\bagentos\b/i,
  brain: /brain\s+corporativo|corporate\s+brain.*agent/i,
  slop: /\bai\s*slop\b|\bslop\s*c[oó]digo|\bvibe[- ]?coding\b/i,
  joao: /jo[ãa]o\s*boy|@blzzjao|blzzjao/i
};

function detectKeywords(text) {
  const out = [];
  for (const [k, re] of Object.entries(KEYWORD_PATTERNS)) {
    if (re.test(text || '')) out.push(k);
  }
  return out;
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

async function persist(sig) {
  try {
    const [row] = await sql`
      insert into cockpit_signals (
        source, source_id, url, author, author_url, title, body,
        matched_query, matched_keywords, engagement, posted_at, raw
      )
      values (
        ${sig.source}, ${sig.source_id}, ${sig.url}, ${sig.author},
        ${sig.author_url || null}, ${sig.title?.slice(0, 250) || null}, ${sig.body?.slice(0, 8000) || null},
        ${sig.matched_query}, ${sig.matched_keywords}, ${JSON.stringify(sig.engagement || {})}::jsonb,
        ${sig.posted_at}, ${JSON.stringify(sig.raw || {})}::jsonb
      )
      on conflict (source, source_id) do nothing
      returning id
    `;
    return row;
  } catch (e) {
    console.error(`  persist [${sig.source}]:`, e.message);
    return null;
  }
}

// =================== HACKER NEWS (Algolia) ===================
async function collectHN() {
  const queries = await sql`select * from cockpit_queries where source='hn' and enabled=true`;
  let total = 0;
  for (const q of queries) {
    try {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q.query)}&tags=story&hitsPerPage=20`;
      const r = await fetch(url);
      const j = await r.json();
      for (const hit of j.hits || []) {
        const text = `${hit.title || ''} ${hit.story_text || hit.comment_text || ''}`;
        const kw = detectKeywords(text);
        if (!kw.length) continue;
        const row = await persist({
          source: 'hn',
          source_id: String(hit.objectID),
          url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          author: hit.author,
          author_url: `https://news.ycombinator.com/user?id=${hit.author}`,
          title: hit.title,
          body: hit.story_text || hit.comment_text,
          matched_query: q.query,
          matched_keywords: kw,
          engagement: { points: hit.points, comments: hit.num_comments },
          posted_at: hit.created_at,
          raw: hit
        });
        if (row) {
          total++;
          if ((hit.points ?? 0) >= 50) {
            await sendTelegram(`�� <b>HN trending</b>\n${hit.title}\n${hit.points} pts · ${hit.num_comments} cm\nhttps://news.ycombinator.com/item?id=${hit.objectID}`);
          }
        }
      }
      await sql`update cockpit_queries set last_run_at=now(), last_count=${j.nbHits || 0} where id=${q.id}`;
    } catch (e) { console.error('HN:', e.message); }
  }
  return total;
}

// =================== REDDIT (sem auth, JSON público) ===================
async function collectReddit() {
  const queries = await sql`select * from cockpit_queries where source='reddit' and enabled=true`;
  let total = 0;
  for (const q of queries) {
    try {
      const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q.query)}&sort=new&limit=25&t=week&raw_json=1`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'AumiCockpitBot/0.1 (by /u/blzzjao; contact: contato@aumi.group)',
          'Accept': 'application/json'
        }
      });
      if (!r.ok) { console.error('Reddit HTTP', r.status, 'for', q.query); continue; }
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) { console.error('Reddit non-json for', q.query); continue; }
      const j = await r.json();
      for (const hit of (j.data?.children || [])) {
        const d = hit.data;
        const text = `${d.title} ${d.selftext || ''}`;
        const kw = detectKeywords(text);
        if (!kw.length) continue;
        const row = await persist({
          source: 'reddit',
          source_id: d.id,
          url: `https://reddit.com${d.permalink}`,
          author: d.author,
          author_url: `https://reddit.com/user/${d.author}`,
          title: d.title,
          body: d.selftext,
          matched_query: q.query,
          matched_keywords: kw,
          engagement: { upvotes: d.ups, comments: d.num_comments, ratio: d.upvote_ratio },
          posted_at: new Date(d.created_utc * 1000).toISOString(),
          raw: d
        });
        if (row) {
          total++;
          if ((d.ups ?? 0) >= 100) {
            await sendTelegram(`�� <b>Reddit hot</b> r/${d.subreddit}\n${d.title}\n${d.ups} ↑ · ${d.num_comments} cm\nhttps://reddit.com${d.permalink}`);
          }
        }
      }
      await sql`update cockpit_queries set last_run_at=now() where id=${q.id}`;
    } catch (e) { console.error('Reddit:', e.message); }
  }
  return total;
}

// =================== BLUESKY ===================
async function collectBluesky() {
  const queries = await sql`select * from cockpit_queries where source='bluesky' and enabled=true`;
  let total = 0;
  for (const q of queries) {
    try {
      // search.posts público (sem auth pra leitura básica)
      const url = `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q.query)}&limit=25`;
      const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!r.ok) { console.error('Bluesky HTTP', r.status, 'for', q.query); continue; }
      const j = await r.json();
      for (const p of (j.posts || [])) {
        const text = p.record?.text || '';
        const kw = detectKeywords(text);
        if (!kw.length) continue;
        const row = await persist({
          source: 'bluesky',
          source_id: p.uri,
          url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`,
          author: '@' + p.author.handle,
          author_url: `https://bsky.app/profile/${p.author.handle}`,
          title: text.slice(0, 200),
          body: text,
          matched_query: q.query,
          matched_keywords: kw,
          engagement: { likes: p.likeCount, reposts: p.repostCount, replies: p.replyCount },
          posted_at: p.indexedAt || p.record?.createdAt,
          raw: p
        });
        if (row) total++;
      }
      await sql`update cockpit_queries set last_run_at=now() where id=${q.id}`;
    } catch (e) { console.error('Bluesky:', e.message); }
  }
  return total;
}

// =================== RSS genérico (Tabnews, Google News, Lobsters) ===================
const RSS_FEEDS = {
  tabnews: (q) => `https://www.tabnews.com.br/recentes/rss`,
  'google-news': (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`,
  lobsters: (q) => `https://lobste.rs/search.rss?q=${encodeURIComponent(q)}`
};

async function collectRSS(source) {
  const queries = await sql`select * from cockpit_queries where source=${source} and enabled=true`;
  let total = 0;
  for (const q of queries) {
    const url = RSS_FEEDS[source]?.(q.query);
    if (!url) continue;
    try {
      const feed = await parser.parseURL(url);
      for (const item of (feed.items || [])) {
        const text = `${item.title || ''} ${item.contentSnippet || item.content || ''}`;
        const kw = detectKeywords(text);
        if (!kw.length) continue;
        const row = await persist({
          source,
          source_id: item.guid || item.link,
          url: item.link,
          author: item.creator || item.author || feed.title,
          title: item.title,
          body: item.contentSnippet || item.content,
          matched_query: q.query,
          matched_keywords: kw,
          engagement: {},
          posted_at: item.isoDate || item.pubDate,
          raw: item
        });
        if (row) total++;
      }
      await sql`update cockpit_queries set last_run_at=now() where id=${q.id}`;
    } catch (e) { console.error(`${source}:`, e.message); }
  }
  return total;
}

async function tick() {
  console.log(`[${new Date().toISOString()}] pulso tick`);
  const hn = await collectHN();
  const rd = await collectReddit();
  const bs = await collectBluesky();
  const tn = await collectRSS('tabnews');
  const gn = await collectRSS('google-news');
  const lo = await collectRSS('lobsters');
  console.log(`  HN:${hn} RD:${rd} BS:${bs} TN:${tn} GN:${gn} LO:${lo}`);
}

async function main() {
  console.log('AUMI Cockpit · pulso worker iniciado (HN/Reddit/Bluesky/Tabnews/GoogleNews/Lobsters)');
  while (true) {
    try { await tick(); }
    catch (e) { console.error('tick error:', e); }
    await new Promise(r => setTimeout(r, 5 * 60_000));
  }
}

if (process.argv.includes('--once')) {
  tick().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
} else {
  main();
}
