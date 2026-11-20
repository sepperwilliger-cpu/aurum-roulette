/**
 * Deterministische Kugelbahn. Die Kugelposition wird RELATIV zum Rotor berechnet:
 * Am Ende der Animation entspricht der relative Winkel exakt dem Fach der
 * serverseitig gezogenen Zahl – egal wie schnell der Rotor dreht oder wann ein
 * Client der Runde beitritt.
 */
import { pocketIndex } from './roulette';

export const TAU = Math.PI * 2;
export const SEG = TAU / 37;

// Geometrie (Einheiten der 3D-Szene)
export const BALL_R = 0.12;
export const R_TRACK = 4.6;
export const Y_TRACK = 0.7;
export const R_DEFLECT = 4.05;
export const Y_DEFLECT = 0.52;
export const R_NUMBERS = 3.55;
export const Y_NUMBERS = 0.42;
export const R_POCKET = 2.9;
export const Y_POCKET = 0.08 + BALL_R;

export const LOOPS = 6;

const mod = (a: number, m: number) => ((a % m) + m) % m;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Winkel des Fachs im Rotor-Koordinatensystem (x = cos, z = sin). */
export function pocketAngle(n: number): number {
  return pocketIndex(n) * SEG;
}

export interface SpinPlan {
  phi0: number;
  travel: number;
  target: number;
}

/** Plant die relative Bewegung vom aktuellen Winkel bis ins Zielfach (gegen die Rotordrehung). */
export function planSpin(phi0: number, winner: number): SpinPlan {
  const target = pocketAngle(winner);
  return { phi0, target, travel: mod(phi0 - target, TAU) + LOOPS * TAU };
}

export interface BallState {
  phi: number;
  r: number;
  y: number;
}

/** Zustand der Kugel bei Fortschritt p ∈ [0,1] (1 = Kugel liegt im Fach). */
export function ballAt(plan: SpinPlan, pRaw: number): BallState {
  const p = clamp01(pRaw);
  const eased = 1 - Math.pow(1 - p, 2.6);
  const phi = plan.phi0 - plan.travel * eased;

  let r: number;
  let y: number;
  if (p < 0.05) {
    // Kugel wird aus dem Fach auf die Laufbahn geworfen
    const t = smooth(p / 0.05);
    r = lerp(R_POCKET, R_TRACK, t);
    y = lerp(Y_POCKET, Y_TRACK, t) + Math.sin(t * Math.PI) * 0.6;
  } else if (p < 0.58) {
    // Läuft oben an der Bande, leichtes Flattern
    r = R_TRACK - Math.abs(Math.sin(p * 90)) * 0.015;
    y = Y_TRACK;
  } else if (p < 0.7) {
    // Verliert Tempo, rollt die Schräge hinunter zu den Rauten
    const t = smooth((p - 0.58) / 0.12);
    r = lerp(R_TRACK, R_DEFLECT, t);
    y = lerp(Y_TRACK, Y_DEFLECT, t);
  } else if (p < 0.86) {
    // Prallt an einer Raute ab und hüpft über den Zahlenkranz
    const t = (p - 0.7) / 0.16;
    r = lerp(R_DEFLECT, R_POCKET + 0.12, smooth(t));
    y = lerp(Y_DEFLECT, Y_POCKET + 0.05, t) + Math.abs(Math.sin(t * Math.PI * 2)) * 0.32 * (1 - t * 0.5);
  } else {
    // Klackert im Fach aus
    const t = (p - 0.86) / 0.14;
    r = lerp(R_POCKET + 0.12, R_POCKET, smooth(t));
    y = Y_POCKET + Math.abs(Math.sin(t * Math.PI * 3)) * 0.12 * (1 - t);
  }
  return { phi, r, y };
}

/** Normierter Winkelabstand zweier Winkel (0 … π). */
export function angleDiff(a: number, b: number): number {
  const d = mod(a - b, TAU);
  return Math.min(d, TAU - d);
}
