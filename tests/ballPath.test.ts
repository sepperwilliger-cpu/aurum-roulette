import { describe, expect, it } from 'vitest';
import { R_POCKET, SEG, TAU, Y_POCKET, angleDiff, ballAt, planSpin, pocketAngle } from '@/lib/ballPath';
import { WHEEL_ORDER } from '@/lib/roulette';

describe('Kugelbahn', () => {
  it('landet für jede Zahl und jeden Startwinkel exakt im richtigen Fach', () => {
    for (const n of WHEEL_ORDER) {
      for (const start of [0, 1.234, -5, 17.5, TAU - 0.001]) {
        const end = ballAt(planSpin(start, n), 1);
        expect(angleDiff(end.phi, pocketAngle(n))).toBeLessThan(1e-9);
        expect(end.r).toBeCloseTo(R_POCKET, 9);
        expect(end.y).toBeCloseTo(Y_POCKET, 9);
      }
    }
  });

  it('das Fach unter der Kugel ist kein Nachbarfach', () => {
    const plan = planSpin(2, 17);
    const phi = ballAt(plan, 1).phi;
    const idx = Math.round((((phi % TAU) + TAU) % TAU) / SEG) % 37;
    expect(WHEEL_ORDER[idx]).toBe(17);
  });

  it('startet am aktuellen Ort (kein Sprung) und dreht gegen den Rotor', () => {
    const plan = planSpin(1, 5);
    expect(ballAt(plan, 0).phi).toBeCloseTo(1, 9);
    expect(ballAt(plan, 0.1).phi).toBeLessThan(ballAt(plan, 0.05).phi);
  });

  it('wird gegen Ende langsamer', () => {
    const plan = planSpin(0, 0);
    const speed = (p: number) => ballAt(plan, p).phi - ballAt(plan, p + 0.01).phi;
    expect(speed(0.1)).toBeGreaterThan(speed(0.5));
    expect(speed(0.5)).toBeGreaterThan(speed(0.95));
  });
});
