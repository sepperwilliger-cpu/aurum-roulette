'use client';
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { colorOf } from '@/lib/roulette';
import { avatarUrl } from '@/client/image';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    setTimeout(() => ref.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`glass max-h-[92dvh] w-full overflow-hidden rounded-t-3xl bg-[#101216]/90 outline-none sm:rounded-3xl ${
              wide ? 'sm:max-w-3xl' : 'sm:max-w-md'
            }`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <h2 className="text-base font-semibold tracking-wide">{title}</h2>
              <button className="btn btn-ghost h-8 w-8 !p-0" onClick={onClose} aria-label="Schliessen">
                ✕
              </button>
            </div>
            <div className="scroll-thin max-h-[calc(92dvh-60px)] overflow-y-auto px-5 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function NumberBadge({ n, size = 'md' }: { n: number; size?: 'sm' | 'md' | 'lg' }) {
  const c = colorOf(n);
  const bg = c === 'red' ? 'bg-[#b3202a]' : c === 'green' ? 'bg-[#138a4b]' : 'bg-[#1d2026]';
  const dims = size === 'sm' ? 'h-6 min-w-6 text-[11px]' : size === 'lg' ? 'h-14 min-w-14 text-2xl' : 'h-8 min-w-8 text-sm';
  return (
    <span
      className={`${bg} ${dims} tabular inline-flex items-center justify-center rounded-full px-1 font-bold text-white ring-1 ring-white/15`}
    >
      {n}
    </span>
  );
}

/**
 * Runder Avatar: eigenes Profilbild (wenn hochgeladen) oder Emoji.
 * `id` + `img` → Bild vom Server, `src` → direkte Vorschau (z. B. frisch gewähltes Bild).
 */
export function Avatar({
  avatar,
  color,
  size = 36,
  online = true,
  id,
  img,
  src,
}: {
  avatar: string;
  color: string;
  size?: number;
  online?: boolean;
  id?: string;
  img?: number | null;
  src?: string | null;
}) {
  const url = src ?? (id ? avatarUrl(id, img) : null);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        background: `radial-gradient(circle at 30% 30%, ${color}55, ${color}22)`,
        boxShadow: `0 0 0 2px ${color}`,
        opacity: online ? 1 : 0.45,
      }}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" width={size} height={size} className="h-full w-full object-cover" loading="lazy" draggable={false} />
      ) : (
        avatar
      )}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange(v: T): void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`focus-ring flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === o.value ? 'bg-white/12 text-white shadow' : 'text-stone-400 hover:text-stone-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
