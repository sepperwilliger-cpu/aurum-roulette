'use client';
import { motion } from 'framer-motion';
import { CHIP_VALUES } from '@/lib/constants';
import { useGame } from '@/client/store';
import { sfx } from '@/client/sound';
import { Chip } from './Chip';

export function ChipRack({ balance, disabled }: { balance: number; disabled: boolean }) {
  const selected = useGame((s) => s.selectedChip);
  const setChip = useGame((s) => s.setChip);
  return (
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
            className={`focus-ring relative rounded-full disabled:opacity-35 ${
              active ? 'shadow-[0_0_0_2px_#f3d77a,0_10px_24px_-6px_rgba(212,175,55,.7)]' : ''
            }`}
          >
            <Chip value={v} size="clamp(30px, 8.2vw, 52px)" />
          </motion.button>
        );
      })}
    </div>
  );
}
