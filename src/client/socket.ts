'use client';
import { io, type Socket } from 'socket.io-client';

const SESSION_KEY = 'aurum.session.v1';

export interface Session {
  playerId: string;
  token: string;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return typeof s?.playerId === 'string' && typeof s?.token === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* privater Modus: Sitzung gilt dann nur für diesen Tab */
  }
}

let socket: Socket | null = null;

/** Eine gemeinsame Verbindung pro Browser-Tab; verbindet sich automatisch neu. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      // Bei jedem (Wieder-)Verbinden die aktuelle Sitzung mitschicken.
      auth: (cb) => cb(loadSession() ?? {}),
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export type AckResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/** emit mit Antwort als Promise (inkl. Timeout). */
export function request<T = object>(event: string, payload?: unknown, timeoutMs = 8000): Promise<AckResult<T>> {
  const s = getSocket();
  return new Promise((resolve) => {
    const args: unknown[] = payload === undefined ? [] : [payload];
    s.timeout(timeoutMs).emit(event, ...args, (err: Error | null, res: AckResult<T>) => {
      if (err) resolve({ ok: false, error: 'Keine Antwort vom Server – Verbindung prüfen.' });
      else resolve(res);
    });
  });
}
