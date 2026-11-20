import { describe, expect, it } from 'vitest';
import {
  ALL_SPOTS,
  PAYOUT,
  WHEEL_ORDER,
  colorOf,
  getSpot,
  returnFor,
  settle,
  type BetKind,
} from '@/lib/roulette';

const count = (kind: BetKind) => [...ALL_SPOTS.values()].filter((s) => s.kind === kind).length;

describe('Rad & Farben', () => {
  it('enthält jede Zahl 0–36 genau einmal', () => {
    expect(WHEEL_ORDER).toHaveLength(37);
    expect(new Set(WHEEL_ORDER).size).toBe(37);
    expect([...WHEEL_ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i));
  });

  it('hat 18 rote, 18 schwarze und eine grüne Zahl', () => {
    const colors = WHEEL_ORDER.map(colorOf);
    expect(colors.filter((c) => c === 'red')).toHaveLength(18);
    expect(colors.filter((c) => c === 'black')).toHaveLength(18);
    expect(colors.filter((c) => c === 'green')).toHaveLength(1);
  });

  it('wechselt auf dem Rad zwischen Rot und Schwarz ab', () => {
    for (let i = 1; i < WHEEL_ORDER.length - 1; i++) {
      expect(colorOf(WHEEL_ORDER[i])).not.toBe(colorOf(WHEEL_ORDER[i + 1]));
    }
  });
});

describe('Wettfelder', () => {
  it('zählt alle legalen Wetten korrekt auf', () => {
    expect(count('straight')).toBe(37);
    expect(count('split')).toBe(60);
    expect(count('street')).toBe(14); // 12 + 2 Trios mit 0
    expect(count('corner')).toBe(23); // 22 + First Four
    expect(count('line')).toBe(11);
    expect(count('dozen')).toBe(3);
    expect(count('column')).toBe(3);
    expect(ALL_SPOTS.size).toBe(157);
  });

  it('lehnt ungültige Wetten ab', () => {
    expect(getSpot('split:1-5')).toBeNull(); // nicht benachbart
    expect(getSpot('split:3-4')).toBeNull(); // über Spaltenkante
    expect(getSpot('corner:3-4-6-7')).toBeNull();
    expect(getSpot('straight:37')).toBeNull();
    expect(getSpot('street:2-3-4')).toBeNull();
    expect(getSpot(42)).toBeNull();
    expect(getSpot('x'.repeat(100))).toBeNull();
  });

  it('akzeptiert gültige Wetten', () => {
    expect(getSpot('split:1-4')?.numbers).toEqual([1, 4]);
    expect(getSpot('split:2-3')?.numbers).toEqual([2, 3]);
    expect(getSpot('split:0-2')?.numbers).toEqual([0, 2]);
    expect(getSpot('corner:0-1-2-3')?.kind).toBe('corner');
    expect(getSpot('line:31-32-33-34-35-36')?.numbers).toHaveLength(6);
    expect(getSpot('column:1')?.numbers).toEqual([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
    expect(getSpot('dozen:3')?.numbers[0]).toBe(25);
  });
});

describe('Chips', () => {
  it('bietet 1 bis 10 000 an, jeder Wert hat ein eigenes Design', async () => {
    const { CHIP_VALUES, CHIP_STYLE } = await import('@/lib/constants');
    expect([...CHIP_VALUES]).toEqual([1, 5, 10, 25, 100, 500, 1000, 5000, 10000]);
    const bases = CHIP_VALUES.map((v) => CHIP_STYLE[v]?.base);
    expect(bases.every(Boolean)).toBe(true);
    expect(new Set(bases).size).toBe(CHIP_VALUES.length);
  });
});

describe('Auszahlungen', () => {
  it('entsprechen den offiziellen Quoten', () => {
    expect(PAYOUT).toMatchObject({
      straight: 35, split: 17, street: 11, corner: 8, line: 5,
      dozen: 2, column: 2, red: 1, black: 1, even: 1, odd: 1, low: 1, high: 1,
    });
  });

  it('jede Quote passt zur Anzahl abgedeckter Zahlen (36/n − 1)', () => {
    for (const spot of ALL_SPOTS.values()) {
      expect(PAYOUT[spot.kind]).toBe(36 / spot.numbers.length - 1);
    }
  });

  it('Hausvorteil ist für jede Wette exakt 1/37 (2.7 %)', () => {
    for (const spot of ALL_SPOTS.values()) {
      let total = 0;
      for (let n = 0; n <= 36; n++) total += returnFor(spot, 37, n);
      expect(total).toBe(36 * 37); // Erwartungswert 36/37 des Einsatzes
    }
  });

  it('Plein zahlt 35:1 plus Einsatz zurück', () => {
    const s = settle([{ spot: 'straight:17', amount: 10 }], 17);
    expect(s).toMatchObject({ wagered: 10, returned: 360, net: 350 });
    expect(settle([{ spot: 'straight:17', amount: 10 }], 18).net).toBe(-10);
  });

  it('Null lässt einfache Chancen, Dutzende und Kolonnen verlieren', () => {
    const bets = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen:1', 'column:1'].map((spot) => ({
      spot,
      amount: 100,
    }));
    const s = settle(bets, 0);
    expect(s.returned).toBe(0);
    expect(s.net).toBe(-800);
  });

  it('Null gewinnt Plein, Cheval, Trio und First Four', () => {
    expect(settle([{ spot: 'straight:0', amount: 1 }], 0).returned).toBe(36);
    expect(settle([{ spot: 'split:0-2', amount: 1 }], 0).returned).toBe(18);
    expect(settle([{ spot: 'street:0-1-2', amount: 1 }], 0).returned).toBe(12);
    expect(settle([{ spot: 'corner:0-1-2-3', amount: 1 }], 0).returned).toBe(9);
  });

  it('berechnet gemischte Einsätze korrekt', () => {
    const s = settle(
      [
        { spot: 'red', amount: 100 }, // 19 ist rot → 200
        { spot: 'split:16-19', amount: 10 }, // → 180
        { spot: 'corner:19-20-22-23', amount: 25 }, // → 225
        { spot: 'line:19-20-21-22-23-24', amount: 5 }, // → 30
        { spot: 'dozen:1', amount: 50 }, // verliert
        { spot: 'odd', amount: 20 }, // → 40
        { spot: 'column:1', amount: 10 }, // 19 ist Kolonne 1 → 30
      ],
      19,
    );
    expect(s.wagered).toBe(220);
    expect(s.returned).toBe(200 + 180 + 225 + 30 + 40 + 30);
    expect(s.winningSpots).toContain('split:16-19');
    expect(s.winningSpots).not.toContain('dozen:1');
  });

  it('wirft bei unbekanntem Feld', () => {
    expect(() => settle([{ spot: 'nope', amount: 1 }], 1)).toThrow();
  });
});
