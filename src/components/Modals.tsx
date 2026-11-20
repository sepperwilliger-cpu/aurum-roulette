'use client';
import { useEffect, useState } from 'react';
import { request } from '@/client/socket';
import { fmt, useGame } from '@/client/store';
import { describeSpot } from '@/lib/roulette';
import { START_BALANCE } from '@/lib/constants';
import type { OwnProfile, PlayerHistoryRow, PlayerStats } from '@/lib/protocol';
import { Modal, NumberBadge, Segmented } from './ui';
import { ProfileForm } from './ProfileForm';
import { sfx, unlockAudio } from '@/client/sound';

export function StatsModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const [data, setData] = useState<{ stats: PlayerStats; history: PlayerHistoryRow[] } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const toast = useGame((s) => s.toast);
  const setProfile = useGame((s) => s.setProfile);
  const balance = useGame((s) => s.profile?.balance ?? 0);
  const phase = useGame((s) => s.room?.phase);

  const load = async () => {
    const res = await request<{ stats: PlayerStats; history: PlayerHistoryRow[] }>('stats:get');
    if (res.ok) setData({ stats: res.stats, history: res.history });
    else toast(res.error, 'error');
  };

  useEffect(() => {
    if (open) {
      setConfirmReset(false);
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase === 'result']);

  const reset = async () => {
    const res = await request<{ profile: OwnProfile }>('balance:reset');
    if (res.ok) {
      setProfile(res.profile);
      toast(`Guthaben auf ${fmt(START_BALANCE)} Credits zurückgesetzt`, 'success');
      setConfirmReset(false);
      void load();
    } else toast(res.error, 'error');
  };

  const s = data?.stats;
  const net = s ? s.totalReturned - s.totalWagered : 0;
  return (
    <Modal open={open} onClose={onClose} title="Statistik & Spielhistorie" wide>
      {!s ? (
        <p className="py-10 text-center text-stone-500">Lade …</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Guthaben', fmt(balance)],
              ['Runden', fmt(s.roundsPlayed)],
              ['Gewinnquote', s.roundsPlayed ? `${Math.round((s.roundsWon / s.roundsPlayed) * 100)}%` : '–'],
              ['Grösster Gewinn', `+${fmt(s.biggestWin)}`],
              ['Gesetzt', fmt(s.totalWagered)],
              ['Ausbezahlt', fmt(s.totalReturned)],
              ['Netto', `${net > 0 ? '+' : ''}${fmt(net)}`],
              ['Resets', fmt(s.resets)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/[.04] px-3 py-3">
                <div className={`tabular text-lg font-bold ${k === 'Netto' ? (net >= 0 ? 'text-emerald-300' : 'text-red-300') : ''}`}>{v}</div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500">{k}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500">Alle Werte sind virtuelle Spielcredits ohne jeglichen Geldwert.</p>

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Spielhistorie</h3>
            {data.history.length === 0 ? (
              <p className="py-4 text-sm text-stone-500">Noch keine Runden mit Einsatz gespielt.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/5">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/[.04] text-[11px] uppercase tracking-wider text-stone-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Zeit</th>
                      <th className="px-3 py-2 font-medium">Zahl</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Raum · Runde</th>
                      <th className="px-3 py-2 text-right font-medium">Einsatz</th>
                      <th className="px-3 py-2 text-right font-medium">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h, i) => {
                      const n = h.returned - h.wagered;
                      return (
                        <FragmentRow key={`${h.roomCode}-${h.round}-${i}`}>
                          <tr
                            className="cursor-pointer border-t border-white/5 hover:bg-white/[.03]"
                            onClick={() => setExpanded(expanded === i ? null : i)}
                          >
                            <td className="tabular px-3 py-2 text-stone-400">
                              {new Date(h.at).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            <td className="px-3 py-2">
                              <NumberBadge n={h.number} size="sm" />
                            </td>
                            <td className="hidden px-3 py-2 text-stone-400 sm:table-cell">
                              {h.roomCode} · #{h.round}
                            </td>
                            <td className="tabular px-3 py-2 text-right">{fmt(h.wagered)}</td>
                            <td className={`tabular px-3 py-2 text-right font-semibold ${n > 0 ? 'text-emerald-300' : n < 0 ? 'text-red-300' : 'text-stone-400'}`}>
                              {n > 0 ? '+' : ''}
                              {fmt(n)}
                            </td>
                          </tr>
                          {expanded === i && (
                            <tr className="bg-black/20">
                              <td colSpan={5} className="px-3 py-2 text-xs text-stone-400">
                                {h.bets.map((b) => `${describeSpot(b.spot)}: ${fmt(b.amount)}`).join(' · ')}
                              </td>
                            </tr>
                          )}
                        </FragmentRow>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-white/5 bg-white/[.02] p-4">
            <h3 className="text-sm font-semibold">Spielgeld zurücksetzen</h3>
            <p className="mt-1 text-xs text-stone-400">
              Setzt dein Guthaben kostenlos auf {fmt(START_BALANCE)} Credits. Offene Einsätze der Setzphase werden erstattet.
            </p>
            {confirmReset ? (
              <div className="mt-3 flex gap-2">
                <button className="btn btn-gold flex-1" onClick={reset}>
                  Ja, zurücksetzen
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                  Abbrechen
                </button>
              </div>
            ) : (
              <button className="btn btn-ghost mt-3" onClick={() => setConfirmReset(true)}>
                ↺ Guthaben zurücksetzen
              </button>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SettingsModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const settings = useGame((s) => s.settings);
  const update = useGame((s) => s.updateSettings);
  return (
    <Modal open={open} onClose={onClose} title="Einstellungen">
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Hintergrundmusik</h3>
          <Segmented
            label="Hintergrundmusik"
            value={settings.music ? 'on' : 'off'}
            options={[
              { value: 'on', label: '🎵 An' },
              { value: 'off', label: 'Aus' },
            ]}
            onChange={(v) => {
              unlockAudio();
              update({ music: v === 'on' });
            }}
          />
          <label className="flex items-center gap-3 text-sm">
            <span className="w-20 text-stone-400">Lautstärke</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.musicVolume}
              disabled={!settings.music}
              onChange={(e) => update({ musicVolume: Number(e.target.value) })}
              className="flex-1 accent-[#d4af37]"
              aria-label="Musik-Lautstärke"
            />
          </label>
        </section>
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Soundeffekte</h3>
          <Segmented
            label="Sound"
            value={settings.sound ? 'on' : 'off'}
            options={[
              { value: 'on', label: '🔊 An' },
              { value: 'off', label: '🔇 Aus' },
            ]}
            onChange={(v) => {
              update({ sound: v === 'on' });
              if (v === 'on') {
                unlockAudio();
                sfx.chip();
              }
            }}
          />
          <label className="flex items-center gap-3 text-sm">
            <span className="w-20 text-stone-400">Lautstärke</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              disabled={!settings.sound}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              onPointerUp={() => sfx.chip()}
              className="flex-1 accent-[#d4af37]"
              aria-label="Lautstärke"
            />
          </label>
        </section>
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Animationen</h3>
          <Segmented
            label="Animationen"
            value={settings.animations}
            options={[
              { value: 'full', label: 'Voll' },
              { value: 'reduced', label: 'Reduziert' },
            ]}
            onChange={(v) => update({ animations: v })}
          />
          <p className="text-xs text-stone-500">Reduziert: weniger Konfetti, keine pulsierenden Effekte.</p>
        </section>
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">3D-Qualität</h3>
          <Segmented
            label="3D-Qualität"
            value={settings.quality}
            options={[
              { value: 'high', label: 'Hoch' },
              { value: 'low', label: 'Sparsam' },
            ]}
            onChange={(v) => update({ quality: v })}
          />
          <p className="text-xs text-stone-500">„Sparsam“ für ältere Smartphones: niedrigere Auflösung, kein Kantenglätten.</p>
        </section>
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Profil</h3>
          <ProfileForm submitLabel="Profil speichern" />
        </section>
      </div>
    </Modal>
  );
}
