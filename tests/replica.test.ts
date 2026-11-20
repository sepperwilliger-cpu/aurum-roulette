import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Database } from '../server/db';
import { connectReplica } from '../server/replica';

const dir = mkdtempSync(path.join(tmpdir(), 'aurum-replica-'));
const url = pathToFileURL(path.join(dir, 'turso.db')).href; // file:///… – gleiche libSQL-Engine wie Turso
const quiet = () => {};

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows hält Dateien evtl. noch kurz offen */
  }
});

async function boot() {
  const db = new Database(':memory:');
  const replica = await connectReplica(url, undefined, db, quiet);
  db.setWriteListener((sql, args) => replica.push(sql, args));
  return { db, replica };
}

describe('Turso-Replikation (Daten überleben einen Server-Neustart)', () => {
  let playerId = '';

  it('schreibt Spieler, Raum, Runde, Guthaben und Profilbild in die Online-Datenbank', async () => {
    const { db, replica } = await boot();
    const { player } = db.createPlayer('Online', '🦊', '#f5c542');
    playerId = player.id;
    db.setAvatarImage(player.id, 'data:image/png;base64,iVBORw0KGgo=');
    db.createRoom('KLASSE3', player.id);
    db.touchMember('KLASSE3', player.id);
    db.adjustBalance(player.id, -100);
    db.recordRound('KLASSE3', { roundNo: 1, number: 17, salt: 'abc', commit: 'def' }, [
      { playerId: player.id, wagered: 100, returned: 3600, bets: [{ spot: 'straight:17', amount: 100 }] },
    ]);
    expect(replica.pending).toBeGreaterThan(0);
    await replica.close();
    db.close();
  });

  it('nach dem Neustart ist alles wieder da', async () => {
    const { db, replica } = await boot();
    const p = db.getPlayer(playerId)!;
    expect(p.name).toBe('Online');
    expect(p.balance).toBe(10_000 - 100 + 3600);
    expect(p.rounds_played).toBe(1);
    expect(p.biggest_win).toBe(3500);
    expect(db.avatarImage(playerId)).toContain('data:image/png');
    expect(db.getRoom('KLASSE3')).not.toBeNull();
    expect(db.recentRounds('KLASSE3', 10)).toEqual([expect.objectContaining({ round: 1, number: 17 })]);
    expect(db.history(playerId)[0]).toMatchObject({ number: 17, wagered: 100, returned: 3600 });
    expect(db.leaderboard('KLASSE3')[0]).toMatchObject({ id: playerId, net: 3500 });
    // Spieler-Token funktioniert weiter (gleicher Hash)
    expect(db.myRooms(playerId).map((r) => r.code)).toEqual(['KLASSE3']);

    // weitere Änderung nach dem Neustart
    db.resetBalance(playerId, 10_000);
    await replica.close();
    db.close();

    const again = await boot();
    expect(again.db.getPlayer(playerId)!.balance).toBe(10_000);
    expect(again.db.getPlayer(playerId)!.resets).toBe(1);
    await again.replica.close();
    again.db.close();
  });
});
