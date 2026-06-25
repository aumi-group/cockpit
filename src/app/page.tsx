import { Shell } from '@/components/Shell';
import { sql } from '@/lib/db';
import { Sparkline } from '@/components/Sparkline';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SOURCE_LABEL: Record<string, string> = {
  twitter: 'X', reddit: 'Reddit', hn: 'HN', bluesky: 'Bluesky',
  tabnews: 'Tabnews', 'google-news': 'Google News', lobsters: 'Lobste.rs'
};

async function getData() {
  const [signals24h, byHour, bySource, byKeyword, latest, alerts] = await Promise.all([
    sql`select count(*)::int as c from cockpit_signals where fetched_at > now() - interval '24 hours'`,
    sql`
      select date_trunc('hour', fetched_at) as bucket, count(*)::int as c
      from cockpit_signals
      where fetched_at > now() - interval '24 hours'
      group by 1 order by 1
    `,
    sql`
      select source, count(*)::int as c
      from cockpit_signals where fetched_at > now() - interval '7 days'
      group by source order by c desc
    `,
    sql`
      select kw, count(*)::int as c from (
        select unnest(matched_keywords) as kw from cockpit_signals
        where fetched_at > now() - interval '7 days'
      ) t group by kw order by c desc limit 8
    `,
    sql`
      select id, source, author, title, body, url, posted_at, fetched_at,
             matched_keywords, engagement
      from cockpit_signals
      order by fetched_at desc limit 40
    `,
    sql`
      select a.id, a.rule, a.severity, a.message, a.created_at, s.url
      from cockpit_alerts a
      left join cockpit_signals s on s.id = a.signal_id
      where a.ack_at is null
      order by a.created_at desc limit 10
    `
  ]);
  return {
    signals24h: signals24h[0]?.c ?? 0,
    byHour: byHour as Array<{ bucket: string; c: number }>,
    bySource: bySource as Array<{ source: string; c: number }>,
    byKeyword: byKeyword as Array<{ kw: string; c: number }>,
    latest, alerts
  };
}

export default async function Pulso() {
  let data;
  try { data = await getData(); }
  catch (e: any) {
    return (
      <Shell>
        <Header />
        <div className="p-6">
          <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-4">
            <div className="font-bold text-[var(--color-danger)]">DB indisponível</div>
            <div className="text-sm text-[var(--color-fg-dim)] mt-1 mono">{e.message}</div>
            <div className="text-sm mt-3">Cheque <code className="mono">DATABASE_URL</code> em <code>.env.local</code> e rode <code className="mono">psql $DATABASE_URL -f db/schema.sql</code>.</div>
          </div>
        </div>
      </Shell>
    );
  }

  const sparkData = data.byHour.map(b => b.c);

  return (
    <Shell>
      <Header signals24h={data.signals24h} />

      {data.alerts.length > 0 && (
        <section className="px-6 pt-2">
          <div className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning)]/5 p-3">
            <div className="text-xs uppercase tracking-wider text-[var(--color-warning)] mono mb-2">
              {data.alerts.length} alerta{data.alerts.length > 1 ? 's' : ''} sem ack
            </div>
            <ul className="space-y-1 text-sm">
              {data.alerts.slice(0, 5).map((a: any) => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className="mono text-[10px] text-[var(--color-fg-dim)] mt-0.5">[{a.rule}]</span>
                  <span className="flex-1">{a.message}</span>
                  {a.url && <a href={a.url} target="_blank" className="text-[var(--color-accent-soft)] text-xs">abrir →</a>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="px-6 py-5 grid grid-cols-12 gap-5">
        <Card title="Sinais — 24h" big={String(data.signals24h)} foot={
          <Sparkline data={sparkData} width={280} height={48} />
        } className="col-span-6" />
        <Card title="Por fonte (7d)" className="col-span-6">
          <ul className="space-y-1.5 mt-2">
            {data.bySource.map(s => (
              <li key={s.source} className="flex items-center justify-between text-sm">
                <span>{SOURCE_LABEL[s.source] || s.source}</span>
                <div className="flex items-center gap-3 flex-1 mx-3">
                  <div className="h-1.5 flex-1 bg-[var(--color-surface)] rounded overflow-hidden">
                    <div className="h-full bg-[var(--color-accent-soft)]" style={{
                      width: `${Math.min(100, (s.c / Math.max(...data.bySource.map(x => x.c))) * 100)}%`
                    }} />
                  </div>
                  <span className="mono text-xs text-[var(--color-fg-dim)] w-10 text-right">{s.c}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="px-6 pb-5 grid grid-cols-12 gap-5">
        <Card title="Top keywords — 7d" className="col-span-4">
          <div className="flex flex-wrap gap-2 mt-3">
            {data.byKeyword.map(k => (
              <span key={k.kw} className="px-2.5 py-1 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-xs">
                <span className="mono">{k.kw}</span>
                <span className="ml-2 text-[var(--color-fg-dim)]">{k.c}</span>
              </span>
            ))}
          </div>
        </Card>
        <Card title="Stream — últimos sinais" className="col-span-8">
          <ul className="divide-y divide-[var(--color-border)] -mx-4 mt-2 max-h-[420px] overflow-y-auto">
            {data.latest.map((s: any) => (
              <li key={s.id} className="px-4 py-2.5 hover:bg-[var(--color-surface)] transition">
                <div className="flex items-center justify-between text-[10px] mono text-[var(--color-fg-dim)] uppercase tracking-wider">
                  <span>{SOURCE_LABEL[s.source] || s.source} · {s.author || '—'}</span>
                  <span>{timeAgo(s.posted_at || s.fetched_at)}</span>
                </div>
                <a href={s.url} target="_blank" className="block text-sm mt-1 hover:text-[var(--color-accent-soft)]">
                  {s.title || (s.body || '').slice(0, 140)}
                </a>
                <div className="flex gap-1.5 mt-1.5">
                  {(s.matched_keywords || []).map((k: string) => (
                    <span key={k} className="text-[10px] mono px-1.5 py-0.5 rounded bg-[var(--color-surface-elevated)]">{k}</span>
                  ))}
                </div>
              </li>
            ))}
            {data.latest.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-[var(--color-fg-dim)]">
                Nenhum sinal ainda. Rode <code className="mono">npm run worker:pulso -- --once</code> pra coletar.
              </li>
            )}
          </ul>
        </Card>
      </section>
    </Shell>
  );
}

function Header({ signals24h }: { signals24h?: number }) {
  return (
    <header className="px-6 pt-5 pb-3 border-b border-[var(--color-border)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-fg-dim)] mono">PULSO</div>
          <h1 className="text-2xl font-bold mt-1">O que está acontecendo agora</h1>
        </div>
        {signals24h !== undefined && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-fg-dim)] mono">live</div>
            <div className="text-sm text-[var(--color-accent-soft)] mono">● aumi.group + mind</div>
          </div>
        )}
      </div>
    </header>
  );
}

function Card({ title, children, big, foot, className = '' }: any) {
  return (
    <div className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${className}`}>
      <div className="text-[10px] uppercase tracking-widest text-[var(--color-fg-dim)] mono">{title}</div>
      {big && <div className="text-4xl font-bold mt-1.5">{big}</div>}
      {children}
      {foot && <div className="mt-2">{foot}</div>}
    </div>
  );
}

function timeAgo(d: string | Date) {
  const ms = Date.now() - new Date(d).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s atrás`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
