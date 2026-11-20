import { randomInt } from 'node:crypto';
import { AVATARS, NAME_MAX_LEN, PLAYER_COLORS, START_BALANCE } from '../src/lib/constants';
import type { Database } from './db';
import { GameError, Room, type RoomHooks } from './room';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const OFFLINE_KICK_MS = 5 * 60_000;
export const ROOM_IDLE_UNLOAD_MS = 30 * 60_000;

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') throw new GameError('Bitte einen Namen eingeben.');
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LEN);
  if (name.length < 2) throw new GameError('Der Name braucht mindestens 2 Zeichen.');
  return name;
}

export function sanitizeAvatar(raw: unknown): string {
  return typeof raw === 'string' && (AVATARS as readonly string[]).includes(raw) ? raw : AVATARS[0];
}

export function sanitizeColor(raw: unknown): string {
  return typeof raw === 'string' && (PLAYER_COLORS as readonly string[]).includes(raw) ? raw : PLAYER_COLORS[0];
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : null;
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout;

  constructor(
    readonly db: Database,
    private readonly hooks: RoomHooks,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref();
  }

  /** Neuer Raum mit zufälligem oder selbst gewähltem Code. Codes sind dauerhaft und wiederverwendbar. */
  createRoom(createdBy: string, wishedCode?: unknown): Room {
    let code = '';
    if (wishedCode !== undefined && wishedCode !== null && wishedCode !== '') {
      const c = normalizeCode(wishedCode);
      if (!c) throw new GameError('Eigener Code: 4–8 Zeichen, nur Buchstaben A–Z und Ziffern.');
      if (this.db.getRoom(c)) throw new GameError(`Der Code ${c} ist schon vergeben – einfach beitreten oder anderen Code wählen.`);
      code = c;
    } else {
      do {
        code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      } while (this.db.getRoom(code));
    }
    this.db.createRoom(code, createdBy);
    return this.get(code)!;
  }

  onlineCount(code: string): number {
    const room = this.rooms.get(code);
    return room ? [...room.members.values()].filter((m) => m.sockets.size > 0).length : 0;
  }

  /** Lädt einen Raum aus dem Speicher oder der Datenbank. */
  get(codeRaw: unknown): Room | null {
    const code = normalizeCode(codeRaw);
    if (!code) return null;
    let room = this.rooms.get(code);
    if (room) return room;
    if (!this.db.getRoom(code)) return null;
    room = new Room(code, this.db, this.hooks);
    this.rooms.set(code, room);
    return room;
  }

  roomsOf(playerId: string): Room[] {
    return [...this.rooms.values()].filter((r) => r.members.has(playerId));
  }

  resetBalance(playerId: string) {
    const rooms = [...this.rooms.values()];
    // Erst prüfen, dann ausführen – sonst würde ein Fehler in Raum B den Reset halb erledigen.
    for (const r of rooms) if (r.hasOpenBets(playerId) && r.phase !== 'betting')
      throw new GameError('Während die Kugel rollt, ist kein Reset möglich.');
    for (const r of rooms) r.releaseBetsForReset(playerId);
    this.db.resetBalance(playerId, START_BALANCE);
  }

  private sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      room.sweep(OFFLINE_KICK_MS);
      if (!room.hasOnline() && room.emptySince && now - room.emptySince > ROOM_IDLE_UNLOAD_MS && room.phase === 'waiting') {
        room.dispose();
        this.rooms.delete(code);
      }
    }
  }

  dispose() {
    clearInterval(this.sweeper);
    for (const r of this.rooms.values()) r.dispose();
  }
}
