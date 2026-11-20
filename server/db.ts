/**
 * Persistenz mit dem in Node.js eingebauten SQLite (node:sqlite, ab Node 22.13 ohne Flag).
 * Keine nativen Zusatzpakete nötig – läuft auf Windows ohne Build-Tools.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { START_BALANCE } from '../src/lib/constants';
import type {
  LeaderboardEntry,
  OwnProfile,
  PlayerHistoryRow,
  PlayerStats,
  PublicProfile,
} from '../src/lib/protocol';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  color TEXT NOT NULL,
  balance INTEGER NOT NULL,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  rounds_won INTEGER NOT NULL DEFAULT 0,
  total_wagered INTEGER NOT NULL DEFAULT 0,
  total_returned INTEGER NOT NULL DEFAULT 0,
  biggest_win INTEGER NOT NULL DEFAULT 0,
  resets INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  round_no INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  number INTEGER NOT NULL,
  salt TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rounds_room ON rounds(room_code, round_no);
CREATE TABLE IF NOT EXISTS player_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  number INTEGER NOT NULL,
  wagered INTEGER NOT NULL,
  returned INTEGER NOT NULL,
  bets_json TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_player_rounds ON player_rounds(player_id, at DESC);
CREATE TABLE IF NOT EXISTS room_members (
  room_code TEXT NOT NULL,
  player_id TEXT NOT NULL,
  net INTEGER NOT NULL DEFAULT 0,
  rounds INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (room_code, player_id)
);
`;

export interface PlayerRow {
  id: string;
  token_hash: string;
  name: string;
  avatar: string;
  color: string;
  balance: number;
  rounds_played: number;
  rounds_won: number;
  total_wagered: number;
  total_returned: number;
  biggest_win: number;
  resets: number;
  created_at: number;
  updated_at: number;
  /** Profilbild als geprüfte data:-URL (JPEG/PNG/WebP) */
  avatar_img: string | null;
  avatar_ver: number | null;
}

export interface RoundPlayerResult {
  playerId: string;
  wagered: number;
  returned: number;
  bets: { spot: string; amount: number }[];
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Spalten, die nach der ersten Version dazugekommen sind (werden bei Bedarf per ALTER TABLE ergänzt). */
export const PLAYER_COLUMN_MIGRATIONS: [string, string][] = [
  ['avatar_img', 'ALTER TABLE players ADD COLUMN avatar_img TEXT'],
  ['avatar_ver', 'ALTER TABLE players ADD COLUMN avatar_ver INTEGER'],
];
export { SCHEMA };
export const TABLES = ['players', 'rooms', 'rounds', 'player_rounds', 'room_members'] as const;

export type SqlArg = string | number | null;
/** Empfänger für Schreibbefehle (z. B. Turso-Replikation). */
export type WriteListener = (sql: string, args: SqlArg[]) => void;

export class Database {
  readonly db: DatabaseSync;
  private players = new Map<string, PlayerRow>();
  private st: Record<string, StatementSync>;
  private onWrite: WriteListener | null = null;
  /** Während einer Transaktion gesammelte Schreibbefehle – erst nach COMMIT weitergeben. */
  private txBuffer: { sql: string; args: SqlArg[] }[] | null = null;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA);
    // Migration: Spalten für Profilbilder nachrüsten (bestehende Datenbanken bleiben erhalten)
    const cols = (this.db.prepare('PRAGMA table_info(players)').all() as unknown as { name: string }[]).map((c) => c.name);
    for (const [col, sql] of PLAYER_COLUMN_MIGRATIONS) if (!cols.includes(col)) this.db.exec(sql);
    const p = (sql: string) => this.db.prepare(sql);
    // Schreibende Befehle: lokal ausführen UND an einen evtl. angeschlossenen Replikator melden
    const w = (sql: string) => {
      const stmt = this.db.prepare(sql);
      return {
        run: (...args: SqlArg[]) => {
          const res = stmt.run(...args);
          this.emitWrite(sql, args);
          return res;
        },
      } as unknown as StatementSync;
    };
    this.st = {
      setAvatarImage: w('UPDATE players SET avatar_img = ?, avatar_ver = ?, updated_at = ? WHERE id = ?'),
      roomMembersPreview: p(`SELECT p.id, p.name, p.avatar, p.color, p.avatar_ver FROM room_members m JOIN players p ON p.id = m.player_id
                             WHERE m.room_code = ? ORDER BY m.last_seen DESC LIMIT ?`),
      roomMemberCount: p('SELECT COUNT(*) AS c FROM room_members WHERE room_code = ?'),
      myRooms: p(`SELECT r.code, r.round_no, (r.created_by = ?) AS mine, COALESCE(m.last_seen, r.created_at) AS last_seen
                  FROM rooms r LEFT JOIN room_members m ON m.room_code = r.code AND m.player_id = ?
                  WHERE r.created_by = ? OR m.player_id IS NOT NULL
                  ORDER BY last_seen DESC LIMIT 12`),
      insertPlayer: w(`INSERT INTO players (id, token_hash, name, avatar, color, balance, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
      getPlayer: p('SELECT * FROM players WHERE id = ?'),
      updateProfile: w('UPDATE players SET name = ?, avatar = ?, color = ?, updated_at = ? WHERE id = ?'),
      setBalance: w('UPDATE players SET balance = ?, updated_at = ? WHERE id = ?'),
      resetBalance: w('UPDATE players SET balance = ?, resets = resets + 1, updated_at = ? WHERE id = ?'),
      applyRound: w(`UPDATE players SET balance = ?, rounds_played = rounds_played + 1,
                       rounds_won = rounds_won + ?, total_wagered = total_wagered + ?,
                       total_returned = total_returned + ?, biggest_win = MAX(biggest_win, ?), updated_at = ?
                     WHERE id = ?`),
      insertRoom: w('INSERT INTO rooms (code, created_at, created_by) VALUES (?, ?, ?)'),
      getRoom: p('SELECT * FROM rooms WHERE code = ?'),
      setRoundNo: w('UPDATE rooms SET round_no = ? WHERE code = ?'),
      insertRound: w(`INSERT INTO rounds (room_code, round_no, number, salt, commit_hash, at) VALUES (?, ?, ?, ?, ?, ?)`),
      recentRounds: p('SELECT round_no, number, at FROM rounds WHERE room_code = ? ORDER BY round_no DESC LIMIT ?'),
      distribution: p('SELECT number, COUNT(*) AS c FROM rounds WHERE room_code = ? GROUP BY number'),
      insertPlayerRound: w(`INSERT INTO player_rounds (player_id, room_code, round_no, number, wagered, returned, bets_json, at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
      playerHistory: p(`SELECT room_code, round_no, number, wagered, returned, bets_json, at FROM player_rounds
                        WHERE player_id = ? ORDER BY at DESC, id DESC LIMIT ?`),
      touchMember: w(`INSERT INTO room_members (room_code, player_id, last_seen) VALUES (?, ?, ?)
                      ON CONFLICT(room_code, player_id) DO UPDATE SET last_seen = excluded.last_seen`),
      memberResult: w(`UPDATE room_members SET net = net + ?, rounds = rounds + 1, last_seen = ? WHERE room_code = ? AND player_id = ?`),
      leaderboard: p(`SELECT m.player_id, m.net, m.rounds, p.name, p.avatar, p.color, p.balance, p.avatar_ver
                      FROM room_members m JOIN players p ON p.id = m.player_id
                      WHERE m.room_code = ? ORDER BY m.net DESC, p.balance DESC LIMIT 20`),
    };
  }

  // ---------- Replikation ----------

  /** Schliesst einen Empfänger für alle Schreibbefehle an (z. B. Turso). */
  setWriteListener(listener: WriteListener | null) {
    this.onWrite = listener;
  }

  private emitWrite(sql: string, args: SqlArg[]) {
    if (!this.onWrite) return;
    if (this.txBuffer) this.txBuffer.push({ sql, args });
    else this.onWrite(sql, args);
  }

  // ---------- Spieler ----------

  createPlayer(name: string, avatar: string, color: string): { player: PlayerRow; token: string } {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.st.insertPlayer.run(id, hashToken(token), name, avatar, color, START_BALANCE, now, now);
    return { player: this.getPlayer(id)!, token };
  }

  getPlayer(id: string): PlayerRow | null {
    const cached = this.players.get(id);
    if (cached) return cached;
    const row = this.st.getPlayer.get(id) as unknown as PlayerRow | undefined;
    if (!row) return null;
    this.players.set(id, { ...row });
    return this.players.get(id)!;
  }

  authenticate(id: unknown, token: unknown): PlayerRow | null {
    if (typeof id !== 'string' || typeof token !== 'string' || id.length > 64 || token.length > 128) return null;
    const p = this.getPlayer(id);
    if (!p) return null;
    const a = Buffer.from(p.token_hash, 'hex');
    const b = Buffer.from(hashToken(token), 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? p : null;
  }

  updateProfile(id: string, name: string, avatar: string, color: string) {
    const p = this.getPlayer(id);
    if (!p) return;
    Object.assign(p, { name, avatar, color, updated_at: Date.now() });
    this.st.updateProfile.run(name, avatar, color, p.updated_at, id);
  }

  /** Ändert das Guthaben atomar; wirft, falls es negativ würde. */
  adjustBalance(id: string, delta: number): number {
    const p = this.getPlayer(id);
    if (!p) throw new Error('Spieler unbekannt');
    const next = p.balance + delta;
    if (!Number.isSafeInteger(next) || next < 0) throw new Error('Nicht genügend Guthaben');
    p.balance = next;
    p.updated_at = Date.now();
    this.st.setBalance.run(next, p.updated_at, id);
    return next;
  }

  resetBalance(id: string, amount: number) {
    const p = this.getPlayer(id);
    if (!p) return;
    p.balance = amount;
    p.resets += 1;
    p.updated_at = Date.now();
    this.st.resetBalance.run(amount, p.updated_at, id);
  }

  /** Profilbild setzen (bereits geprüfte data:-URL) oder mit null entfernen. */
  setAvatarImage(id: string, dataUrl: string | null) {
    const p = this.getPlayer(id);
    if (!p) return;
    const now = Date.now();
    p.avatar_img = dataUrl;
    p.avatar_ver = dataUrl ? now : null;
    p.updated_at = now;
    this.st.setAvatarImage.run(dataUrl, p.avatar_ver, now, id);
  }

  avatarImage(id: string): string | null {
    return this.getPlayer(id)?.avatar_img ?? null;
  }

  ownProfile(id: string): OwnProfile | null {
    const p = this.getPlayer(id);
    return p ? { ...this.publicProfile(id)!, balance: p.balance } : null;
  }

  publicProfile(id: string): PublicProfile | null {
    const p = this.getPlayer(id);
    return p ? { id: p.id, name: p.name, avatar: p.avatar, color: p.color, img: p.avatar_ver ?? null } : null;
  }

  stats(id: string): PlayerStats | null {
    const p = this.getPlayer(id);
    if (!p) return null;
    return {
      roundsPlayed: p.rounds_played,
      roundsWon: p.rounds_won,
      totalWagered: p.total_wagered,
      totalReturned: p.total_returned,
      biggestWin: p.biggest_win,
      resets: p.resets,
      createdAt: p.created_at,
    };
  }

  history(id: string, limit = 50): PlayerHistoryRow[] {
    const rows = this.st.playerHistory.all(id, limit) as unknown as {
      room_code: string; round_no: number; number: number; wagered: number; returned: number; bets_json: string; at: number;
    }[];
    return rows.map((r) => ({
      roomCode: r.room_code,
      round: r.round_no,
      number: r.number,
      wagered: r.wagered,
      returned: r.returned,
      bets: JSON.parse(r.bets_json),
      at: r.at,
    }));
  }

  // ---------- Räume ----------

  createRoom(code: string, createdBy: string) {
    this.st.insertRoom.run(code, Date.now(), createdBy);
  }

  getRoom(code: string): { code: string; round_no: number } | null {
    return (this.st.getRoom.get(code) as unknown as { code: string; round_no: number } | undefined) ?? null;
  }

  setRoundNo(code: string, roundNo: number) {
    this.st.setRoundNo.run(roundNo, code);
  }

  recentRounds(code: string, limit: number) {
    return (this.st.recentRounds.all(code, limit) as unknown as { round_no: number; number: number; at: number }[]).map(
      (r) => ({ round: r.round_no, number: r.number, at: r.at }),
    );
  }

  distribution(code: string): number[] {
    const out = new Array(37).fill(0);
    for (const r of this.st.distribution.all(code) as unknown as { number: number; c: number }[]) out[r.number] = r.c;
    return out;
  }

  /** Räume, die der Spieler erstellt oder in denen er gespielt hat (zum schnellen Wiederbetreten). */
  myRooms(playerId: string): { code: string; rounds: number; mine: boolean; lastSeen: number }[] {
    return (
      this.st.myRooms.all(playerId, playerId, playerId) as unknown as {
        code: string; round_no: number; mine: number; last_seen: number;
      }[]
    ).map((r) => ({ code: r.code, rounds: r.round_no, mine: r.mine === 1, lastSeen: r.last_seen }));
  }

  /** Die zuletzt aktiven Spieler eines Raums (für die Vorschau auf der Startseite) + Gesamtzahl. */
  roomMembers(code: string, limit = 3): { members: PublicProfile[]; total: number } {
    const rows = this.st.roomMembersPreview.all(code, limit) as unknown as {
      id: string; name: string; avatar: string; color: string; avatar_ver: number | null;
    }[];
    const total = Number((this.st.roomMemberCount.get(code) as unknown as { c: number }).c);
    return {
      members: rows.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar, color: r.color, img: r.avatar_ver ?? null })),
      total,
    };
  }

  touchMember(code: string, playerId: string) {
    this.st.touchMember.run(code, playerId, Date.now());
  }

  leaderboard(code: string): LeaderboardEntry[] {
    return (
      this.st.leaderboard.all(code) as unknown as {
        player_id: string; net: number; rounds: number; name: string; avatar: string; color: string; balance: number;
        avatar_ver: number | null;
      }[]
    ).map((r) => ({
      id: r.player_id, name: r.name, avatar: r.avatar, color: r.color, img: r.avatar_ver ?? null,
      net: r.net, rounds: r.rounds, balance: r.balance,
    }));
  }

  /** Bucht eine ganze Runde in einer Transaktion: Rundenergebnis, Guthaben, Statistiken. */
  recordRound(
    code: string,
    round: { roundNo: number; number: number; salt: string; commit: string },
    results: RoundPlayerResult[],
  ) {
    const now = Date.now();
    this.db.exec('BEGIN');
    this.txBuffer = [];
    try {
      this.st.insertRound.run(code, round.roundNo, round.number, round.salt, round.commit, now);
      for (const r of results) {
        const p = this.getPlayer(r.playerId);
        if (!p) continue;
        const net = r.returned - r.wagered;
        const balance = p.balance + r.returned;
        this.st.applyRound.run(balance, net > 0 ? 1 : 0, r.wagered, r.returned, Math.max(0, net), now, p.id);
        this.st.insertPlayerRound.run(p.id, code, round.roundNo, round.number, r.wagered, r.returned, JSON.stringify(r.bets), now);
        this.st.touchMember.run(code, p.id, now);
        this.st.memberResult.run(net, now, code, p.id);
      }
      this.db.exec('COMMIT');
      // Erst nach erfolgreichem Commit an die Replikation weitergeben (gesammelt, in Reihenfolge)
      const buffered = this.txBuffer;
      this.txBuffer = null;
      for (const s of buffered) this.onWrite?.(s.sql, s.args);
    } catch (e) {
      this.txBuffer = null;
      this.db.exec('ROLLBACK');
      // Cache verwerfen, damit er wieder dem DB-Stand entspricht.
      for (const r of results) this.players.delete(r.playerId);
      throw e;
    }
    // Cache erst nach erfolgreichem Commit nachführen.
    for (const r of results) {
      const p = this.getPlayer(r.playerId);
      if (!p) continue;
      const net = r.returned - r.wagered;
      p.balance += r.returned;
      p.rounds_played += 1;
      p.rounds_won += net > 0 ? 1 : 0;
      p.total_wagered += r.wagered;
      p.total_returned += r.returned;
      p.biggest_win = Math.max(p.biggest_win, net);
      p.updated_at = now;
    }
  }

  close() {
    this.db.close();
  }
}
