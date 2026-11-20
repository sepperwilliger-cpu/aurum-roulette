/**
 * Geometrie des Roulette-Tableaus in abstrakten Einheiten (u = entlang der Zahlen, v = quer).
 *
 *   u: 0–1 Null · 1–13 zwölf Zahlenspalten · 13–14 Kolonnen (2:1)
 *   v: 0–3 drei Zahlenreihen (oben 3,6,9…) · 3–3.7 Dutzende · 3.7–4.4 einfache Chancen
 *
 * Jedes Wettfeld bekommt ein Rechteck. Innen-Wetten (Cheval, Carré, …) sind kleine
 * "Hotspots" auf Kanten und Ecken zwischen den Zahlen – wie auf einem echten Tisch.
 */
import { colorOf } from './roulette';

export const U = 14;
export const V = 4.4;
const T = 0.34; // Dicke der Kanten-Hotspots

export interface LayoutRect {
  key: string;
  u: number;
  v: number;
  w: number;
  h: number;
  /** 'cell' = sichtbares Feld, 'hot' = unsichtbarer Hotspot auf Kante/Ecke */
  type: 'cell' | 'hot';
  label?: string;
  tone?: 'red' | 'black' | 'green' | 'felt';
  z: number;
}

export const cellOf = (n: number) => ({ c: Math.floor((n - 1) / 3), r: 2 - ((n - 1) % 3) });

const key = (kind: string, nums: number[]) => `${kind}:${[...nums].sort((a, b) => a - b).join('-')}`;

function buildLayout(): LayoutRect[] {
  const out: LayoutRect[] = [];
  // Null über alle drei Reihen
  out.push({ key: 'straight:0', u: 0, v: 0, w: 1, h: 3, type: 'cell', label: '0', tone: 'green', z: 1 });
  for (let n = 1; n <= 36; n++) {
    const { c, r } = cellOf(n);
    out.push({ key: `straight:${n}`, u: 1 + c, v: r, w: 1, h: 1, type: 'cell', label: String(n), tone: colorOf(n) as 'red' | 'black', z: 1 });
  }
  // Kolonnen 2:1 (oben = Kolonne 3)
  for (let col = 1; col <= 3; col++) {
    out.push({ key: `column:${col}`, u: 13, v: 3 - col, w: 1, h: 1, type: 'cell', label: '2:1', tone: 'felt', z: 1 });
  }
  const dozenLabel = ['1st 12', '2nd 12', '3rd 12'];
  for (let d = 1; d <= 3; d++) {
    out.push({ key: `dozen:${d}`, u: 1 + (d - 1) * 4, v: 3, w: 4, h: 0.7, type: 'cell', label: dozenLabel[d - 1], tone: 'felt', z: 1 });
  }
  const outside: [string, string][] = [
    ['low', '1–18'],
    ['even', 'GERADE'],
    ['red', ''],
    ['black', ''],
    ['odd', 'UNGERADE'],
    ['high', '19–36'],
  ];
  outside.forEach(([k, label], i) =>
    out.push({ key: k, u: 1 + i * 2, v: 3.7, w: 2, h: 0.7, type: 'cell', label, tone: 'felt', z: 1 }),
  );

  const hot = (k: string, cu: number, cv: number, w: number, h: number, z: number) =>
    out.push({ key: k, u: cu - w / 2, v: cv - h / 2, w, h, type: 'hot', z });

  for (let n = 1; n <= 36; n++) {
    const { c, r } = cellOf(n);
    // Cheval waagrecht (n | n+3): Kante rechts
    if (n <= 33) hot(key('split', [n, n + 3]), 2 + c, r + 0.5, T, 0.56, 2);
    // Cheval senkrecht (n / n+1): Kante oben
    if (n % 3 !== 0) hot(key('split', [n, n + 1]), 1.5 + c, r, 0.56, T, 2);
    // Carré: Ecke oben rechts
    if (n % 3 !== 0 && n <= 32) hot(key('corner', [n, n + 1, n + 3, n + 4]), 2 + c, r, T, T, 3);
  }
  for (let c = 0; c < 12; c++) {
    const n = 3 * c + 1;
    hot(key('street', [n, n + 1, n + 2]), 1.5 + c, 3, 0.56, T, 2);
    if (c < 11) hot(key('line', [n, n + 1, n + 2, n + 3, n + 4, n + 5]), 2 + c, 3, T, T, 3);
  }
  // Null-Wetten: Cheval mit 1/2/3, Trios, First Four
  for (const k of [1, 2, 3]) hot(key('split', [0, k]), 1, cellOf(k).r + 0.5, T, 0.56, 2);
  hot(key('street', [0, 1, 2]), 1, 2, T, T, 3);
  hot(key('street', [0, 2, 3]), 1, 1, T, T, 3);
  hot(key('corner', [0, 1, 2, 3]), 1, 3, T, T, 3);
  return out;
}

export const TABLE_LAYOUT: readonly LayoutRect[] = buildLayout();

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Wandelt ein Layout-Rechteck in Prozentangaben – waagrecht (Desktop) oder senkrecht (Smartphone). */
export function toScreen(r: { u: number; v: number; w: number; h: number }, vertical: boolean): ScreenRect {
  if (!vertical) {
    return { left: (r.u / U) * 100, top: (r.v / V) * 100, width: (r.w / U) * 100, height: (r.h / V) * 100 };
  }
  // Senkrecht: Null oben, Reihe "1 2 3" von links nach rechts, Aussenwetten links.
  const x = V - (r.v + r.h);
  return { left: (x / V) * 100, top: (r.u / U) * 100, width: (r.h / V) * 100, height: (r.w / U) * 100 };
}
