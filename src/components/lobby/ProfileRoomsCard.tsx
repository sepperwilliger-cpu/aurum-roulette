'use client';
import Link from 'next/link';
import type { OwnProfile, PublicProfile } from '@/lib/protocol';
import { MAX_PLAYERS } from '@/lib/constants';
import { fmt } from '@/client/store';
import { Avatar } from '@/components/ui';
import { ProfileForm } from '@/components/ProfileForm';
import { IconChevron, IconCoins, IconCrown, IconPencil, IconPlay, IconUsers } from './icons';

export interface MyRoom {
  code: string;
  rounds: number;
  mine: boolean;
  lastSeen: number;
  online: number;
  members: PublicProfile[];
  total: number;
}

interface Props {
  profileLoaded: boolean;
  profile: OwnProfile | null;
  rooms: MyRoom[] | null;
  onEditProfile(): void;
  onCreateRoom(): void;
  busy: boolean;
}

const card =
  'relative rounded-[28px] border border-[#d4af37]/35 bg-[linear-gradient(160deg,rgba(40,32,20,.72),rgba(14,11,8,.82))] p-4 shadow-[0_40px_80px_-30px_rgba(0,0,0,.9),inset_0_1px_0_rgba(255,236,170,.08)] backdrop-blur-2xl sm:p-6';

export function ProfileRoomsCard({ profileLoaded, profile, rooms, onEditProfile, onCreateRoom, busy }: Props) {
  if (!profileLoaded) {
    return (
      <div className={card} aria-busy="true">
        <div className="h-[88px] animate-pulse rounded-2xl bg-white/[.04]" />
        <div className="mt-6 h-[210px] animate-pulse rounded-2xl bg-white/[.03]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={card} id="profil">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[#f2ead6]">Erst ein Profil, dann an den Tisch</h2>
        <p className="mb-5 mt-1.5 text-sm text-stone-400">Name und Bild genügen. Das Profil bleibt in diesem Browser gespeichert – ohne Passwort.</p>
        <ProfileForm submitLabel="Profil erstellen" />
      </div>
    );
  }

  const [featured, ...others] = rooms ?? [];

  return (
    <div className={card}>
      {/* Profil */}
      <div className="flex items-center gap-4 rounded-2xl border border-white/[.06] bg-black/25 p-3.5 sm:p-4">
        <span className="rounded-full p-[3px] [background:linear-gradient(160deg,#fbe7a1,#b08a24)]">
          <span className="block rounded-full bg-[#0d0b08] p-[2px]">
            <Avatar avatar={profile.avatar} color={profile.color} size={56} id={profile.id} img={profile.img} />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold text-[#f2ead6]">{profile.name}</div>
          <div className="tabular mt-0.5 flex items-center gap-1.5 text-[15px] font-semibold text-[#e9c96a]">
            <IconCoins className="h-4 w-4" />
            {fmt(profile.balance)} Credits
          </div>
        </div>
        <button
          onClick={onEditProfile}
          className="focus-ring flex shrink-0 items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-[13px] text-stone-200 transition hover:border-[#d4af37]/60 hover:text-white"
        >
          <IconPencil className="h-4 w-4" />
          <span className="hidden sm:inline">Profil bearbeiten</span>
          <span className="sm:hidden">Bearbeiten</span>
        </button>
      </div>

      {/* Räume */}
      <h2 className="mb-3 mt-7 text-[12px] font-semibold tracking-[0.32em] text-stone-400">MEINE RÄUME</h2>

      {!featured ? (
        <div className="rounded-2xl border border-dashed border-white/12 p-5 text-center">
          <p className="text-[15px] text-stone-300">Du hast noch keinen Raum.</p>
          <p className="mt-1 text-sm text-stone-500">Erstelle einen und schick den Code an deine Freunde – er bleibt für immer gültig.</p>
          <button onClick={onCreateRoom} disabled={busy} className="btn btn-gold mt-4 !rounded-full !px-6">
            Ersten Raum erstellen
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[.07] bg-black/25">
          <Link
            href={`/room/${featured.code}`}
            className="focus-ring flex items-center gap-3 rounded-t-2xl px-4 py-4 transition hover:bg-white/[.03]"
          >
            {featured.mine && <IconCrown className="h-5 w-5 text-[#e9c96a]" />}
            <span className="tabular text-xl font-bold tracking-[0.22em] text-[#f3d77a]">{featured.code}</span>
            <span className="flex items-center gap-1.5 text-[13px] text-stone-300">
              <span className={`h-2 w-2 rounded-full ${featured.online ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-stone-600'}`} />
              {featured.online ? `${featured.online} online` : `${featured.rounds} Runden gespielt`}
            </span>
            <IconChevron className="ml-auto h-5 w-5 text-stone-500" />
          </Link>
          <div className="flex items-center gap-4 border-t border-white/[.06] px-4 py-3.5">
            <div className="flex -space-x-2.5">
              {featured.members.map((m) => (
                <span key={m.id} className="rounded-full ring-2 ring-[#120f0b]" title={m.name}>
                  <Avatar avatar={m.avatar} color={m.color} size={34} id={m.id} img={m.img} />
                </span>
              ))}
              {featured.total > featured.members.length && (
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#221c13] text-[12px] font-semibold text-stone-300 ring-2 ring-[#120f0b]">
                  +{featured.total - featured.members.length}
                </span>
              )}
              {featured.total === 0 && <span className="text-sm text-stone-500">Noch niemand gespielt</span>}
            </div>
            <span className="h-8 w-px bg-white/10" aria-hidden="true" />
            <span className="flex items-center gap-2 text-[14px] text-stone-300">
              <IconUsers className="h-5 w-5 text-stone-400" />
              Bis zu {MAX_PLAYERS} Spieler
            </span>
          </div>
          <div className="px-4 pb-4">
            <Link
              href={`/room/${featured.code}`}
              className="focus-ring flex w-full items-center justify-center gap-3 rounded-2xl bg-[linear-gradient(180deg,#f6dc85,#d4af37_55%,#b08a24)] py-3.5 text-[17px] font-bold text-[#1a1405] shadow-[inset_0_1px_0_rgba(255,255,255,.55),0_12px_30px_-10px_rgba(212,175,55,.6)] transition hover:brightness-105 active:scale-[.99]"
            >
              <IconPlay className="h-4 w-4" />
              Raum betreten
            </Link>
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Weitere Räume">
          {others.map((r) => (
            <Link
              key={r.code}
              href={`/room/${r.code}`}
              className="focus-ring flex items-center gap-2 rounded-full border border-white/[.08] bg-black/20 px-3 py-1.5 text-[13px] transition hover:border-[#d4af37]/50"
            >
              {r.mine && <IconCrown className="h-3.5 w-3.5 text-[#e9c96a]" />}
              <span className="tabular font-semibold tracking-[0.14em] text-[#e9c96a]">{r.code}</span>
              {r.online > 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label={`${r.online} online`} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
