/**
 * Ein Roulette-Raum: Spieler, Zuschauer, Einsätze und der Rundenablauf
 * (Einsätze → Drehen → Ergebnis → nächste Runde). Läuft vollständig auf dem Server;
 * Clients bekommen nur Zustands-Snapshots.
 */
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  BETTING_MS,
  CHAT_MAX_LEN,
  HISTORY_SIZE,
  MAX_BETS_PER_ROUND,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  RESULT_MS,
  SPIN_MS,
  START_BALANCE,
} from '../src/lib/constants';
import { aggregateBets, getSpot, settle, type Bet } from '../src/lib/roulette';
import type {
  ChatMessage,
  HistoryEntry,
  LeaderboardEntry,
  Phase,
  PlayerView,
  Role,
  RoomState,
  SettlementView,
} from '../src/lib/protocol';
import type { Database } from './db';

export class GameError extends Error {}

interface Member {
  id: string;
  role: Role;
  sockets: Set<string>;
  offlineSince: number | null;
}

interface RoundSecret {
  number: number;
  salt: string;
  commit: string;
}

export interface RoomHooks {
  onChange(room: Room): void;
  onChat(room: Room, msg: ChatMessage): void;
}

/** Sichere Zufallszahl 0–36 (crypto.randomInt nutzt den CSPRNG des Betriebssystems). */
export function drawNumber(): number {
  return randomInt(0, 37);
}

export function commitFor(code: string, roundNo: number, number: number, salt: string): string {
  return createHash('sha256').update(`${code}:${roundNo}:${number}:${salt}`).digest('hex');
}

export class Room {
  readonly code: string;
  readonly members = new Map<string, Member>();
  phase: Phase = 'waiting';
  phaseStartedAt = Date.now();
  phaseEndsAt = 0;
  roundNo: number;
  private secret: RoundSecret | null = null;
  private revealed = false;
  /** Einzelne Einsätze pro Spieler (Reihenfolge wichtig für "Rückgängig"). */
  readonly bets = new Map<string, Bet[]>();
  private lastBets = new Map<string, Bet[]>();
  private lastNet = new Map<string, number>();
  history: HistoryEntry[];
  distribution: number[];
  totalRounds: number;
  leaderboard: LeaderboardEntry[];
  lastSettlement: SettlementView | null = null;
  readonly chat: ChatMessage[] = [];
  private timer: NodeJS.Timeout | null = null;
  emptySince: number | null = Date.now();

  constructor(
    code: string,
    private readonly db: Database,
    private readonly hooks: RoomHooks,
  ) {
    this.code = code;
    const row = db.getRoom(code);
    if (!row) throw new GameError('Raum nicht gefunden');
    this.roundNo = row.round_no;
    this.history = db.recentRounds(code, HISTORY_SIZE);
    this.distribution = db.distribution(code);
    this.totalRounds = this.distribution.reduce((a, b) => a + b, 0);
    this.leaderboard = db.leaderboard(code);
  }

  // ------------------------------------------------------------------ Mitglieder

  get playerCount() {
    return [...this.members.values()].filter((m) => m.role === 'player').length;
  }

  hasOnline() {
    return [...this.members.values()].some((m) => m.sockets.size > 0);
  }

  join(playerId: string, socketId: string, wantSpectator: boolean): { role: Role; notice?: string } {
    let member = this.members.get(playerId);
    let notice: string | undefined;
    if (!member) {
      let role: Role = wantSpectator ? 'spectator' : 'player';
      if (role === 'player' && this.playerCount >= MAX_PLAYERS) {
        role = 'spectator';
        notice = `Der Tisch ist voll (${MAX_PLAYERS} Spieler) – du schaust als Zuschauer zu.`;
      }
      if (role === 'spectator' && this.members.size - this.playerCount >= MAX_SPECTATORS) {
        throw new GameError('Der Raum ist voll.');
      }
      member = { id: playerId, role, sockets: new Set(), offlineSince: null };
      this.members.set(playerId, member);
      this.systemMessage(`${this.db.getPlayer(playerId)?.name ?? 'Jemand'} ist ${role === 'player' ? 'am Tisch' : 'als Zuschauer'} beigetreten.`);
    }
    member.sockets.add(socketId);
    member.offlineSince = null;
    this.emptySince = null;
    if (member.role === 'player') {
      this.db.touchMember(this.code, playerId);
      this.leaderboard = this.db.leaderboard(this.code);
    }
    if (this.phase === 'waiting') this.startBetting();
    this.changed();
    return { role: member.role, notice };
  }

  disconnect(playerId: string, socketId: string) {
    const m = this.members.get(playerId);
    if (!m) return;
    m.sockets.delete(socketId);
    if (m.sockets.size === 0) {
      m.offlineSince = Date.now();
      if (!this.hasOnline()) this.emptySince = Date.now();
    }
    this.changed();
  }

  /** Verlässt den Raum endgültig. Offene Einsätze in der Setzphase werden erstattet. */
  leave(playerId: string) {
    const m = this.members.get(playerId);
    if (!m) return;
    if (this.phase === 'betting') this.refundAll(playerId);
    this.members.delete(playerId);
    this.systemMessage(`${this.db.getPlayer(playerId)?.name ?? 'Jemand'} hat den Raum verlassen.`);
    if (!this.hasOnline()) this.emptySince = Date.now();
    this.changed();
  }

  switchRole(playerId: string, to: Role) {
    const m = this.members.get(playerId);
    if (!m) throw new GameError('Nicht im Raum');
    if (m.role === to) return;
    if (to === 'player' && this.playerCount >= MAX_PLAYERS) throw new GameError('Alle Plätze am Tisch sind belegt.');
    if (to === 'spectator') {
      if (this.phase === 'spinning' && (this.bets.get(playerId)?.length ?? 0) > 0)
        throw new GameError('Warte, bis die Runde vorbei ist.');
      if (this.phase === 'betting') this.refundAll(playerId);
    }
    m.role = to;
    if (to === 'player') {
      this.db.touchMember(this.code, playerId);
      this.leaderboard = this.db.leaderboard(this.code);
    }
    this.changed();
  }

  /** Entfernt Spieler, die länger als `maxOfflineMs` getrennt sind und keine offenen Einsätze haben. */
  sweep(maxOfflineMs: number) {
    const now = Date.now();
    let changed = false;
    for (const m of this.members.values()) {
      if (m.offlineSince && now - m.offlineSince > maxOfflineMs && !(this.bets.get(m.id)?.length)) {
        this.members.delete(m.id);
        changed = true;
      }
    }
    if (changed) this.changed();
  }

  // ------------------------------------------------------------------ Einsätze

  private requireBettingPlayer(playerId: string) {
    const m = this.members.get(playerId);
    if (!m) throw new GameError('Nicht im Raum');
    if (m.role !== 'player') throw new GameError('Zuschauer können nicht setzen.');
    if (this.phase !== 'betting') throw new GameError('Nichts geht mehr – Einsätze sind gesperrt.');
  }

  private validateAmount(amount: unknown): number {
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 1)
      throw new GameError('Ungültiger Einsatz');
    return amount;
  }

  placeBet(playerId: string, spotKey: unknown, amountRaw: unknown) {
    this.requireBettingPlayer(playerId);
    const spot = getSpot(spotKey);
    if (!spot) throw new GameError('Ungültiges Wettfeld');
    const amount = this.validateAmount(amountRaw);
    this.addBets(playerId, [{ spot: spot.key, amount }]);
  }

  private addBets(playerId: string, newBets: Bet[]) {
    const list = this.bets.get(playerId) ?? [];
    if (list.length + newBets.length > MAX_BETS_PER_ROUND) throw new GameError('Zu viele Einzeleinsätze in dieser Runde.');
    // Kein Tischlimit – einzige Grenze ist das eigene Guthaben.
    const sum = newBets.reduce((a, b) => a + b.amount, 0);
    if (!Number.isSafeInteger(sum)) throw new GameError('Ungültiger Einsatz');
    const player = this.db.getPlayer(playerId);
    if (!player || player.balance < sum) throw new GameError('Nicht genügend Guthaben.');
    this.db.adjustBalance(playerId, -sum);
    list.push(...newBets);
    this.bets.set(playerId, list);
    this.changed();
  }

  undo(playerId: string) {
    this.requireBettingPlayer(playerId);
    const list = this.bets.get(playerId);
    const last = list?.pop();
    if (!last) throw new GameError('Keine Einsätze zum Rückgängigmachen.');
    this.db.adjustBalance(playerId, last.amount);
    this.changed();
  }

  clear(playerId: string) {
    this.requireBettingPlayer(playerId);
    this.refundAll(playerId);
    this.changed();
  }

  repeat(playerId: string) {
    this.requireBettingPlayer(playerId);
    const last = this.lastBets.get(playerId);
    if (!last?.length) throw new GameError('Keine Einsätze aus der letzten Runde.');
    this.addBets(playerId, aggregateBets(last));
  }

  double(playerId: string) {
    this.requireBettingPlayer(playerId);
    const cur = this.bets.get(playerId);
    if (!cur?.length) throw new GameError('Noch keine Einsätze zum Verdoppeln.');
    this.addBets(playerId, aggregateBets(cur));
  }

  private refundAll(playerId: string) {
    const list = this.bets.get(playerId);
    if (!list?.length) return;
    const sum = list.reduce((a, b) => a + b.amount, 0);
    this.bets.delete(playerId);
    this.db.adjustBalance(playerId, sum);
  }

  /** Noch nicht abgerechnete Einsätze (in der Ergebnisphase ist bereits ausbezahlt). */
  hasOpenBets(playerId: string) {
    if (this.phase !== 'betting' && this.phase !== 'spinning') return false;
    return (this.bets.get(playerId)?.length ?? 0) > 0;
  }

  /** Für Guthaben-Reset: Einsätze der laufenden Setzphase zurückgeben. */
  releaseBetsForReset(playerId: string) {
    if (!this.hasOpenBets(playerId)) return;
    if (this.phase !== 'betting') throw new GameError('Während die Kugel rollt, ist kein Reset möglich.');
    this.refundAll(playerId);
    this.changed();
  }

  // ------------------------------------------------------------------ Chat

  addChat(playerId: string, textRaw: unknown) {
    if (!this.members.has(playerId)) throw new GameError('Nicht im Raum');
    if (typeof textRaw !== 'string') throw new GameError('Ungültige Nachricht');
    // Steuerzeichen entfernen, Länge begrenzen. Darstellung im Client erfolgt als Text (kein HTML).
    const text = textRaw.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CHAT_MAX_LEN);
    if (!text) return;
    const p = this.db.getPlayer(playerId)!;
    this.pushChat({
      id: randomUUID(), playerId, name: p.name, avatar: p.avatar, color: p.color, img: p.avatar_ver ?? null, text, at: Date.now(),
    });
  }

  private systemMessage(text: string) {
    this.pushChat({ id: randomUUID(), playerId: '', name: 'Croupier', avatar: '🎩', color: '#d4af37', text, at: Date.now(), system: true });
  }

  private pushChat(msg: ChatMessage) {
    this.chat.push(msg);
    if (this.chat.length > 60) this.chat.splice(0, this.chat.length - 60);
    this.hooks.onChat(this, msg);
  }

  // ------------------------------------------------------------------ Rundenablauf

  private setPhase(phase: Phase, durationMs: number, next: (() => void) | null) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.phase = phase;
    this.phaseStartedAt = Date.now();
    this.phaseEndsAt = durationMs > 0 ? this.phaseStartedAt + durationMs : 0;
    if (next) this.timer = setTimeout(next, durationMs);
    this.changed();
  }

  startBetting() {
    this.roundNo += 1;
    this.db.setRoundNo(this.code, this.roundNo);
    // Ergebnis wird jetzt geheim gezogen; veröffentlicht wird nur der Hash (Commit).
    const number = drawNumber();
    const salt = randomBytes(16).toString('hex');
    this.secret = { number, salt, commit: commitFor(this.code, this.roundNo, number, salt) };
    this.revealed = false;
    this.bets.clear();
    this.setPhase('betting', BETTING_MS, () => this.startSpin());
  }

  startSpin() {
    this.revealed = true; // Einsätze sind gesperrt → Ergebnis darf an Clients (für die Animation).
    this.setPhase('spinning', SPIN_MS, () => this.finishRound());
  }

  finishRound() {
    const secret = this.secret!;
    const results: SettlementView['results'] = [];
    const dbResults = [];
    for (const [playerId, list] of this.bets) {
      if (!list.length) continue;
      const bets = aggregateBets(list);
      const s = settle(bets, secret.number);
      results.push({ playerId, ...s });
      dbResults.push({ playerId, wagered: s.wagered, returned: s.returned, bets });
    }
    this.db.recordRound(this.code, { roundNo: this.roundNo, ...secret }, dbResults);

    this.lastNet.clear();
    for (const r of results) this.lastNet.set(r.playerId, r.net);
    for (const [pid, list] of this.bets) if (list.length) this.lastBets.set(pid, [...list]);
    this.lastSettlement = { round: this.roundNo, number: secret.number, results };
    this.history.unshift({ round: this.roundNo, number: secret.number, at: Date.now() });
    this.history.length = Math.min(this.history.length, HISTORY_SIZE);
    this.distribution[secret.number] += 1;
    this.totalRounds += 1;
    this.leaderboard = this.db.leaderboard(this.code);

    const nextRound = () => {
      if (this.hasOnline()) this.startBetting();
      else {
        this.bets.clear();
        this.secret = null;
        this.setPhase('waiting', 0, null);
      }
    };
    this.setPhase('result', RESULT_MS, nextRound);
  }

  // ------------------------------------------------------------------ Snapshot

  private changeQueued = false;
  private changed() {
    if (this.changeQueued) return;
    this.changeQueued = true;
    queueMicrotask(() => {
      this.changeQueued = false;
      this.hooks.onChange(this);
    });
  }

  private view(m: Member): PlayerView {
    const p = this.db.getPlayer(m.id)!;
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      img: p.avatar_ver ?? null,
      role: m.role,
      online: m.sockets.size > 0,
      balance: p.balance,
      roundWager: (this.bets.get(m.id) ?? []).reduce((a, b) => a + b.amount, 0),
      lastNet: this.lastNet.get(m.id) ?? null,
    };
  }

  snapshot(): RoomState {
    const members = [...this.members.values()].filter((m) => this.db.getPlayer(m.id));
    const table = [];
    for (const [playerId, list] of this.bets) {
      for (const b of aggregateBets(list)) table.push({ playerId, ...b });
    }
    return {
      code: this.code,
      phase: this.phase,
      phaseStartedAt: this.phaseStartedAt,
      phaseEndsAt: this.phaseEndsAt,
      serverNow: Date.now(),
      roundNo: this.roundNo,
      commit: this.secret?.commit ?? '',
      reveal: this.revealed && this.secret ? { number: this.secret.number, salt: this.secret.salt } : null,
      players: members.filter((m) => m.role === 'player').map((m) => this.view(m)),
      spectators: members.filter((m) => m.role === 'spectator').map((m) => this.view(m)),
      table,
      history: this.history,
      distribution: this.distribution,
      totalRounds: this.totalRounds,
      leaderboard: this.leaderboard,
      lastSettlement: this.phase === 'result' ? this.lastSettlement : null,
      maxPlayers: MAX_PLAYERS,
    };
  }

  /** Nur für Tests: das geheime Ergebnis der laufenden Runde. */
  peekSecretForTests() {
    return this.secret;
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export { START_BALANCE };
