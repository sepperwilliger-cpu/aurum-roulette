'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { request } from '@/client/socket';
import { fmt, useGame } from '@/client/store';
import { ProfileForm } from '@/components/ProfileForm';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/ui';
import { Chip } from '@/components/Chip';
import { CHIP_VALUES, MAX_PLAYERS, START_BALANCE } from '@/lib/constants';

interface MyRoom {
  code: string;
  rounds: number;
  mine: boolean;
  lastSeen: number;
  online: number;
}

export default function Lobby() {
  const router = useRouter();
  const { connected, profile, profileLoaded, toast } = useGame();
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ownCode, setOwnCode] = useState('');
  const [showOwnCode, setShowOwnCode] = useState(false);
  const [myRooms, setMyRooms] = useState<MyRoom[] | null>(null);

  useEffect(() => {
    if (!connected || !profile?.id) return;
    void request<{ rooms: MyRoom[] }>('rooms:mine').then((r) => r.ok && setMyRooms(r.rooms));
  }, [connected, profile?.id]);

  const create = async () => {
    setBusy(true);
    const wished = showOwnCode ? ownCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const res = await request<{ code: string }>('room:create', wished ? { code: wished } : {});
    setBusy(false);
    if (res.ok) router.push(`/room/${res.code}`);
    else toast(res.error, 'error');
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) return toast('Bitte einen gültigen Raumcode eingeben.', 'error');
    router.push(`/room/${c}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-10 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Logo />
        <span className={`flex items-center gap-2 text-xs ${connected ? 'text-emerald-300' : 'text-stone-500'}`}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-stone-600'}`} />
          {connected ? 'Verbunden' : 'Verbinde …'}
        </span>
      </header>

      <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.1fr_1fr]">
        <motion.div className="min-w-0" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#e9c96a]">Europäisches Roulette</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2.1rem,11vw,3.75rem)] leading-[1.05]">
            Ein Tisch.
            <br />
            <span className="gold-text">Deine Freunde.</span>
          </h1>
          <p className="mt-5 max-w-md text-stone-400">
            Private Räume für bis zu {MAX_PLAYERS} Spieler, Echtzeit-Runden und ein 3D-Rad, das für alle exakt dasselbe Ergebnis zeigt.
            Jeder startet mit {fmt(START_BALANCE)} virtuellen Credits.
          </p>
          <div className="mt-8 flex flex-wrap items-end gap-2">
            {CHIP_VALUES.map((v, i) => (
              <motion.div
                key={v}
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.06, type: 'spring', stiffness: 300, damping: 18 }}
              >
                <Chip value={v} size="clamp(30px,6.5vw,48px)" />
              </motion.div>
            ))}
          </div>
          <p className="mt-8 max-w-md text-xs leading-relaxed text-stone-500">
            Nur Spielgeld: Credits haben keinen Geldwert, es gibt keine Einzahlungen, Auszahlungen, Käufe oder Preise.
          </p>
        </motion.div>

        <motion.div
          className="glass min-w-0 rounded-3xl p-5 sm:p-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {!profileLoaded ? (
            <div className="py-16 text-center text-stone-500">Verbinde mit dem Casino …</div>
          ) : !profile || editing ? (
            <>
              <h2 className="mb-1 text-xl font-semibold">{profile ? 'Profil bearbeiten' : 'Willkommen'}</h2>
              <p className="mb-6 text-sm text-stone-400">
                {profile
                  ? 'Name, Profilbild, Avatar und Farbe ändern.'
                  : 'Wähle Namen und Profilbild oder Avatar – das Profil wird in diesem Browser gespeichert.'}
              </p>
              <ProfileForm submitLabel={profile ? 'Speichern' : 'Profil erstellen'} onDone={() => setEditing(false)} />
            </>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4 rounded-2xl bg-white/[.04] p-4">
                <Avatar avatar={profile.avatar} color={profile.color} size={52} id={profile.id} img={profile.img} />
                <div className="flex-1">
                  <div className="font-semibold">{profile.name}</div>
                  <div className="tabular text-sm text-[#e9c96a]">{fmt(profile.balance)} Credits</div>
                </div>
                <button className="btn btn-ghost !px-3 !py-1.5 text-xs" onClick={() => setEditing(true)}>
                  ✎ Profil bearbeiten
                </button>
              </div>

              {myRooms && myRooms.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Meine Räume</div>
                  <div className="flex flex-wrap gap-2">
                    {myRooms.map((r) => (
                      <button
                        key={r.code}
                        onClick={() => router.push(`/room/${r.code}`)}
                        className="focus-ring flex items-center gap-2 rounded-xl bg-white/[.06] px-3 py-2 text-left transition hover:bg-white/10"
                        title={`Zuletzt: ${new Date(r.lastSeen).toLocaleString('de-CH')}`}
                      >
                        <span className="tabular text-sm font-bold tracking-[0.18em] text-[#e9c96a]">{r.code}</span>
                        <span className="text-[11px] text-stone-400">
                          {r.online > 0 ? `🟢 ${r.online} online` : `${r.rounds} Runden`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <button className="btn btn-gold w-full !py-3.5 text-base" onClick={create} disabled={!connected || busy}>
                  {showOwnCode && ownCode.trim() ? `Raum „${ownCode.trim().toUpperCase()}“ erstellen` : 'Privaten Raum erstellen'}
                </button>
                {showOwnCode ? (
                  <input
                    className="input tabular text-center font-semibold uppercase tracking-[0.25em]"
                    placeholder="EIGENER CODE (4–8 ZEICHEN)"
                    value={ownCode}
                    onChange={(e) => setOwnCode(e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g, ''))}
                    maxLength={8}
                    aria-label="Eigener Raumcode"
                    autoFocus
                  />
                ) : (
                  <button className="w-full text-center text-xs text-stone-400 underline-offset-2 hover:text-stone-200 hover:underline" onClick={() => setShowOwnCode(true)}>
                    Eigenen Code wählen (z. B. KLASSE3)
                  </button>
                )}
                <p className="text-center text-[11px] text-stone-500">Raumcodes bleiben gültig – ihr könnt denselben Code immer wieder benutzen.</p>
              </div>
              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-stone-600">
                <span className="h-px flex-1 bg-white/10" /> oder <span className="h-px flex-1 bg-white/10" />
              </div>
              <form onSubmit={join} className="flex gap-2">
                <input
                  className="input tabular min-w-0 text-center text-lg font-semibold uppercase tracking-[0.3em]"
                  placeholder="CODE"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={8}
                  aria-label="Raumcode"
                  autoCapitalize="characters"
                />
                <button className="btn btn-ghost shrink-0" disabled={code.trim().length < 4}>
                  Beitreten
                </button>
              </form>
            </div>
          )}
        </motion.div>
      </section>
    </main>
  );
}
