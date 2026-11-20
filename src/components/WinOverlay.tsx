'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { fmt } from '@/client/store';

export interface WinInfo {
  key: number;
  net: number;
  wagered: number;
}

export const isBigWin = (w: WinInfo) => w.net >= Math.max(1000, w.wagered * 10);

/** Gewinnanzeige über dem Rad (das Konfetti kommt bildschirmfüllend aus <Confetti />). */
export function WinOverlay({ win, reduced }: { win: WinInfo | null; reduced: boolean }) {
  return (
    <AnimatePresence>
      {win && win.net > 0 && (
        <motion.div
          key={win.key}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="glass rounded-3xl px-8 py-5 text-center"
            initial={{ scale: reduced ? 1 : 0.5, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[#e9c96a]">
              {isBigWin(win) ? 'Grosser Gewinn' : 'Gewonnen'}
            </div>
            <div className="gold-text tabular mt-1 text-4xl font-extrabold sm:text-5xl">+{fmt(win.net)}</div>
            <div className="mt-1 text-xs text-stone-400">Credits</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
