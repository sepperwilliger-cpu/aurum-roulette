import Link from 'next/link';

export function Logo({ small }: { small?: boolean }) {
  return (
    <Link href="/" className="focus-ring flex items-center gap-2.5 rounded-lg" aria-label="AURUM Roulette – Startseite">
      <svg viewBox="0 0 64 64" className={small ? 'h-7 w-7' : 'h-10 w-10'} aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f8e7a8" />
            <stop offset=".5" stopColor="#d4af37" />
            <stop offset="1" stopColor="#9c7a1c" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="29" fill="#0e1014" stroke="url(#lg)" strokeWidth="3" />
        <circle cx="32" cy="32" r="20" fill="none" stroke="#b3202a" strokeWidth="6" strokeDasharray="5.2 5.2" />
        <circle cx="32" cy="32" r="8" fill="url(#lg)" />
        <circle cx="45" cy="20" r="3.6" fill="#fff" />
      </svg>
      <span className={`font-[family-name:var(--font-display)] tracking-[0.32em] ${small ? 'text-base' : 'text-2xl'}`}>
        <span className="gold-text font-bold">AURUM</span>
      </span>
    </Link>
  );
}
