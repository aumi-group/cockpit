'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: '�� Pulso', sub: 'sinais agora' },
  { href: '/mercado', label: '�� Mercado', sub: 'concorrência + tópicos' },
  { href: '/criacao', label: '✏️ Criação', sub: 'pauta + drafts + qc' },
  { href: '/conversao', label: '�� Conversão', sub: 'leads + funil' },
  { href: '/saude', label: '�� Saúde', sub: 'sistema + custo' }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col">
        <div className="p-5 border-b border-[var(--color-border)]">
          <div className="text-xs uppercase tracking-widest text-[var(--color-fg-dim)] mono">AUMI</div>
          <div className="text-xl font-bold mt-1">Cockpit</div>
          <div className="text-xs text-[var(--color-fg-dim)] mt-1">v0.1 · alpha</div>
        </div>
        <nav className="flex-1 p-2">
          {NAV.map(n => {
            const active = pathname === n.href || (n.href !== '/' && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`block px-3 py-2.5 rounded-md mb-1 transition ${
                  active
                    ? 'bg-[var(--color-surface-elevated)] text-[var(--color-fg)]'
                    : 'text-[var(--color-fg-dim)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-fg)]'
                }`}
              >
                <div className="text-sm font-medium">{n.label}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-dim)] mono">{n.sub}</div>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[var(--color-border)] text-[10px] text-[var(--color-fg-dim)] mono">
          <div>uptime: ok</div>
          <div className="mt-1">workers: ativos</div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
