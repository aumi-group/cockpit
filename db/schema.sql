-- AUMI Cockpit · schema
-- Pode coexistir com o aumi-content-engine no mesmo Neon (tabelas dedicadas com prefixo "cockpit_").

create extension if not exists "uuid-ossp";

-- Sinais coletados (menções, posts, news)
create table if not exists cockpit_signals (
  id uuid primary key default uuid_generate_v4(),
  source text not null,                         -- 'twitter' | 'reddit' | 'hn' | 'bluesky' | 'tabnews' | 'google-news' | 'lobsters'
  source_id text,                               -- ID nativo do post na plataforma
  url text,
  author text,
  author_url text,
  title text,
  body text,
  matched_query text not null,                  -- qual query/regex pegou ele
  matched_keywords text[],                      -- 'aumi', 'mind', 'ai native', etc.
  sentiment text,                               -- 'positive' | 'neutral' | 'negative' | null
  engagement jsonb,                             -- { likes, comments, retweets, ... }
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  raw jsonb,
  unique(source, source_id)
);

create index if not exists idx_signals_posted on cockpit_signals(posted_at desc);
create index if not exists idx_signals_source on cockpit_signals(source);
create index if not exists idx_signals_keywords on cockpit_signals using gin(matched_keywords);

-- Consultas que rodamos periodicamente
create table if not exists cockpit_queries (
  id uuid primary key default uuid_generate_v4(),
  source text not null,
  query text not null,
  enabled boolean not null default true,
  interval_seconds int not null default 900,   -- 15min default
  last_run_at timestamptz,
  last_count int default 0,
  unique(source, query)
);

-- Concorrentes/Personas que monitoramos
create table if not exists cockpit_actors (
  id uuid primary key default uuid_generate_v4(),
  handle text not null,                         -- @username
  source text not null,                         -- twitter, linkedin (manual), bluesky, github
  label text,                                   -- "concorrente direto", "influencer", "cliente alvo"
  notes text,
  added_at timestamptz default now(),
  unique(handle, source)
);

-- Alertas disparados (pra Telegram + UI)
create table if not exists cockpit_alerts (
  id uuid primary key default uuid_generate_v4(),
  signal_id uuid references cockpit_signals(id) on delete cascade,
  rule text not null,                           -- 'mention_negative', 'competitor_post', 'high_engagement', 'first_mention'
  severity text not null default 'info',        -- 'info' | 'warning' | 'critical'
  message text not null,
  delivered_at timestamptz,
  ack_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_alerts_unack on cockpit_alerts(created_at desc) where ack_at is null;

-- Seed das queries iniciais
insert into cockpit_queries (source, query, interval_seconds) values
  ('twitter', 'AUMI Group OR @blzzjao OR aumi.group', 600),
  ('twitter', '"AI Native" consultoria', 1800),
  ('twitter', 'agentes IA brasil', 1800),
  ('reddit', 'aumi', 3600),
  ('reddit', 'AI Native', 3600),
  ('hn', 'AUMI', 3600),
  ('hn', 'agent OS', 3600),
  ('bluesky', 'aumi.group', 1800),
  ('bluesky', 'AI Native', 3600),
  ('tabnews', 'aumi', 3600),
  ('google-news', 'AUMI Group', 3600),
  ('google-news', 'consultoria AI Native Brasil', 3600)
on conflict (source, query) do nothing;

-- Seed concorrentes (manual depois)
insert into cockpit_actors (handle, source, label) values
  ('semantix', 'twitter', 'consultoria dados/IA BR'),
  ('blackrocks', 'twitter', 'consultoria IA BR'),
  ('@blzzjao', 'twitter', 'self')
on conflict (handle, source) do nothing;
