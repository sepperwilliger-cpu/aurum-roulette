'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { request } from '@/client/socket';
import { fmt, useGame } from '@/client/store';
import { useMediaQuery, useNow } from '@/client/hooks';
import { sfx, unlockAudio } from '@/client/sound';
import { music } from '@/client/music';
import { BALL_SETTLE_MS, BETTING_MS, SPIN_MS, START_BALANCE } from '@/lib/constants';
import { colorOf } from '@/lib/roulette';
import type { ChatMessage, OwnProfile, Role, RoomState } from '@/lib/protocol';
import { BettingTable } from './BettingTable';
import { ChipRack } from './ChipRack';
import { ChatPanel, Distribution, HistoryStrip, Leaderboard, PlayerList, RoleSwitch } from './Panels';
import { SettingsModal, StatsModal } from './Modals';
import { ProfileForm } from './ProfileForm';
import { WinOverlay, isBigWin, type WinInfo } from './WinOverlay';
import { Confetti } from './Confetti';
import { Logo } from './Logo';
import { NumberBadge } from './ui';
import type { WheelSpin } from './Wheel3D';

const Wheel3D = dynamic(() => import('./Wheel3D'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-stone-500">Lade 3D-Rad …</div>,
});

type Tab = 'players' | 'chat' | 'ranking' | 'stats';
const COLOR_DE = { red: 'Rot', black: 'Schwarz', green: 'Grün' } as const;

export function GameRoom({ code, spectate }: { code: string; spectate: boolean }) {
  const router = useRouter();
  const { connected, profile, profileLoaded, room, role, clockOffset, selectedChip, settings, toast, unreadChat } = useGame();
  const setRoom = useGame((s) => s.setRoom);
  const setRole = useGame((s) => s.setRole);
  const setChat = useGame((s) => s.setChat);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('players');
  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [win, setWin] = useState<WinInfo | null>(null);
  const [confetti, setConfetti] = useState<{ key: number; big: boolean } | null>(null);
  const vertical = useMediaQuery('(max-width: 640px)');
  const now = useNow(200);
  const reduced = settings.animations === 'reduced';

  // ------------------------------------------------ Beitreten (auch nach Wiederverbinden)
  useEffect(() => {
    if (!connected || !profile?.id) return;
    let cancelled = false;
    (async () => {
      const res = await request<{ role: Role; notice?: string; chat: ChatMessage[]; state: RoomState }>('room:join', {
        code,
        spectator: spectate,
      });
      if (cancelled) return;
      if (!res.ok) {
        setJoinError(res.error);
        return;
      }
      setJoinError(null);
      setRoom(res.state);
      setRole(res.role);
      setChat(res.chat);
      if (res.notice) toast(res.notice);
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, profile?.id, code, spectate, setRoom, setRole, setChat, toast]);

  // Beim Verlassen der Seite (Navigation in der App) den Raum sauber verlassen.
  // Verzögert geprüft, damit das doppelte Mounten im React-StrictMode keinen Austritt auslöst.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (mounted.current) return;
        void request('room:leave');
        sfx.stopSpin();
        music.duck(false);
        useGame.getState().setRoom(null);
        useGame.getState().setChat([]);
      }, 0);
    };
  }, []);

  // ------------------------------------------------ Zeit & Phasen
  const serverNow = now + clockOffset;
  const remainingMs = room ? Math.max(0, room.phaseEndsAt - serverNow) : 0;
  const spin: WheelSpin | null = useMemo(() => {
    if (!room?.reveal || (room.phase !== 'spinning' && room.phase !== 'result')) return null;
    const startServer = room.phase === 'spinning' ? room.phaseStartedAt : room.phaseStartedAt - SPIN_MS;
    return { round: room.roundNo, number: room.reveal.number, startLocal: startServer - clockOffset };
  }, [room?.reveal, room?.phase, room?.phaseStartedAt, room?.roundNo, clockOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const settled = !!spin && now >= spin.startLocal + BALL_SETTLE_MS;
  const winningNumber = settled && room?.reveal ? room.reveal.number : null;
  const restNumber = room?.history[0]?.number ?? 0;

  // ------------------------------------------------ Sounds & Effekte bei Phasenwechsel
  const fx = useRef({ spinRound: -1, settledRound: -1, resultRound: -1, lastTick: -1 });
  useEffect(() => {
    if (!room) return;
    const f = fx.current;
    if (room.phase === 'spinning' && f.spinRound !== room.roundNo && spin) {
      f.spinRound = room.roundNo;
      const total = BALL_SETTLE_MS / 1000;
      const elapsed = Math.max(0, (Date.now() - spin.startLocal) / 1000);
      if (elapsed < total - 0.5) {
        // Direkt das Rollen der Kugel – kein separater Ansage-Ton
        sfx.spin(total, elapsed);
        music.duck(true);
      }
    }
    if (room.phase === 'betting') {
      const secs = Math.ceil(remainingMs / 1000);
      if (secs <= 5 && secs >= 1 && secs !== f.lastTick) {
        f.lastTick = secs;
        sfx.tick();
      }
    }
  }, [room, spin, remainingMs]);

  useEffect(() => {
    if (!room || !settled || fx.current.settledRound === room.roundNo) return;
    fx.current.settledRound = room.roundNo;
    sfx.stopSpin();
    music.duck(false);
  }, [settled, room]);

  useEffect(() => {
    const s = room?.lastSettlement;
    if (!s || !profile || fx.current.resultRound === s.round) return;
    fx.current.resultRound = s.round;
    const mine = s.results.find((r) => r.playerId === profile.id);
    if (!mine) return;
    if (mine.net > 0) {
      const info = { key: s.round, net: mine.net, wagered: mine.wagered };
      sfx.win(isBigWin(info));
      setWin(info);
      setConfetti({ key: s.round, big: isBigWin(info) });
      setTimeout(() => setWin((w) => (w?.key === s.round ? null : w)), reduced ? 2500 : 4200);
    } else {
      sfx.lose();
    }
  }, [room?.lastSettlement, profile, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------ Aktionen
  const canBet = !!room && room.phase === 'betting' && role === 'player' && remainingMs > 0;
  const myBets = useMemo(() => room?.table.filter((b) => b.playerId === profile?.id) ?? [], [room?.table, profile?.id]);
  const myWager = myBets.reduce((a, b) => a + b.amount, 0);
  const myWinningSpots = useMemo(
    () => room?.lastSettlement?.results.find((r) => r.playerId === profile?.id)?.winningSpots ?? [],
    [room?.lastSettlement, profile?.id],
  );

  const placeBet = useCallback(
    async (spot: string) => {
      if (!canBet) return;
      unlockAudio();
      sfx.chip();
      const res = await request('bet:place', { spot, amount: selectedChip });
      if (!res.ok) {
        sfx.error();
        toast(res.error, 'error');
      }
    },
    [canBet, selectedChip, toast],
  );

  const action = async (event: string) => {
    unlockAudio();
    const res = await request(event);
    if (!res.ok) {
      sfx.error();
      toast(res.error, 'error');
    } else sfx.chip();
  };

  const [resetting, setResetting] = useState(false);
  const resetBalance = async () => {
    unlockAudio();
    setResetting(true);
    const res = await request<{ profile: OwnProfile }>('balance:reset');
    setResetting(false);
    if (res.ok) {
      useGame.getState().setProfile(res.profile);
      sfx.win();
      toast(`Neues Spielgeld: ${fmt(START_BALANCE)} Credits 🎉`, 'success');
    } else {
      sfx.error();
      toast(res.error, 'error');
    }
  };

  const copyInvite = async () => {
    const url = `${window.location.origin}/room/${code}`;
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        await navigator.share({ title: 'AURUM Roulette', text: `Komm an meinen Roulette-Tisch! Code: ${code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast('Einladungslink kopiert 📋', 'success');
    } catch {
      toast(`Link: ${url}`);
    }
  };

  const leave = async () => {
    await request('room:leave');
    router.push('/');
  };

  // ------------------------------------------------ Zustände vor dem Spiel
  if (!profileLoaded) return <CenterNote>Verbinde mit dem Casino …</CenterNote>;
  if (!profile) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="glass rounded-3xl p-6">
          <h1 className="text-xl font-semibold">Einladung an Tisch {code}</h1>
          <p className="mb-6 mt-1 text-sm text-stone-400">Erstelle kurz dein Profil, dann geht’s los.</p>
          <ProfileForm submitLabel="Platz nehmen" />
        </div>
      </main>
    );
  }
  if (joinError) {
    return (
      <CenterNote>
        <p className="text-lg font-semibold text-stone-200">{joinError}</p>
        <Link href="/" className="btn btn-gold mt-6">
          Zur Lobby
        </Link>
      </CenterNote>
    );
  }
  if (!room) return <CenterNote>{connected ? `Betrete Raum ${code} …` : 'Verbindung wird hergestellt …'}</CenterNote>;

  const me = [...room.players, ...room.spectators].find((p) => p.id === profile.id);
  const balance = me?.balance ?? profile.balance;
  const phaseLabel =
    room.phase === 'betting'
      ? 'Platzieren Sie Ihre Einsätze'
      : room.phase === 'spinning'
        ? settled
          ? 'Die Kugel liegt'
          : 'Nichts geht mehr'
        : room.phase === 'result'
          ? 'Ergebnis'
          : 'Warte auf Spieler';
  const playersFull = room.players.length >= room.maxPlayers;
  // Pleite: kein Guthaben mehr und keine noch offenen (unabgerechneten) Einsätze.
  const broke = balance <= 0 && !(myWager > 0 && (room.phase === 'betting' || room.phase === 'spinning'));

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-8 pt-3 sm:px-5">
      {/* ------------------------------------------------ Kopfzeile */}
      <header className="glass sticky top-2 z-40 mb-3 flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 sm:gap-3 sm:px-4">
        <Logo small />
        <button
          onClick={copyInvite}
          className="focus-ring ml-1 flex items-center gap-2 rounded-xl bg-white/[.06] px-3 py-1.5 text-xs hover:bg-white/10"
          title="Einladungslink kopieren"
        >
          <span className="text-stone-400">Raum</span>
          <span className="tabular font-bold tracking-[0.2em] text-[#e9c96a]">{room.code}</span>
          <span aria-hidden="true">🔗</span>
          <span className="sr-only">Einladungslink kopieren</span>
        </button>
        {!connected && <span className="animate-pulse text-xs text-amber-300">Verbindung unterbrochen – verbinde neu …</span>}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="mr-1 text-right leading-tight">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Guthaben</div>
            <motion.div key={balance} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="gold-text tabular text-base font-bold sm:text-lg">
              {fmt(balance)}
            </motion.div>
          </div>
          <IconButton
            label={settings.music ? 'Musik aus' : 'Musik an'}
            onClick={() => useGame.getState().updateSettings({ music: !settings.music })}
          >
            <span className={settings.music ? '' : 'opacity-35 grayscale'}>🎵</span>
          </IconButton>
          <IconButton
            label={settings.sound ? 'Effekte aus' : 'Effekte an'}
            onClick={() => useGame.getState().updateSettings({ sound: !settings.sound })}
          >
            {settings.sound ? '🔊' : '🔇'}
          </IconButton>
          <IconButton label="Statistik" onClick={() => setStatsOpen(true)}>
            📊
          </IconButton>
          <IconButton label="Einstellungen" onClick={() => setSettingsOpen(true)}>
            ⚙️
          </IconButton>
          <IconButton label="Raum verlassen" onClick={leave}>
            ⎋
          </IconButton>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ------------------------------------------------ Spielbereich */}
        <section className="min-w-0 space-y-3">
          <div className="glass relative h-[280px] overflow-hidden rounded-3xl sm:h-[360px] lg:h-[42vh] lg:min-h-[340px]">
            <Wheel3D spin={spin} restNumber={restNumber} quality={settings.quality} />
            <PhaseHud phase={room.phase} label={phaseLabel} remainingMs={remainingMs} round={room.roundNo} />
            <AnimatePresence>
              {winningNumber !== null && (
                <motion.div
                  key={`res-${room.roundNo}`}
                  className="absolute right-3 top-3 z-20 flex items-center gap-3 rounded-2xl bg-black/55 px-4 py-2.5 backdrop-blur"
                  initial={{ opacity: 0, scale: 0.6, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                  role="status"
                >
                  <NumberBadge n={winningNumber} size="lg" />
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-stone-400">Gewinnzahl</div>
                    <div className="text-lg font-bold">
                      {winningNumber} {COLOR_DE[colorOf(winningNumber)]}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <WinOverlay win={win} reduced={reduced} />
            {role === 'spectator' && (
              <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs text-stone-300 backdrop-blur">
                👁 Zuschauermodus
              </div>
            )}
            {room.commit && (
              <div
                className="absolute bottom-2 right-3 hidden max-w-[50%] truncate text-[10px] text-stone-600 sm:block"
                title="SHA-256(Raum:Runde:Zahl:Salt) – vor der Runde veröffentlicht. Nach dem Drehen nachprüfbar."
              >
                Fair-Hash {room.commit.slice(0, 16)}…{room.reveal ? ` · Salt ${room.reveal.salt.slice(0, 8)}…` : ''}
              </div>
            )}
          </div>

          <div className="glass rounded-2xl px-3 py-1.5">
            <HistoryStrip history={room.history} />
          </div>

          <div className="glass rounded-3xl p-2.5 sm:p-4">
            <div className={vertical ? 'mx-auto max-w-[420px]' : ''}>
              <BettingTable
                vertical={vertical}
                bets={room.table}
                players={room.players}
                myId={profile.id}
                canBet={canBet}
                winningNumber={winningNumber}
                myWinningSpots={myWinningSpots}
                onBet={placeBet}
                reducedMotion={reduced}
              />
            </div>
            {role === 'player' && broke ? (
              <BrokeCard onReset={resetBalance} busy={resetting} />
            ) : role === 'player' ? (
              <div className="mt-4 space-y-3">
                <ChipRack balance={balance} disabled={!canBet} />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button className="btn btn-ghost text-xs" disabled={!canBet || !myBets.length} onClick={() => action('bet:undo')}>
                    ↶ Rückgängig
                  </button>
                  <button className="btn btn-ghost text-xs" disabled={!canBet || !myBets.length} onClick={() => action('bet:clear')}>
                    ✕ Alles löschen
                  </button>
                  <button className="btn btn-ghost text-xs" disabled={!canBet || !myBets.length} onClick={() => action('bet:double')}>
                    ×2 Verdoppeln
                  </button>
                  <button className="btn btn-ghost text-xs" disabled={!canBet || myBets.length > 0} onClick={() => action('bet:repeat')}>
                    ⟳ Wiederholen
                  </button>
                  <span className="tabular ml-1 rounded-xl bg-black/30 px-3 py-2 text-xs text-stone-300">
                    Einsatz: <b className="text-white">{fmt(myWager)}</b>
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-stone-400">Du schaust zu. Einsätze aller Spieler siehst du live auf dem Tisch.</p>
            )}
          </div>
        </section>

        {/* ------------------------------------------------ Seitenleiste */}
        <aside className="glass flex min-h-[420px] flex-col rounded-3xl p-3 lg:sticky lg:top-[76px] lg:max-h-[calc(100dvh-90px)]">
          <div role="tablist" aria-label="Seitenleiste" className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-black/30 p-1">
            {(
              [
                ['players', 'Spieler'],
                ['chat', 'Chat'],
                ['ranking', 'Rangliste'],
                ['stats', 'Zahlen'],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`focus-ring relative rounded-lg px-1 py-1.5 text-xs font-medium transition ${
                  tab === t ? 'bg-white/12 text-white' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {label}
                {t === 'chat' && tab !== 'chat' && unreadChat > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d4af37] px-1 text-[10px] font-bold text-black">
                    {unreadChat > 9 ? '9+' : unreadChat}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto" role="tabpanel">
            {tab === 'players' && (
              <div className="space-y-3">
                <PlayerList players={room.players} spectators={room.spectators} myId={profile.id} phase={room.phase} />
                <RoleSwitch role={role} playersFull={playersFull} />
                <button className="btn btn-ghost w-full text-xs" onClick={copyInvite}>
                  🔗 Freunde einladen (Code {room.code})
                </button>
              </div>
            )}
            {tab === 'chat' && <ChatPanel myId={profile.id} />}
            {tab === 'ranking' && <Leaderboard entries={room.leaderboard} myId={profile.id} />}
            {tab === 'stats' && <Distribution counts={room.distribution} total={room.totalRounds} />}
          </div>
        </aside>
      </div>

      <Confetti burst={confetti?.key ?? null} size={confetti?.big ? 'big' : 'small'} reduced={reduced} />
      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

function PhaseHud({ phase, label, remainingMs, round }: { phase: string; label: string; remainingMs: number; round: number }) {
  const secs = Math.ceil(remainingMs / 1000);
  const pct = phase === 'betting' ? remainingMs / BETTING_MS : 0;
  const R = 22;
  const C = 2 * Math.PI * R;
  return (
    <div className="absolute left-3 top-3 z-20 flex items-center gap-3 rounded-2xl bg-black/55 py-2 pl-2 pr-4 backdrop-blur" aria-live="polite">
      <svg viewBox="0 0 52 52" className="h-12 w-12" aria-hidden="true">
        <circle cx="26" cy="26" r={R} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
        <circle
          cx="26"
          cy="26"
          r={R}
          fill="none"
          stroke={secs <= 5 && phase === 'betting' ? '#f87171' : '#d4af37'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 26 26)"
          style={{ transition: 'stroke-dashoffset .2s linear' }}
        />
        <text x="26" y="27" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="16" fontWeight="700">
          {phase === 'betting' ? secs : phase === 'spinning' ? '◎' : '✓'}
        </text>
      </svg>
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-stone-400">Runde {round}</div>
        <div className="text-sm font-semibold">{label}</div>
      </div>
    </div>
  );
}

function BrokeCard({ onReset, busy }: { onReset(): void; busy: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 flex flex-col items-center gap-3 rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/[.07] px-4 py-5 text-center"
      role="alert"
    >
      <div className="text-3xl" aria-hidden="true">
        💸
      </div>
      <div>
        <div className="text-base font-semibold">Du hast keine Credits mehr</div>
        <div className="mt-0.5 text-sm text-stone-400">Kein Problem – hol dir kostenlos neues Spielgeld und spiel weiter.</div>
      </div>
      <button className="btn btn-gold !px-6 !py-3 text-base" onClick={onReset} disabled={busy}>
        {busy ? 'Moment …' : `↺ Neu starten mit ${fmt(START_BALANCE)} Credits`}
      </button>
    </motion.div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <button className="btn btn-ghost h-9 w-9 !p-0 text-base" onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function CenterNote({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center text-stone-400">{children}</main>;
}
