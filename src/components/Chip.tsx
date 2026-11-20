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
