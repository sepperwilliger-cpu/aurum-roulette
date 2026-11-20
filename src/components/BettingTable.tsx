'use client';
import { memo, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TABLE_LAYOUT, U, V, toScreen, type LayoutRect } from '@/lib/tableLayout';
import { describeSpot, getSpot } from '@/lib/roulette';
import type { PlayerView, TableBet } from '@/lib/protocol';
import { Chip } from './Chip';
import { fmt, fmtShort } from '@/client/store';

interface Props {
  vertical: boolean;
  bets: TableBet[];
  players: PlayerView[];
  myId: string | null;
  canBet: boolean;
  winningNumber: number | null;
  myWinningSpots: string[];
  onBet(spot: string): void;
  reducedMotion: boolean;
}

const TONE_BG: Record<string, string> = {
  red: 'linear-gradient(180deg,#c42a33,#9d1a22)',
  black: 'linear-gradient(180deg,#24272d,#121417)',
  green: 'linear-gradient(180deg,#17a35a,#0d7240)',
  felt: 'transparent',
};

function Diamond({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 60 30" className="h-[55%] w-auto max-w-[80%]" aria-hidden="true">
      <polygon points="30,2 58,15 30,28 2,15" fill={color} stroke="rgba(255,255,255,.55)" strokeWidth="1.5" />
    </svg>
  );
}

export const BettingTable = memo(function BettingTable(props: Props) {
  const { vertical, bets, players, myId, canBet, winningNumber, myWinningSpots, onBet, reducedMotion } = props;
  const [hover, setHover] = useState<string | null>(null);

  const highlighted = useMemo(() => new Set(hover ? getSpot(hover)?.numbers ?? [] : []), [hover]);
  const colorOf = useMemo(() => new Map(players.map((p) => [p.id, p.color])), [players]);

  const bySpot = useMemo(() => {
    const m = new Map<string, TableBet[]>();
    for (const b of bets) {
      const list = m.get(b.spot) ?? [];
      list.push(b);
      m.set(b.spot, list);
    }
    // Eigene Chips zuoberst
    for (const list of m.values()) list.sort((a, b) => (a.playerId === myId ? 1 : 0) - (b.playerId === myId ? 1 : 0));
    return m;
  }, [bets, myId]);

  const rects = useMemo(() => [...TABLE_LAYOUT].sort((a, b) => a.z - b.z), []);
  const aspect = vertical ? `${V} / ${U * 0.56}` : `${U} / ${V}`;

  const cellClasses = (r: LayoutRect) => {
    const spot = getSpot(r.key)!;
    const isWinNumber = winningNumber !== null && spot.kind === 'straight' && spot.numbers[0] === winningNumber;
    const lit =
      (spot.kind === 'straight' && highlighted.has(spot.numbers[0])) || (hover === r.key && spot.kind !== 'straight');
    return { isWinNumber, lit };
  };

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: aspect }}>
      <div className="felt absolute inset-0 overflow-visible rounded-xl border border-[#e9d9a6]/30 shadow-[inset_0_0_40px_rgba(0,0,0,.35)]">
        {rects.map((r) => {
          const s = toScreen(r, vertical);
          const spotBets = bySpot.get(r.key);
          const mineWon = myWinningSpots.includes(r.key);
          const style: React.CSSProperties = {
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.width}%`,
            height: `${s.height}%`,
            zIndex: r.z,
          };
          const label = describeSpot(r.key);
          const common = {
            'aria-label': `${label} setzen`,
            title: label,
            disabled: !canBet,
            onClick: () => onBet(r.key),
            onPointerEnter: () => setHover(r.key),
            onPointerLeave: () => setHover((h) => (h === r.key ? null : h)),
            onFocus: () => setHover(r.key),
            onBlur: () => setHover((h) => (h === r.key ? null : h)),
          };

          if (r.type === 'hot') {
            return (
              <button
                key={r.key}
                {...common}
                className="focus-ring absolute flex items-center justify-center rounded-full disabled:cursor-default"
                style={style}
              >
                <span
                  className={`pointer-events-none h-2 w-2 rounded-full transition-opacity ${
                    hover === r.key && canBet ? 'bg-[#f3d77a] opacity-90' : 'opacity-0'
                  }`}
                />
                <ChipStack bets={spotBets} colorOf={colorOf} myId={myId} won={mineWon} reduced={reducedMotion} />
              </button>
            );
          }

          const { isWinNumber, lit } = cellClasses(r);
          const tone = r.tone ?? 'felt';
          const isOutsideColor = r.key === 'red' || r.key === 'black';
          const verticalText = vertical && (r.key.startsWith('dozen') || ['low', 'high', 'even', 'odd'].includes(r.key));
          return (
            <button
              key={r.key}
              {...common}
              className={`focus-ring absolute flex items-center justify-center border border-[#e9d9a6]/35 font-semibold text-white transition-[filter,box-shadow] duration-150 disabled:cursor-default ${
                r.key === 'straight:0' ? (vertical ? 'rounded-t-[40%]' : 'rounded-l-[40%]') : ''
              } ${lit ? 'brightness-150' : ''} ${canBet ? 'hover:brightness-125' : ''}`}
              style={{
                ...style,
                background: lit && tone === 'felt' ? 'rgba(255,255,255,.12)' : TONE_BG[tone],
                boxShadow: isWinNumber ? '0 0 0 2px #f3d77a, 0 0 22px 4px rgba(243,215,122,.75) inset' : undefined,
              }}
            >
              {isOutsideColor ? (
                <Diamond color={r.key === 'red' ? '#c42a33' : '#16181c'} />
              ) : (
                <span
                  className="pointer-events-none tabular text-[clamp(9px,1.45vw,17px)] leading-none tracking-wide drop-shadow"
                  style={verticalText ? { writingMode: 'vertical-rl', transform: 'rotate(180deg)' } : undefined}
                >
                  {r.label}
                </span>
              )}
              {isWinNumber && !reducedMotion && (
                <motion.span
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[#f3d77a]"
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: [0.55, 0, 0.45, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
              )}
              <ChipStack bets={spotBets} colorOf={colorOf} myId={myId} won={mineWon} reduced={reducedMotion} />
            </button>
          );
        })}
      </div>
    </div>
  );
});

function ChipStack({
  bets,
  colorOf,
  myId,
  won,
  reduced,
}: {
  bets?: TableBet[];
  colorOf: Map<string, string>;
  myId: string | null;
  won: boolean;
  reduced: boolean;
}) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-0 w-0">
      <AnimatePresence>
        {bets?.map((b, i) => {
          const mine = b.playerId === myId;
          const offset = (i - (bets.length - 1) / 2) * 5;
          return (
            <motion.span
              key={b.playerId}
              className="absolute"
              style={{ left: offset, top: -offset * 0.6 }}
              initial={reduced ? false : { scale: 0.4, opacity: 0, y: -18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26 }}
              title={`${fmt(b.amount)}`}
            >
              <span className="relative block -translate-x-1/2 -translate-y-1/2">
                <Chip
                  value={b.amount}
                  label={fmtShort(b.amount)}
                  ring={mine ? (won ? '#fff6c7' : '#f3d77a') : colorOf.get(b.playerId) ?? '#888'}
                  size="clamp(18px, 2.6vw, 32px)"
                  className={won && mine ? 'animate-pulse' : ''}
                />
              </span>
            </motion.span>
          );
        })}
      </AnimatePresence>
    </span>
  );
}
