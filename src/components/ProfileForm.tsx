'use client';
import { useRef, useState } from 'react';
import { AVATARS, NAME_MAX_LEN, PLAYER_COLORS } from '@/lib/constants';
import { request, saveSession } from '@/client/socket';
import { useGame } from '@/client/store';
import { avatarUrl, prepareAvatarImage } from '@/client/image';
import type { OwnProfile } from '@/lib/protocol';
import { Avatar } from './ui';

export function ProfileForm({ submitLabel = 'Weiter', onDone }: { submitLabel?: string; onDone?(): void }) {
  const profile = useGame((s) => s.profile);
  const setProfile = useGame((s) => s.setProfile);
  const toast = useGame((s) => s.toast);
  const [name, setName] = useState(profile?.name ?? '');
  const [avatar, setAvatar] = useState<string>(profile?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [color, setColor] = useState<string>(profile?.color ?? PLAYER_COLORS[0]);
  /** undefined = Bild unverändert, null = Bild entfernen, string = neues Bild (data:-URL) */
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loadingImg, setLoadingImg] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const currentImg = image === undefined ? (profile ? avatarUrl(profile.id, profile.img) : null) : image;

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // gleiches Bild erneut wählbar
    if (!file) return;
    setLoadingImg(true);
    try {
      setImage(await prepareAvatarImage(file));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Bild konnte nicht geladen werden.', 'error');
    } finally {
      setLoadingImg(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload: Record<string, unknown> = { name, avatar, color };
    if (image !== undefined) payload.image = image;
    if (profile) {
      const res = await request<{ profile: OwnProfile }>('profile:update', payload);
      if (res.ok) {
        setProfile(res.profile);
        setImage(undefined);
        toast('Profil gespeichert', 'success');
        onDone?.();
      } else toast(res.error, 'error');
    } else {
      const res = await request<{ playerId: string; token: string; profile: OwnProfile }>('profile:create', payload);
      if (res.ok) {
        saveSession({ playerId: res.playerId, token: res.token });
        setProfile(res.profile);
        setImage(undefined);
        onDone?.();
      } else toast(res.error, 'error');
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar avatar={avatar} color={color} size={64} src={currentImg} />
        <label className="flex-1">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Benutzername</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX_LEN}
            placeholder="z. B. Lucky Luca"
            autoComplete="nickname"
            required
            minLength={2}
          />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Profilbild</legend>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={pickImage} aria-label="Bild aus Galerie wählen" />
          <button type="button" className="btn btn-ghost text-sm" onClick={() => fileInput.current?.click()} disabled={loadingImg}>
            {loadingImg ? 'Lade Bild …' : currentImg ? '🖼️ Anderes Bild wählen' : '🖼️ Bild aus Galerie'}
          </button>
          {currentImg && (
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setImage(null)}>
              ✕ Bild entfernen
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-stone-500">
          {currentImg
            ? image !== undefined
              ? 'Neues Bild gewählt – zum Übernehmen unten speichern.'
              : 'Dein Bild wird allen am Tisch angezeigt.'
            : 'Optional. Ohne Bild wird dein Emoji angezeigt.'}
        </p>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
          {currentImg ? 'Emoji (wenn kein Bild)' : 'Avatar'}
        </legend>
        <div className="grid grid-cols-8 gap-2">
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setAvatar(a)}
              aria-pressed={avatar === a}
              aria-label={`Avatar ${a}`}
              className={`focus-ring flex aspect-square items-center justify-center rounded-xl text-xl transition ${
                avatar === a ? 'bg-white/15 ring-2 ring-[#d4af37]' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Chip-Farbe am Tisch</legend>
        <div className="flex flex-wrap gap-2.5">
          {PLAYER_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={`Farbe ${c}`}
              className={`focus-ring h-8 w-8 rounded-full transition ${color === c ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#101216]' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <button className="btn btn-gold w-full !py-3" disabled={busy || loadingImg || name.trim().length < 2}>
        {busy ? 'Moment …' : submitLabel}
      </button>
    </form>
  );
}
