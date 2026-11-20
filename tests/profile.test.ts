import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Database } from '../server/db';
import { RoomManager } from '../server/manager';
import { MAX_AVATAR_DATAURL, parseAvatarDataUrl, validateAvatarInput } from '../server/avatar';
import { GameError } from '../server/room';

// Kleinstes gültiges PNG (1×1 Pixel)
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG_HEADER = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString('base64');

let db: Database;
let manager: RoomManager;

beforeEach(() => {
  vi.useFakeTimers();
  db = new Database(':memory:');
  manager = new RoomManager(db, { onChange: () => {}, onChat: () => {} });
});
afterEach(() => {
  manager.dispose();
  db.close();
  vi.useRealTimers();
});

describe('Profilbild', () => {
  it('akzeptiert echte PNG/JPEG-Bilder', () => {
    expect(parseAvatarDataUrl(PNG_1PX)?.mime).toBe('image/png');
    expect(parseAvatarDataUrl(JPEG_HEADER)?.mime).toBe('image/jpeg');
    expect(validateAvatarInput(PNG_1PX)).toBe(PNG_1PX);
    expect(validateAvatarInput(undefined)).toBeUndefined();
    expect(validateAvatarInput(null)).toBeNull();
  });

  it('lehnt SVG, falsche Inhalte und zu grosse Bilder ab', () => {
    const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"/>').toString('base64');
    expect(() => validateAvatarInput(svg)).toThrow(GameError);
    // als PNG deklariert, aber in Wahrheit HTML
    const fake = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
    expect(() => validateAvatarInput(fake)).toThrow(/JPG|PNG/);
    expect(() => validateAvatarInput('data:image/png;base64,' + 'A'.repeat(MAX_AVATAR_DATAURL))).toThrow(/zu gross/);
    expect(() => validateAvatarInput(42)).toThrow(GameError);
  });

  it('wird gespeichert, versioniert und kann entfernt werden', () => {
    const { player } = db.createPlayer('Bildtest', '🦊', '#f5c542');
    expect(db.publicProfile(player.id)!.img).toBeNull();
    db.setAvatarImage(player.id, PNG_1PX);
    const v = db.publicProfile(player.id)!.img;
    expect(v).toBeGreaterThan(0);
    expect(db.avatarImage(player.id)).toBe(PNG_1PX);
    db.setAvatarImage(player.id, null);
    expect(db.publicProfile(player.id)!.img).toBeNull();
    expect(db.avatarImage(player.id)).toBeNull();
  });

  it('erscheint im Raum-Snapshot nur als Versionsnummer (kein Bild-Ballast)', () => {
    const { player } = db.createPlayer('Bildtest', '🦊', '#f5c542');
    db.setAvatarImage(player.id, PNG_1PX);
    const room = manager.createRoom(player.id);
    room.join(player.id, 's1', false);
    const snap = JSON.stringify(room.snapshot());
    expect(snap).not.toContain('base64');
    expect(room.snapshot().players[0].img).toBe(db.publicProfile(player.id)!.img);
  });
});

describe('Dauerhafte Raumcodes', () => {
  it('eigener Code wird angelegt und ist danach immer wieder betretbar', () => {
    const { player } = db.createPlayer('Host', '🦊', '#f5c542');
    const room = manager.createRoom(player.id, 'klasse3');
    expect(room.code).toBe('KLASSE3');
    expect(() => manager.createRoom(player.id, 'KLASSE3')).toThrow(/vergeben/);
    expect(() => manager.createRoom(player.id, 'ab')).toThrow(/4–8/);
    // Raum aus dem Speicher werfen (wie nach langer Inaktivität) – Code muss weiter funktionieren
    room.dispose();
    manager.rooms.delete('KLASSE3');
    const again = manager.get('klasse3');
    expect(again?.code).toBe('KLASSE3');
  });

  it('Meine Räume: erstellte und gespielte Räume', () => {
    const a = db.createPlayer('A', '🦊', '#f5c542').player.id;
    const b = db.createPlayer('B', '🦊', '#f5c542').player.id;
    const r1 = manager.createRoom(a, 'AAAA');
    manager.createRoom(b, 'BBBB');
    r1.join(b, 'sb', false); // B spielt in A's Raum
    expect(db.myRooms(a).map((r) => r.code)).toEqual(['AAAA']);
    expect(new Set(db.myRooms(b).map((r) => r.code))).toEqual(new Set(['AAAA', 'BBBB']));
    expect(db.myRooms(a)[0].mine).toBe(true);
  });
});
