import { CHIP_STYLE, CHIP_VALUES } from '@/lib/constants';
import { fmtShort } from '@/client/store';

/** Farbe nach grösstem Chip-Wert ≤ Betrag. */
export function chipStyleFor(amount: number) {
  let v: number = CHIP_VALUES[0];
  for (const c of CHIP_VALUES) if (amount >= c) v = c;
  return CHIP_STYLE[v];
}

interface ChipProps {
  value: number;
  size?: number | string;
  ring?: string;
  label?: string;
  className?: string;
}

/** Spezial-Chip "ALL IN": schwarz mit Gold – setzt das gesamte Guthaben. */
export function AllInChip({ size = 44, className }: { size?: number | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      style={{ width: size, height: size, display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))' }}
    >
      <defs>
        <linearGradient id="allin-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe7a1" />
          <stop offset=".5" stopColor="#d4af37" />
          <stop offset="1" stopColor="#8f6b14" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#allin-gold)" />
      <circle cx="50" cy="50" r="44" fill="#0d0d0f" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="44" y="6" width="12" height="15" rx="2" fill="url(#allin-gold)" transform={`rotate(${i * 45 + 22.5} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="31" fill="none" stroke="url(#allin-gold)" strokeWidth="2" strokeDasharray="4 3" />
      <circle cx="50" cy="50" r="27" fill="#16171b" stroke="url(#allin-gold)" strokeWidth="2.5" />
      <text x="50" y="43" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="900" fill="#f3d77a" fontFamily="system-ui, sans-serif">
        ALL
      </text>
      <text x="50" y="59" textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="900" fill="#f3d77a" fontFamily="system-ui, sans-serif">
        IN
      </text>
    </svg>
  );
}

/** Casino-Chip als SVG: Grundfarbe, Randstreifen, Innenfeld mit Wert. */
export function Chip({ value, size = 44, ring, label, className }: ChipProps) {
  const st = chipStyleFor(value);
  const text = label ?? fmtShort(value);
  const fs = text.length >= 4 ? 17 : text.length === 3 ? 20 : 24;
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
      style={{ width: size, height: size, display: 'block', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.55))' }}
    >
      {ring && <circle cx="50" cy="50" r="49" fill={ring} />}
      <circle cx="50" cy="50" r={ring ? 44 : 48} fill={st.base} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="44"
          y={ring ? 6 : 2}
          width="12"
          height="15"
          rx="2"
          fill={st.accent}
          transform={`rotate(${i * 45} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="31" fill="none" stroke={st.accent} strokeWidth="2" strokeDasharray="4 3" opacity="0.8" />
      <circle cx="50" cy="50" r="26" fill="#f7f1e3" />
      <circle cx="50" cy="50" r="26" fill="none" stroke={st.base} strokeWidth="2.5" />
      <text
        x="50"
        y="51"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fs}
        fontWeight="800"
        fill={st.text}
        fontFamily="system-ui, sans-serif"
      >
        {text}
      </text>
    </svg>
  );
}
