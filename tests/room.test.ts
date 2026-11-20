import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BETTING_MS, MAX_PLAYERS, RESULT_MS, SPIN_MS, START_BALANCE } from '@/lib/constants';
import { Database } from '../server/db';
import { RoomManager } from '../server/manager';
import { commitFor, drawNumber, GameError, type Room } from '../server/room';

let db: Database;
let manager: RoomManager;
let room: Room;
const ids: string[] = [];

function newPlayer(name: string) {
  const { player } = db.createPlayer(name, '🦊', '#f5c542');
  ids.push(player.id);
  return player.id;
}
const balance = (id: string) => db.getPlayer(id)!.balance;

beforeEach(() => {
  vi.useFakeTimers();
  db = new Database(':memory:');
  manager = new RoomManager(db, { onChange: () => {}, onChat: () => {} });
  const host = newPlayer('Host');
  room = manager.createRoom(host);
  room.join(host, 's-host', false);
});

afterEach(() => {
  manager.dispose();
  db.close();
  ids.length = 0;
  vi.useRealTimers();
});

describe('Rundenablauf', () => {
  it('startet beim ersten Beitritt die Setzphase mit 20 s Countdown', () => {
    expect(room.phase).toBe('betting');
    expect(room.phaseEndsAt - room.phaseStartedAt).toBe(BETTING_MS);
    expect(room.snapshot().reveal).toBeNull(); // Ergebnis noch geheim
    expect(room.snapshot().commit).toMatch(/^[0-9a-f]{64}$/);
  });

  it('durchläuft Setzen → Drehen → Ergebnis → nächste Runde', () => {
    const r1 = room.roundNo;
    vi.advanceTimersByTime(BETTING_MS);
    expect(room.phase).toBe('spinning');
    expect(room.snapshot().reveal).not.toBeNull();
    vi.advanceTimersByTime(SPIN_MS);
    expect(room.phase).toBe('result');
    expect(room.history[0].round).toBe(r1);
    vi.advanceTimersByTime(RESULT_MS);
    expect(room.phase).toBe('betting');
    expect(room.roundNo).toBe(r1 + 1);
  });

  it('veröffentlichtes Ergebnis passt zum vorher publizierten Commit', () => {
    const commit = room.snapshot().commit;
    vi.advanceTimersByTime(BETTING_MS);
    const { reveal, roundNo, code } = room.snapshot();
    expect(commitFor(code, roundNo, reveal!.number, reveal!.salt)).toBe(commit);
  });

  it('pausiert, wenn niemand mehr online ist', () => {
    room.disconnect(ids[0], 's-host');
    vi.advanceTimersByTime(BETTING_MS + SPIN_MS + RESULT_MS);
    expect(room.phase).toBe('waiting');
    room.join(ids[0], 's-host-2', false);
    expect(room.phase).toBe('betting');
  });
});

describe('Einsätze & Auszahlung', () => {
  it('bucht Einsätze ab und zahlt Gewinne korrekt aus', () => {
    const host = ids[0];
    const n = room.peekSecretForTests()!.number;
    room.placeBet(host, `straight:${n}`, 10);
    room.placeBet(host, n === 17 ? 'straight:18' : 'straight:17', 5);
    expect(balance(host)).toBe(START_BALANCE - 15);
    vi.advanceTimersByTime(BETTING_MS + SPIN_MS);
    expect(balance(host)).toBe(START_BALANCE - 15 + 360);
    const stats = db.stats(host)!;
    expect(stats).toMatchObject({ roundsPlayed: 1, roundsWon: 1, totalWagered: 15, totalReturned: 360, biggestWin: 345 });
    expect(db.history(host)[0]).toMatchObject({ number: n, wagered: 15, returned: 360 });
  });

  it('zahlt erst nach Ablauf der Drehung aus (kein Spoiler)', () => {
    const host = ids[0];
    const n = room.peekSecretForTests()!.number;
    room.placeBet(host, `straight:${n}`, 100);
    vi.advanceTimersByTime(BETTING_MS);
    expect(balance(host)).toBe(START_BALANCE - 100);
    vi.advanceTimersByTime(SPIN_MS);
    expect(balance(host)).toBe(START_BALANCE + 3500);
  });

  it('lehnt ungültige Einsätze serverseitig ab', () => {
    const host = ids[0];
    expect(() => room.placeBet(host, 'split:1-5', 10)).toThrow(GameError);
    expect(() => room.placeBet(host, 'red', 0)).toThrow(GameError);
    expect(() => room.placeBet(host, 'red', -5)).toThrow(GameError);
    expect(() => room.placeBet(host, 'red', 1.5)).toThrow(GameError);
    expect(() => room.placeBet(host, 'red', '100')).toThrow(GameError);
    expect(() => room.placeBet(host, 'red', START_BALANCE + 1)).toThrow(/Guthaben/);
    expect(() => room.placeBet(host, 'red', Number.MAX_SAFE_INTEGER + 2)).toThrow(GameError);
    expect(balance(host)).toBe(START_BALANCE);
  });

  it('lehnt Einsätze nach "Nichts geht mehr" ab', () => {
    vi.advanceTimersByTime(BETTING_MS);
    expect(() => room.placeBet(ids[0], 'red', 10)).toThrow(/gesperrt/);
  });

  it('erzwingt das Guthaben', () => {
    const host = ids[0];
    room.placeBet(host, 'red', 10_000);
    expect(balance(host)).toBe(0);
    expect(() => room.placeBet(host, 'black', 1)).toThrow(/Guthaben/);
    expect(() => room.placeBet(host, 'red', 1)).toThrow(/Guthaben/);
  });

  it('kein Tischlimit: mit viel Guthaben beliebig hoch auf ein Feld setzen', () => {
    const host = ids[0];
    db.adjustBalance(host, 990_000); // z. B. nach grossen Gewinnen: 1 Mio.
    room.placeBet(host, 'red', 600_000);
    room.placeBet(host, 'red', 400_000);
    expect(balance(host)).toBe(0);
    expect(room.snapshot().table).toEqual([{ playerId: host, spot: 'red', amount: 1_000_000 }]);
    room.clear(host);
    room.placeBet(host, 'straight:17', 500_000);
    room.double(host); // Verdoppeln auf 1 Mio. auf einer Zahl
    expect(room.snapshot().table[0].amount).toBe(1_000_000);
  });

  it('Rückgängig, Löschen, Verdoppeln und Wiederholen', () => {
    const host = ids[0];
    room.placeBet(host, 'red', 100);
    room.placeBet(host, 'odd', 50);
    room.undo(host);
    expect(balance(host)).toBe(START_BALANCE - 100);
    room.double(host);
    expect(balance(host)).toBe(START_BALANCE - 200);
    room.clear(host);
    expect(balance(host)).toBe(START_BALANCE);
    room.placeBet(host, 'dozen:2', 30);
    vi.advanceTimersByTime(BETTING_MS + SPIN_MS + RESULT_MS);
    const before = balance(host);
    room.repeat(host);
    expect(balance(host)).toBe(before - 30);
    expect(room.snapshot().table).toEqual([{ playerId: host, spot: 'dozen:2', amount: 30 }]);
  });

  it('Zuschauer können nicht setzen', () => {
    const viewer = newPlayer('Viewer');
    expect(room.join(viewer, 's-v', true).role).toBe('spectator');
    expect(() => room.placeBet(viewer, 'red', 10)).toThrow(/Zuschauer/);
  });
});

describe('Multiplayer', () => {
  it('maximal 10 Spieler – weitere werden Zuschauer', () => {
    expect(MAX_PLAYERS).toBe(10);
    for (let i = 1; i < MAX_PLAYERS; i++) expect(room.join(newPlayer(`P${i}`), `s${i}`, false).role).toBe('player');
    const fifth = room.join(newPlayer('Fünf'), 's5', false);
    expect(fifth.role).toBe('spectator');
    expect(fifth.notice).toMatch(/voll/);
    expect(room.snapshot().players).toHaveLength(MAX_PLAYERS);
    expect(room.snapshot().spectators).toHaveLength(1);
  });

  it('alle sehen dieselben Einsätze und dasselbe Ergebnis', () => {
    const p2 = newPlayer('Zwei');
    room.join(p2, 's2', false);
    room.placeBet(ids[0], 'red', 10);
    room.placeBet(p2, 'black', 20);
    const snap = room.snapshot();
    expect(snap.table).toHaveLength(2);
    expect(snap.players.find((p) => p.id === p2)!.roundWager).toBe(20);
    vi.advanceTimersByTime(BETTING_MS + SPIN_MS);
    const s = room.snapshot().lastSettlement!;
    expect(s.results).toHaveLength(2);
    expect(new Set(s.results.map((r) => r.playerId))).toEqual(new Set([ids[0], p2]));
  });

  it('Wiederverbinden behält Platz, Einsätze und Guthaben', () => {
    const p2 = newPlayer('Zwei');
    room.join(p2, 's2', false);
    room.placeBet(p2, 'even', 40);
    room.disconnect(p2, 's2');
    expect(room.snapshot().players.find((p) => p.id === p2)!.online).toBe(false);
    expect(room.join(p2, 's2-neu', false).role).toBe('player');
    const view = room.snapshot().players.find((p) => p.id === p2)!;
    expect(view).toMatchObject({ online: true, roundWager: 40, balance: START_BALANCE - 40 });
  });

  it('Rangliste im Raum nach Nettogewinn', () => {
    const p2 = newPlayer('Zwei');
    room.join(p2, 's2', false);
    const n = room.peekSecretForTests()!.number;
    room.placeBet(p2, `straight:${n}`, 10);
    room.placeBet(ids[0], n === 5 ? 'straight:6' : 'straight:5', 10);
    vi.advanceTimersByTime(BETTING_MS + SPIN_MS);
    const lb = room.snapshot().leaderboard;
    expect(lb[0]).toMatchObject({ id: p2, net: 350 });
    expect(lb[1]).toMatchObject({ id: ids[0], net: -10 });
  });

  it('Guthaben-Reset erstattet offene Einsätze und setzt auf 10 000', () => {
    const host = ids[0];
    room.placeBet(host, 'red', 500);
    manager.resetBalance(host);
    expect(balance(host)).toBe(START_BALANCE);
    expect(room.snapshot().table).toHaveLength(0);
    expect(db.stats(host)!.resets).toBe(1);
  });

  it('alles verloren → Reset funktioniert sofort in der Ergebnisphase', () => {
    const host = ids[0];
    const n = room.peekSecretForTests()!.number;
    room.placeBet(host, n === 7 ? 'straight:8' : 'straight:7', 10_000); // garantiert verloren
    expect(balance(host)).toBe(0);
    vi.advanceTimersByTime(BETTING_MS + SPIN_MS);
    expect(room.phase).toBe('result');
    expect(balance(host)).toBe(0);
    manager.resetBalance(host);
    expect(balance(host)).toBe(START_BALANCE);
    // Statistik bleibt erhalten
    expect(db.stats(host)).toMatchObject({ roundsPlayed: 1, totalWagered: 10_000, resets: 1 });
  });

  it('10 Spieler können gleichzeitig setzen und werden alle abgerechnet', () => {
    const all = [ids[0]];
    for (let i = 1; i < 10; i++) {
      const p = newPlayer(`P${i}`);
      room.join(p, `s${i}`, false);
      all.push(p);
    }
    all.forEach((p, i) => room.placeBet(p, i % 2 ? 'red' : 'black', 10 * (i + 1)));
    expect(room.snapshot().table).toHaveLength(10);
    vi.advanceTimersByTime(BETTING_MS + SPIN_MS);
    expect(room.snapshot().lastSettlement!.results).toHaveLength(10);
  });

  it('kein Reset während die Kugel rollt', () => {
    room.placeBet(ids[0], 'red', 500);
    vi.advanceTimersByTime(BETTING_MS);
    expect(() => manager.resetBalance(ids[0])).toThrow(/Kugel rollt/);
  });
});

describe('Zufall', () => {
  it('Generator liefert alle Zahlen 0–36 annähernd gleichverteilt', () => {
    const counts = new Array(37).fill(0);
    for (let i = 0; i < 74_000; i++) counts[drawNumber()]++;
    // Erwartet 2000 pro Zahl; ±15 % ist bei dieser Stichprobe praktisch nie verletzt (> 6σ).
    expect(Math.min(...counts)).toBeGreaterThan(1700);
    expect(Math.max(...counts)).toBeLessThan(2300);
  });

  it('Ergebnisse im Raum werden gespeichert und verteilt gezählt', () => {
    for (let i = 0; i < 10; i++) vi.advanceTimersByTime(BETTING_MS + SPIN_MS + RESULT_MS);
    const snap = room.snapshot();
    expect(snap.totalRounds).toBe(10);
    expect(snap.distribution.reduce((a, b) => a + b, 0)).toBe(10);
    expect(snap.history).toHaveLength(10);
  });
});
