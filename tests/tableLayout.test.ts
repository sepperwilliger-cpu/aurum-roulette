import { describe, expect, it } from 'vitest';
import { ALL_SPOTS, getSpot } from '@/lib/roulette';
import { TABLE_LAYOUT, cellOf, toScreen } from '@/lib/tableLayout';

describe('Tisch-Layout', () => {
  it('jede legale Wette hat genau eine klickbare Fläche', () => {
    const keys = TABLE_LAYOUT.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keys)).toEqual(new Set(ALL_SPOTS.keys()));
  });

  it('Hotspots liegen tatsächlich zwischen den abgedeckten Zahlen', () => {
    for (const rect of TABLE_LAYOUT.filter((r) => r.type === 'hot')) {
      const spot = getSpot(rect.key)!;
      const cu = rect.u + rect.w / 2;
      const cv = rect.v + rect.h / 2;
      for (const n of spot.numbers) {
        // Mittelpunkt des Hotspots berührt jede abgedeckte Zahlenzelle (Abstand ≤ 1 Feld).
        const cell = n === 0 ? { u0: 0, u1: 1, v0: 0, v1: 3 } : (() => {
          const { c, r } = cellOf(n);
          return { u0: 1 + c, u1: 2 + c, v0: r, v1: r + 1 };
        })();
        const du = Math.max(cell.u0 - cu, 0, cu - cell.u1);
        // Transversale/Sixain liegen per Konvention auf der Unterkante der Spalte(n).
        const edgeBet =
          ((spot.kind === 'street' || spot.kind === 'line') && !spot.numbers.includes(0)) || spot.key === 'corner:0-1-2-3';
        const dv = edgeBet ? (cv === 3 ? 0 : 1) : Math.max(cell.v0 - cv, 0, cv - cell.v1);
        expect(du + dv, `${rect.key} → ${n}`).toBeLessThanOrEqual(0.0001);
      }
    }
  });

  it('senkrechte Darstellung bleibt innerhalb 0–100 %', () => {
    for (const r of TABLE_LAYOUT) {
      for (const vertical of [false, true]) {
        const s = toScreen(r, vertical);
        expect(s.left).toBeGreaterThanOrEqual(-3);
        expect(s.top).toBeGreaterThanOrEqual(-3);
        expect(s.left + s.width).toBeLessThanOrEqual(103);
        expect(s.top + s.height).toBeLessThanOrEqual(103);
      }
    }
  });
});
