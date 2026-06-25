import { Shell } from '@/components/Shell';
export const dynamic = 'force-dynamic';
export default function Saude() {
  return (
    <Shell>
      <header className="px-6 pt-5 pb-3 border-b border-[var(--color-border)]">
        <div className="text-[10px] uppercase tracking-widest text-[var(--color-fg-dim)] mono">SAÚDE</div>
        <h1 className="text-2xl font-bold mt-1">Sistema + custo</h1>
        <p className="text-sm text-[var(--color-fg-dim)] mt-1">Sprint 4 · status SEO, indexação, custo de token.</p>
      </header>
      <div className="px-6 py-6 text-sm text-[var(--color-fg-dim)]">Em construção.</div>
    </Shell>
  );
}
