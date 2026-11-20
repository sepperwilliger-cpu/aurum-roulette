'use client';
import { create } from 'zustand';
import type { ChatMessage, OwnProfile, Role, RoomState } from '@/lib/protocol';

export interface Settings {
  sound: boolean;
  volume: number;
  music: boolean;
  musicVolume: number;
  animations: 'full' | 'reduced';
  quality: 'high' | 'low';
}

const SETTINGS_KEY = 'aurum.settings.v2';
const defaultSettings: Settings = {
  sound: true,
  volume: 0.7,
  music: true,
  musicVolume: 0.4,
  animations: 'full',
  quality: 'high',
};

function loadSettings(): Settings {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    // Standard: volle Animationen (inkl. Konfetti). "Reduziert" nur, wenn man es selbst wählt –
    // sonst schalten Windows-Einstellungen auf Schul-PCs das Konfetti unbemerkt ab.
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
    // Alte Version: alles übernehmen ausser der (evtl. automatisch gesetzten) Animations-Stufe.
    const old = localStorage.getItem('aurum.settings.v1');
    if (old) {
      const { animations: _ignored, ...rest } = JSON.parse(old);
      void _ignored;
      return { ...defaultSettings, ...rest };
    }
    return defaultSettings;
  } catch {
    return defaultSettings;
  }
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error' | 'success';
}

interface GameStore {
  connected: boolean;
  profile: OwnProfile | null;
  profileLoaded: boolean;
  room: RoomState | null;
  role: Role | null;
  chat: ChatMessage[];
  unreadChat: number;
  /** serverZeit − lokaleZeit in ms */
  clockOffset: number;
  selectedChip: number;
  settings: Settings;
  toasts: Toast[];
  setConnected(v: boolean): void;
  setProfile(p: OwnProfile | null): void;
  setRoom(r: RoomState | null): void;
  setRole(r: Role | null): void;
  setChat(c: ChatMessage[]): void;
  addChat(m: ChatMessage): void;
  markChatRead(): void;
  setChip(v: number): void;
  updateSettings(s: Partial<Settings>): void;
  toast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
}

let toastId = 0;

export const useGame = create<GameStore>((set, get) => ({
  connected: false,
  profile: null,
  profileLoaded: false,
  room: null,
  role: null,
  chat: [],
  unreadChat: 0,
  clockOffset: 0,
  selectedChip: 10,
  settings: defaultSettings,
  toasts: [],
  setConnected: (connected) => set({ connected }),
  setProfile: (profile) => set({ profile, profileLoaded: true }),
  setRoom: (room) =>
    set((s) => {
      if (!room) return { room: null };
      // Eigenes Guthaben aus dem Raum-Snapshot übernehmen.
      const me = s.profile && [...room.players, ...room.spectators].find((p) => p.id === s.profile!.id);
      return {
        room,
        clockOffset: room.serverNow - Date.now(),
        role: me ? me.role : s.role,
        profile:
          me && s.profile
            ? { ...s.profile, balance: me.balance, name: me.name, avatar: me.avatar, color: me.color, img: me.img }
            : s.profile,
      };
    }),
  setRole: (role) => set({ role }),
  setChat: (chat) => set({ chat, unreadChat: 0 }),
  addChat: (m) => set((s) => ({ chat: [...s.chat.slice(-79), m], unreadChat: s.unreadChat + 1 })),
  markChatRead: () => set({ unreadChat: 0 }),
  setChip: (selectedChip) => set({ selectedChip }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignorieren */
    }
    set({ settings });
  },
  toast: (text, tone = 'info') => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 4000 : 2800);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Einstellungen erst im Browser laden (vermeidet Hydration-Unterschiede). */
export function hydrateSettings() {
  useGame.setState({ settings: loadSettings() });
}

export const fmt = (n: number) => n.toLocaleString('de-CH');
export const fmtShort = (n: number) =>
  n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n);
