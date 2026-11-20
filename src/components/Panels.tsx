'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ChatMessage, HistoryEntry, LeaderboardEntry, PlayerView } from '@/lib/protocol';
import { CHAT_MAX_LEN, MAX_PLAYERS } from '@/lib/constants';
import { colorOf, RED_NUMBERS } from '@/lib/roulette';
import { request } from '@/client/socket';
import { fmt, useGame } from '@/client/store';
import { Avatar, NumberBadge } from './ui';

// ---------------------------------------------------------------- Spielerliste

export function PlayerList({
  players,
  spectators,
  myId,
  phase,
}: {
  players: PlayerView[];
  spectators: PlayerView[];
  myId: string | null;
  phase: string;
}) {
  const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => players[i] ?? null);
  return (
    <div className="space-y-2">
      {seats.map((p, i) =>
        p ? (
          <motion.div
            layout
            key={p.id}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${p.id === myId ? 'bg-white/[.07] ring-1 ring-[#d4af37]/40' : 'bg-white/[.03]'}`}
          >
            <Avatar avatar={p.avatar} color={p.color} online={p.online} id={p.id} img={p.img} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                <span className="truncate">{p.name}</span>
                {p.id === myId && <span className="text-[10px] font-medium uppercase tracking-wider text-[#e9c96a]">Du</span>}
                {!p.online && <span className="text-[10px] uppercase tracking-wider text-stone-500">offline</span>}
              </div>
              <div className="tabular text-xs text-stone-400">
                {fmt(p.balance)} Credits
                {p.roundWager > 0 && <span className="text-stone-300"> · Einsatz {fmt(p.roundWager)}</span>}
              </div>
            </div>
            <AnimatePresence mode="popLayout">
              {phase === 'result' && p.lastNet !== null && (
                <motion.span
                  key="net"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className={`tabular rounded-full px-2 py-0.5 text-xs font-bold ${
                    p.lastNet > 0 ? 'bg-emerald-500/15 text-emerald-300' : p.lastNet < 0 ? 'bg-red-500/10 text-red-300' : 'text-stone-400'
                  }`}
                >
                  {p.lastNet > 0 ? '+' : ''}
                  {fmt(p.lastNet)}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div key={`empty-${i}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 px-3 py-2.5 text-sm text-stone-500">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">+</span>
            Freier Platz
          </div>
        ),
      )}
      {spectators.length > 0 && (
        <div className="pt-2">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500">
            Zuschauer ({spectators.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {spectators.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1 pr-2.5 text-xs">
                <Avatar avatar={s.avatar} color={s.color} size={22} online={s.online} id={s.id} img={s.img} />
                {s.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Rangliste

export function Leaderboard({ entries, myId }: { entries: LeaderboardEntry[]; myId: string | null }) {
  if (!entries.length) return <p className="py-6 text-center text-sm text-stone-500">Noch keine gespielten Runden.</p>;
  return (
    <ol className="space-y-1.5">
      {entries.map((e, i) => (
        <li
          key={e.id}
          className={`flex items-center gap-3 rounded-xl px-3 py-2 ${e.id === myId ? 'bg-white/[.07]' : 'bg-white/[.03]'}`}
        >
          <span className={`w-6 text-center text-sm font-bold ${i === 0 ? 'text-[#f3d77a]' : i === 1 ? 'text-stone-300' : i === 2 ? 'text-amber-600' : 'text-stone-500'}`}>
            {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
          </span>
          <Avatar avatar={e.avatar} color={e.color} size={28} id={e.id} img={e.img} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{e.name}</div>
            <div className="text-[11px] text-stone-500">{e.rounds} Runden · {fmt(e.balance)} Credits</div>
          </div>
          <span className={`tabular text-sm font-bold ${e.net > 0 ? 'text-emerald-300' : e.net < 0 ? 'text-red-300' : 'text-stone-400'}`}>
            {e.net > 0 ? '+' : ''}
            {fmt(e.net)}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- Chat

export function ChatPanel({ myId }: { myId: string | null }) {
  const chat = useGame((s) => s.chat);
  const markRead = useGame((s) => s.markChatRead);
  const toast = useGame((s) => s.toast);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markRead();
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat, markRead]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const res = await request('chat:send', { text: t });
    if (!res.ok) {
      toast(res.error, 'error');
      setText(t);
    }
  };

  return (
    <div className="flex h-full min-h-[260px] flex-col">
      <div ref={listRef} className="scroll-thin flex-1 space-y-2 overflow-y-auto pr-1" aria-live="polite">
        {chat.length === 0 && <p className="py-6 text-center text-sm text-stone-500">Sag hallo 👋</p>}
        {chat.map((m: ChatMessage) =>
          m.system ? (
            <div key={m.id} className="text-center text-[11px] text-stone-500">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`flex gap-2 ${m.playerId === myId ? 'flex-row-reverse' : ''}`}>
              <Avatar avatar={m.avatar} color={m.color} size={26} id={m.playerId} img={m.img} />
              <div className={`max-w-[78%] rounded-2xl px-3 py-1.5 text-sm ${m.playerId === myId ? 'bg-[#d4af37]/20' : 'bg-white/[.06]'}`}>
                <div className="text-[11px] font-semibold" style={{ color: m.color }}>
                  {m.name}
                </div>
                <div className="break-words text-stone-100">{m.text}</div>
              </div>
            </div>
          ),
        )}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          className="input !py-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LEN}
          placeholder="Nachricht …"
          aria-label="Chat-Nachricht"
        />
        <button className="btn btn-gold !px-3.5" disabled={!text.trim()} aria-label="Senden">
          ➤
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- Verlauf & Verteilung

export function HistoryStrip({ history }: { history: HistoryEntry[] }) {
  return (
    <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto py-1" aria-label="Letzte 20 Ergebnisse">
      <span className="mr-1 shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-stone-500">Letzte</span>
      <AnimatePresence initial={false}>
        {history.map((h, i) => (
          <motion.span
            key={h.round}
            layout
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: i === 0 ? 1 : Math.max(0.45, 1 - i * 0.03), scale: 1 }}
            className="shrink-0"
            title={`Runde ${h.round} · ${new Date(h.at).toLocaleTimeString('de-CH')}`}
          >
            <NumberBadge n={h.number} size={i === 0 ? 'md' : 'sm'} />
          </motion.span>
        ))}
      </AnimatePresence>
      {history.length === 0 && <span className="text-xs text-stone-500">Noch keine Runden</span>}
    </div>
  );
}

export function Distribution({ counts, total }: { counts: number[]; total: number }) {
  const max = Math.max(1, ...counts);
  const stats = useMemo(() => {
    const sum = (f: (n: number) => boolean) => counts.reduce((a, c, n) => a + (f(n) ? c : 0), 0);
    const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
    const ranked = counts.map((c, n) => ({ n, c })).sort((a, b) => b.c - a.c || a.n - b.n);
    return {
      red: pct(sum((n) => RED_NUMBERS.has(n))),
      black: pct(sum((n) => n > 0 && !RED_NUMBERS.has(n))),
      zero: pct(counts[0]),
      even: pct(sum((n) => n > 0 && n % 2 === 0)),
      odd: pct(sum((n) => n % 2 === 1)),
      low: pct(sum((n) => n >= 1 && n <= 18)),
      high: pct(sum((n) => n >= 19)),
      hot: ranked.slice(0, 5),
      cold: [...ranked].reverse().slice(0, 5),
    };
  }, [counts, total]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Zahlenverteilung</span>
          <span className="text-xs text-stone-500">{total} Runden</span>
        </div>
        <svg viewBox="0 0 370 90" className="w-full" role="img" aria-label="Häufigkeit jeder Zahl">
          {counts.map((c, n) => {
            const h = (c / max) * 70;
            const col = colorOf(n);
            return (
              <g key={n}>
                <rect
                  x={n * 10 + 1}
                  y={74 - h}
                  width="8"
                  height={Math.max(h, 0.5)}
                  rx="1.5"
                  fill={col === 'red' ? '#c42a33' : col === 'green' ? '#17a35a' : '#8a8f99'}
                >
                  <title>{`${n}: ${c}×`}</title>
                </rect>
                {n % 6 === 0 && (
                  <text x={n * 10 + 5} y="86" fontSize="7" textAnchor="middle" fill="#8a8f99">
                    {n}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[
          ['Rot', stats.red, 'text-red-300'],
          ['Schwarz', stats.black, 'text-stone-300'],
          ['Null', stats.zero, 'text-emerald-300'],
          ['Gerade', stats.even, 'text-stone-300'],
          ['Ungerade', stats.odd, 'text-stone-300'],
          ['1–18 / 19–36', `${stats.low}/${stats.high}`, 'text-stone-300'],
        ].map(([label, v, cls]) => (
          <div key={label as string} className="rounded-xl bg-white/[.04] px-2 py-2">
            <div className={`tabular text-base font-bold ${cls}`}>{typeof v === 'number' ? `${v}%` : `${v}%`}</div>
            <div className="text-stone-500">{label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {(['hot', 'cold'] as const).map((k) => (
          <div key={k}>
            <div className="mb-1.5 font-medium uppercase tracking-[0.18em] text-stone-500">{k === 'hot' ? '🔥 Heiss' : '❄️ Kalt'}</div>
            <div className="flex flex-wrap gap-1">
              {stats[k].map(({ n, c }) => (
                <span key={n} className="flex items-center gap-1" title={`${c}×`}>
                  <NumberBadge n={n} size="sm" />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Spieler ↔ Zuschauer wechseln */
export function RoleSwitch({ role, playersFull }: { role: 'player' | 'spectator' | null; playersFull: boolean }) {
  const toast = useGame((s) => s.toast);
  if (!role) return null;
  const to = role === 'player' ? 'spectator' : 'player';
  return (
    <button
      className="btn btn-ghost w-full text-xs"
      disabled={to === 'player' && playersFull}
      onClick={async () => {
        const res = await request('role:switch', { role: to });
        if (!res.ok) toast(res.error, 'error');
      }}
    >
      {to === 'spectator' ? '👁  Nur zuschauen' : playersFull ? 'Tisch ist voll' : '🎲  Am Tisch mitspielen'}
    </button>
  );
}
