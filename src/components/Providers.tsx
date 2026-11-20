'use client';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getSocket, loadSession, request, saveSession } from '@/client/socket';
import { hydrateSettings, useGame } from '@/client/store';
import { sfx, unlockAudio } from '@/client/sound';
import { music } from '@/client/music';
import type { ChatMessage, OwnProfile, RoomState } from '@/lib/protocol';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    hydrateSettings();
    const s = getSocket();
    const g = useGame.getState;

    const onConnect = async () => {
      g().setConnected(true);
      const res = await request<{ profile: OwnProfile | null }>('profile:get');
      if (res.ok) {
        // Server kennt die gespeicherte Sitzung nicht (mehr) → lokal verwerfen.
        if (!res.profile && loadSession()) saveSession(null);
        g().setProfile(res.profile);
      } else {
        g().setProfile(null);
      }
    };
    const onDisconnect = () => g().setConnected(false);
    const onState = (state: RoomState) => {
      if (g().room && g().room!.code !== state.code) return;
      g().setRoom(state);
    };
    const onChat = (m: ChatMessage) => {
      g().addChat(m);
      if (!m.system && m.playerId !== g().profile?.id) sfx.message();
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('room:state', onState);
    s.on('chat:message', onChat);
    if (s.connected) void onConnect();

    // ---------------- Hintergrundmusik
    // Browser erlauben Audio erst nach einer Nutzeraktion → beim ersten Klick/Tastendruck starten.
    let unlocked = false;
    const syncMusic = () => {
      const { music: on, musicVolume } = g().settings;
      if (unlocked && on && !document.hidden) music.start(musicVolume);
      else music.stop();
    };
    const onFirstGesture = () => {
      if (unlocked) return;
      unlocked = true;
      unlockAudio();
      syncMusic();
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);
    document.addEventListener('visibilitychange', syncMusic);
    const unsubscribe = useGame.subscribe((st, prev) => {
      if (st.settings.music !== prev.settings.music) syncMusic();
      else if (st.settings.musicVolume !== prev.settings.musicVolume) music.setVolume(st.settings.musicVolume);
    });

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('room:state', onState);
      s.off('chat:message', onChat);
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      document.removeEventListener('visibilitychange', syncMusic);
      unsubscribe();
      music.stop();
    };
  }, []);

  return (
    <>
      {children}
      <Toasts />
    </>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            onClick={() => dismiss(t.id)}
            className={`glass pointer-events-auto max-w-md rounded-2xl px-4 py-2.5 text-sm font-medium ${
              t.tone === 'error' ? 'text-red-200' : t.tone === 'success' ? 'text-emerald-200' : 'text-stone-100'
            }`}
          >
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
