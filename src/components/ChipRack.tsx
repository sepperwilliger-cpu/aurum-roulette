'use client';
import { motion } from 'framer-motion';
import { CHIP_VALUES } from '@/lib/constants';
import { fmt, useGame } from '@/client/store';
import { sfx } from '@/client/sound';
import { AllInChip, Chip } from './Chip';

/** Besonderer "Chip-Wert" für All-in: setzt das gesamte Guthaben auf das angeklickte Feld. */
export const ALL_IN = -1;

const CHIP_SIZE = 'clamp(30px, 8.2vw, 52px)';
const ACTIVE_SHADOW = 'shadow-[0_0_0_2px_#f3d77a,0_10px_24px_-6px_rgba(212,175,55,.7)]';

export function ChipRack({ balance, disabled }: { balance: number; disabled: boolean }) {
  const selected = useGame((s) => s.selectedChip);
  const setChip = useGame((s) => s.setChip);
  const allInActive = selected === ALL_IN;
  return (
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        aria-label="Chip-Wert wählen"
        className="flex flex-wrap items-end justify-center gap-x-1 gap-y-2 pt-2 sm:gap-x-2"
      >
        {CHIP_VALUES.map((v) => {
          const active = selected === v;
          const affordable = v <= balance;
          return (
            <motion.button
              key={v}
              role="radio"
              aria-checked={active}
              aria-label={`Chip ${v}`}
              disabled={disabled || !affordable}
              onClick={() => {
                setChip(v);
                sfx.select();
              }}
              animate={{ y: active ? -8 : 0, scale: active ? 1.08 : 1 }}
              whileHover={{ y: active ? -8 : -3 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className={`focus-ring relative rounded-full disabled:opacity-35 ${active ? ACTIVE_SHADOW : ''}`}
            >
              <Chip value={v} size={CHIP_SIZE} />
            </motion.button>
          );
        })}
        <motion.button
          role="radio"
          aria-checked={allInActive}
          aria-label="Chip All-in (gesamtes Guthaben)"
          title={`All-in: ${fmt(balance)} Credits auf ein Feld`}
          disabled={disabled || balance < 1}
          onClick={() => {
            setChip(ALL_IN);
            sfx.select();
          }}
          animate={{ y: allInActive ? -8 : 0, scale: allInActive ? 1.12 : 1 }}
          whileHover={{ y: allInActive ? -8 : -3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className={`focus-ring relative ml-1 rounded-full disabled:opacity-35 ${
            allInActive ? 'shadow-[0_0_0_2px_#f3d77a,0_0_28px_4px_rgba(243,215,122,.75)]' : ''
          }`}
        >
          <AllInChip size={CHIP_SIZE} />
        </motion.button>
      </div>
      {allInActive && !disabled && balance > 0 && (
        <p className="text-center text-xs font-medium text-[#f3d77a]" role="status">
          All-in gewählt – Klick auf ein Feld setzt alle {fmt(balance)} Credits darauf.
        </p>
      )}
    </div>
  );
}
