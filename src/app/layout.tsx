import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AUMI Cockpit · inteligência de mercado em tempo real',
  description: 'Painel de comando da AUMI Group. Pulso, mercado, criação, conversão, saúde.',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
