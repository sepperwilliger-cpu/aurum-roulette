import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: 'AURUM Roulette',
  description: 'Europäisches Multiplayer-Roulette mit Freunden – nur virtuelles Spielgeld, kein Echtgeld.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#07080a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de-CH">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
