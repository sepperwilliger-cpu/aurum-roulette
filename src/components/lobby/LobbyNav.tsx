'use client';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';

export const SECTIONS = [
  { id: 'start', label: 'Startseite' },
  { id: 'ablauf', label: 'So funktioniert’s' },
  { id: 'features', label: 'Features' },
  { id: 'sicherheit', label: 'Sicherheit' },
  { id: 'faq', label: 'FAQ' },
] as const;

/** Kopfzeile: Logo, Sprungmarken (markiert den sichtbaren Abschnitt), Verbindungsstatus. */
export function LobbyNav({ connected }: { connected: boolean }) {
  const [active, setActive] = useState<string>('start');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => {
      window.removeEventListener('scroll', onScroll);
      obs.disconnect();
    };
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background,backdrop-filter,border-color] duration-300 ${
        scrolled ? 'border-b border-white/[.06] bg-[#07060a]/75 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[1280px] items-center gap-6 px-5 sm:px-8">
        <Logo />
        <nav aria-label="Abschnitte" className="ml-auto hidden items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={active === s.id ? 'true' : undefined}
              className={`focus-ring relative rounded-lg px-3.5 py-2 text-[15px] transition-colors ${
                active === s.id ? 'text-[#f2ead6]' : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              {s.label}
              <span
                aria-hidden="true"
                className={`absolute inset-x-3.5 -bottom-0.5 h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#d4af37] to-transparent transition-opacity ${
                  active === s.id ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </a>
          ))}
        </nav>
        <span
          role="status"
          className={`ml-auto flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] lg:ml-6 ${
            connected ? 'border-[#d4af37]/40 text-[#f2ead6]' : 'border-white/10 text-stone-400'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'animate-pulse bg-stone-500'}`} />
          {connected ? 'Verbunden' : 'Verbinde …'}
        </span>
      </div>
    </header>
  );
}
