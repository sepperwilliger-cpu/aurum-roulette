/**
 * Europäisches Roulette – Spielregeln (geteilt zwischen Server und Client).
 *
 * Jede erlaubte Wette ("Spot") wird beim Laden einmal aufgezählt. Die Validierung
 * auf dem Server ist damit eine einfache Map-Abfrage: was nicht in ALL_SPOTS steht,
 * ist keine gültige Wette.
 */

export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type PocketColor = 'red' | 'black' | 'green';

export function colorOf(n: number): PocketColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export type BetKind =
  | 'straight'
  | 'split'
  | 'street'
  | 'corner'
  | 'line'
  | 'dozen'
  | 'column'
  | 'red'
  | 'black'
  | 'even'
  | 'odd'
  | 'low'
  | 'high';

/** Auszahlungsquote "x zu 1" nach offiziellen europäischen Regeln. */
export const PAYOUT: Record<BetKind, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  line: 5,
  dozen: 2,
  column: 2,
  red: 1,
  black: 1,
  even: 1,
  odd: 1,
  low: 1,
  high: 1,
};

export const BET_LABEL: Record<BetKind, string> = {
  straight: 'Plein',
  split: 'Cheval (Split)',
  street: 'Transversale (Street)',
  corner: 'Carré (Corner)',
  line: 'Sixain (Six Line)',
  dozen: 'Dutzend',
  column: 'Kolonne',
  red: 'Rot',
  black: 'Schwarz',
  even: 'Gerade',
  odd: 'Ungerade',
  low: '1–18',
  high: '19–36',
};

export interface Spot {
  key: string;
  kind: BetKind;
  numbers: number[];
}

function mk(kind: BetKind, numbers: number[], key?: string): Spot {
  const sorted = [...numbers].sort((a, b) => a - b);
  return { kind, numbers: sorted, key: key ?? `${kind}:${sorted.join('-')}` };
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function buildSpots(): Spot[] {
  const spots: Spot[] = [];
  // Plein 0–36
  for (let n = 0; n <= 36; n++) spots.push(mk('straight', [n]));
  // Cheval: waagrecht im Tableau (n, n+3), senkrecht (n, n+1) innerhalb einer Spalte, plus Null
  for (let n = 1; n <= 33; n++) spots.push(mk('split', [n, n + 3]));
  for (let n = 1; n <= 35; n++) if (n % 3 !== 0) spots.push(mk('split', [n, n + 1]));
  for (const n of [1, 2, 3]) spots.push(mk('split', [0, n]));
  // Transversale + Trio mit Null
  for (let n = 1; n <= 34; n += 3) spots.push(mk('street', [n, n + 1, n + 2]));
  spots.push(mk('street', [0, 1, 2]), mk('street', [0, 2, 3]));
  // Carré + "First Four" (0-1-2-3, ebenfalls 8:1)
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) spots.push(mk('corner', [n, n + 1, n + 3, n + 4]));
  spots.push(mk('corner', [0, 1, 2, 3]));
  // Sixain
  for (let n = 1; n <= 31; n += 3) spots.push(mk('line', range(n, n + 5)));
  // Dutzende & Kolonnen
  for (let d = 1; d <= 3; d++) spots.push(mk('dozen', range(12 * (d - 1) + 1, 12 * d), `dozen:${d}`));
  for (let c = 1; c <= 3; c++)
    spots.push(mk('column', range(1, 36).filter((n) => n % 3 === c % 3), `column:${c}`));
  // Einfache Chancen
  const nums = range(1, 36);
  spots.push(mk('red', nums.filter((n) => RED_NUMBERS.has(n)), 'red'));
  spots.push(mk('black', nums.filter((n) => !RED_NUMBERS.has(n)), 'black'));
  spots.push(mk('even', nums.filter((n) => n % 2 === 0), 'even'));
  spots.push(mk('odd', nums.filter((n) => n % 2 === 1), 'odd'));
  spots.push(mk('low', range(1, 18), 'low'));
  spots.push(mk('high', range(19, 36), 'high'));
  return spots;
}

export const ALL_SPOTS: ReadonlyMap<string, Spot> = new Map(buildSpots().map((s) => [s.key, s]));

export function getSpot(key: unknown): Spot | null {
  if (typeof key !== 'string' || key.length > 40) return null;
  return ALL_SPOTS.get(key) ?? null;
}

export function spotWins(spot: Spot, result: number): boolean {
  return spot.numbers.includes(result);
}

/** Gesamte Rückzahlung (Einsatz + Gewinn) für einen Einsatz; 0 wenn verloren. */
export function returnFor(spot: Spot, amount: number, result: number): number {
  return spotWins(spot, result) ? amount * (PAYOUT[spot.kind] + 1) : 0;
}

export interface Bet {
  spot: string;
  amount: number;
}

export interface Settlement {
  wagered: number;
  returned: number;
  net: number;
  winningSpots: string[];
}

export function settle(bets: readonly Bet[], result: number): Settlement {
  let wagered = 0;
  let returned = 0;
  const winningSpots: string[] = [];
  for (const b of bets) {
    const spot = getSpot(b.spot);
    if (!spot) throw new Error(`Ungültiger Spot: ${b.spot}`);
    wagered += b.amount;
    const r = returnFor(spot, b.amount, result);
    if (r > 0) {
      returned += r;
      if (!winningSpots.includes(spot.key)) winningSpots.push(spot.key);
    }
  }
  return { wagered, returned, net: returned - wagered, winningSpots };
}

/** Fasst mehrere Einsätze auf demselben Feld zusammen. */
export function aggregateBets(bets: readonly Bet[]): Bet[] {
  const map = new Map<string, number>();
  for (const b of bets) map.set(b.spot, (map.get(b.spot) ?? 0) + b.amount);
  return [...map.entries()].map(([spot, amount]) => ({ spot, amount }));
}

export function pocketIndex(n: number): number {
  return (WHEEL_ORDER as readonly number[]).indexOf(n);
}

export function describeSpot(key: string): string {
  const spot = getSpot(key);
  if (!spot) return key;
  if (spot.kind === 'dozen') return `${key.endsWith('1') ? '1.' : key.endsWith('2') ? '2.' : '3.'} Dutzend`;
  if (spot.kind === 'column') return `${key.slice(-1)}. Kolonne`;
  if (['red', 'black', 'even', 'odd', 'low', 'high'].includes(spot.kind)) return BET_LABEL[spot.kind];
  return `${BET_LABEL[spot.kind]} ${spot.numbers.join('/')}`;
}
