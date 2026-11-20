'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { request } from '@/client/socket';
import { fmt, useGame } from '@/client/store';
import { useMediaQuery } from '@/client/hooks';
import { ProfileForm } from '@/components/ProfileForm';
import { Modal } from '@/components/ui';
import { Chip3D } from '@/components/Chip3D';
import { LobbyNav } from '@/components/lobby/LobbyNav';
import { ProfileRoomsCard, type MyRoom } from '@/components/lobby/ProfileRoomsCard';
import { LobbySections } from '@/components/lobby/LobbySections';
import { IconKey, IconPlus } from '@/components/lobby/icons';
import { CHIP_VALUES, MAX_PLAYERS, START_BALANCE } from '@/lib/constants';

const Wheel3D = dynamic(() => import('@/components/Wheel3D'), { ssr: false, loading: () => null });

const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

export default function Lobby() {
  const router = useRouter();
  const { connected, profile, profileLoaded, toast, settings } = useGame();
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [ownCode, setOwnCode] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const wide = useMediaQuery('(min-width: 768px)');
  const reduced = settings.animations === 'reduced';

  useEffect(() => {
    if (!connected || !profile?.id) return;
    void request<{ rooms: MyRoom[] }>('rooms:mine').then((r) => r.ok && setRooms(r.rooms));
  }, [connected, profile?.id]);

  const needProfile = () => {
    toast('Erstelle zuerst dein Profil – Name genügt.', 'info');
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => cardRef.current?.querySelector('input')?.focus(), 400);
  };

  const createRoom = async (wished?: string) => {
    if (!profile) return needProfile();
    setBusy(true);
    const res = await request<{ code: string }>('room:create', wished ? { code: wished } : {});
    setBusy(false);
    if (res.ok) router.push(`/room/${res.code}`);
    else toast(res.error, 'error');
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = cleanCode(joinCode);
    if (c.length < 4) return toast('Der Code hat 4 bis 8 Zeichen.', 'error');
    router.push(`/room/${c}`);
  };

  return (
    <>
      <LobbyNav connected={connected} />

      <main>
        {/* ------------------------------------------------------------------ Hero */}
        <section id="start" aria-label="Start" className="relative isolate overflow-hidden">
          {/* Licht: warmer Spot oben rechts, Filzschimmer unten links */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(900px_600px_at_78%_8%,rgba(212,175,55,.16),transparent_60%),radial-gradient(700px_500px_at_8%_100%,rgba(14,59,43,.35),transparent_65%),linear-gradient(180deg,#0b0907,#07060a)]"
          />
          {/* Das echte 3D-Rad, angeschnitten unten rechts */}
          {wide && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-[27vw] -right-[13vw] -z-10 aspect-square w-[70vw] max-w-[1120px] [mask-image:radial-gradient(closest-side,black_74%,transparent)]"
            >
              <Wheel3D spin={null} restNumber={26} quality={settings.quality} variant="hero" />
            </div>
          )}
          {/* Lesbarkeit links */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-[60%] bg-gradient-to-r from-[#07060a] via-[#07060a]/80 to-transparent" />

          <div className="mx-auto grid min-h-[100svh] max-w-[1280px] items-center gap-12 px-5 pb-16 pt-28 sm:px-8 lg:grid-cols-[1.12fr_0.88fr] lg:gap-16 lg:pb-24">
            <div className="min-w-0">
              <p className="flex items-center gap-4 text-[12px] font-semibold tracking-[0.42em] text-[#d9b65a]">
                <span aria-hidden="true" className="h-px w-10 bg-[#d4af37]/60" />
                EUROPÄISCHES ROULETTE
                <span aria-hidden="true" className="h-px w-16 bg-gradient-to-r from-[#d4af37]/60 to-transparent" />
              </p>
              <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2.9rem,6.4vw,5.6rem)] font-bold leading-[1.02] tracking-[-0.01em] text-[#f2ead6]">
                Ein Tisch.
                <br />
                Deine Freunde.
                <br />
                <em className="bg-[linear-gradient(180deg,#fbe7a1_10%,#d4af37_55%,#a37d1c)] bg-clip-text pr-2 font-extrabold text-transparent">
                  Dein Abend.
                </em>
              </h1>
              <p className="mt-7 max-w-[34rem] text-[17px] leading-[1.65] text-stone-300/90">
                Erstelle private Räume für bis zu {MAX_PLAYERS} Spieler, spielt Runde um Runde in Echtzeit und seht gemeinsam zu, wie die
                Kugel am 3D-Rad fällt – für alle exakt dasselbe Ergebnis. Jeder startet mit {fmt(START_BALANCE)} virtuellen Credits.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3.5">
                <button
                  onClick={() => createRoom()}
                  disabled={busy || !connected}
                  className="focus-ring inline-flex items-center gap-3 rounded-2xl bg-[linear-gradient(180deg,#f6dc85,#d4af37_55%,#b08a24)] px-7 py-4 text-[17px] font-bold text-[#1a1405] shadow-[inset_0_1px_0_rgba(255,255,255,.55),0_16px_36px_-12px_rgba(212,175,55,.65)] transition hover:brightness-105 active:scale-[.98] disabled:opacity-50"
                >
                  <IconPlus className="h-5 w-5" />
                  Privaten Raum erstellen
                </button>
                <button
                  onClick={() => setJoinOpen(true)}
                  className="focus-ring inline-flex items-center gap-3 rounded-2xl border border-[#d4af37]/45 px-7 py-4 text-[17px] font-medium text-[#f2ead6] transition hover:border-[#d4af37] hover:bg-[#d4af37]/[.06]"
                >
                  <IconKey className="h-5 w-5 text-[#e9c96a]" />
                  Code eingeben
                </button>
              </div>
              <button
                onClick={() => (profile ? setCreateOpen(true) : needProfile())}
                className="focus-ring mt-4 rounded text-sm text-stone-400 underline decoration-stone-600 underline-offset-4 transition hover:text-stone-200"
              >
                Raum mit eigenem Code erstellen, z. B. KLASSE3
              </button>

              {/* Chips */}
              <div className="mt-14">
                <p className="flex items-center gap-4 text-[12px] font-semibold tracking-[0.32em] text-[#d9b65a]">
                  <span aria-hidden="true" className="h-px w-10 bg-[#d4af37]/60" />
                  SPIELCHIPS (VIRTUELLE CREDITS)
                  <span aria-hidden="true" className="h-px w-12 bg-gradient-to-r from-[#d4af37]/60 to-transparent" />
                </p>
                <div className="mt-5 flex flex-wrap items-end gap-x-1.5 gap-y-4 sm:gap-x-2.5">
                  {CHIP_VALUES.map((v, i) => (
                    <motion.div
                      key={v}
                      initial={reduced ? false : { y: -40, opacity: 0, rotate: -25 }}
                      animate={{ y: 0, opacity: 1, rotate: 0 }}
                      transition={{ delay: 0.35 + i * 0.06, type: 'spring', stiffness: 260, damping: 17 }}
                    >
                      <Chip3D value={v} size="clamp(44px, 4.3vw, 64px)" reduced={reduced} />
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            <motion.div
              ref={cardRef}
              className="min-w-0 lg:-mt-24"
              initial={reduced ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <ProfileRoomsCard
                profileLoaded={profileLoaded}
                profile={profile}
                rooms={rooms}
                busy={busy}
                onEditProfile={() => setProfileOpen(true)}
                onCreateRoom={() => createRoom()}
              />
            </motion.div>
          </div>
        </section>

        <LobbySections />
      </main>

      {/* Code eingeben */}
      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Raum beitreten">
        <form onSubmit={join} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-stone-400">Code, den du von deinen Freunden bekommen hast</span>
            <input
              className="input tabular text-center text-2xl font-bold uppercase tracking-[0.35em]"
              value={joinCode}
              onChange={(e) => setJoinCode(cleanCode(e.target.value))}
              placeholder="9K333E"
              maxLength={8}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Raumcode"
            />
          </label>
          <button className="btn btn-gold w-full !py-3" disabled={joinCode.length < 4}>
            Raum betreten
          </button>
        </form>
      </Modal>

      {/* Eigenen Code wählen */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Raum mit eigenem Code">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ownCode.length >= 4) void createRoom(ownCode);
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="mb-2 block text-sm text-stone-400">4 bis 8 Buchstaben oder Ziffern. Der Code bleibt für immer euer Raum.</span>
            <input
              className="input tabular text-center text-2xl font-bold uppercase tracking-[0.35em]"
              value={ownCode}
              onChange={(e) => setOwnCode(cleanCode(e.target.value))}
              placeholder="KLASSE3"
              maxLength={8}
              autoFocus
              autoComplete="off"
              aria-label="Eigener Raumcode"
            />
          </label>
          <button className="btn btn-gold w-full !py-3" disabled={ownCode.length < 4 || busy}>
            {ownCode.length >= 4 ? `Raum ${ownCode} erstellen` : 'Raum erstellen'}
          </button>
        </form>
      </Modal>

      {/* Profil bearbeiten */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Profil bearbeiten">
        <ProfileForm submitLabel="Änderungen speichern" onDone={() => setProfileOpen(false)} />
      </Modal>
    </>
  );
}
