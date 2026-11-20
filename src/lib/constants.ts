export const START_BALANCE = 10_000;
export const CHIP_VALUES = [1, 5, 10, 25, 100, 500, 1000, 5000, 10000] as const;
export type ChipValue = (typeof CHIP_VALUES)[number];

export const MAX_PLAYERS = 10;
export const MAX_SPECTATORS = 20;
/** Kein Tischlimit: gesetzt werden darf bis zum eigenen Guthaben.
 *  Begrenzt ist nur die Anzahl Einzelklicks pro Runde (Schutz vor Spam). */
export const MAX_BETS_PER_ROUND = 1000;

export const BETTING_MS = 20_000;
export const SPIN_MS = 9_000;
/** Zeitpunkt (ab Start des Drehens), an dem die Kugel im Fach liegt. */
export const BALL_SETTLE_MS = 7_400;
export const RESULT_MS = 6_000;

export const HISTORY_SIZE = 20;
export const CHAT_MAX_LEN = 200;
export const NAME_MAX_LEN = 16;

export const AVATARS = ['🦊', '🐯', '🦁', '🐼', '🐸', '🐙', '🦄', '🐲', '🦉', '🐺', '🐧', '🦈', '🐵', '🐨', '🦖', '👽'] as const;
export const PLAYER_COLORS = [
  '#f5c542', '#4fd1c5', '#f472b6', '#60a5fa', '#a78bfa',
  '#fb923c', '#34d399', '#f87171', '#e5e7eb', '#a3e635',
] as const;

export const CHIP_STYLE: Record<number, { base: string; accent: string; text: string }> = {
  1: { base: '#d9d9d9', accent: '#7a7a7a', text: '#1f1f1f' },
  5: { base: '#b3262e', accent: '#f2e6c9', text: '#7a1218' },
  10: { base: '#1f3fae', accent: '#f4d34b', text: '#16308a' },
  25: { base: '#1d6b4f', accent: '#f2e6c9', text: '#0f4a35' },
  100: { base: '#1b1b1b', accent: '#e0b44c', text: '#1b1b1b' },
  500: { base: '#0f7f7a', accent: '#f2e6c9', text: '#0a5a56' },
  1000: { base: '#c2185b', accent: '#ffe08a', text: '#8e0f41' },
  5000: { base: '#e8b923', accent: '#7a3b12', text: '#8a5a00' },
  10000: { base: '#e8742a', accent: '#1aa6a0', text: '#a3460c' },
};
