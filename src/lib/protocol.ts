/** Datentypen, die zwischen Server und Client über Socket.IO ausgetauscht werden. */

export type Phase = 'waiting' | 'betting' | 'spinning' | 'result';
export type Role = 'player' | 'spectator';

export interface PublicProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  /** Version des hochgeladenen Profilbilds (null = Emoji-Avatar). Bild unter /avatar/<id>?v=<img>. */
  img: number | null;
}

export interface PlayerView extends PublicProfile {
  role: Role;
  online: boolean;
  balance: number;
  roundWager: number;
  lastNet: number | null;
}

export interface TableBet {
  playerId: string;
  spot: string;
  amount: number;
}

export interface HistoryEntry {
  round: number;
  number: number;
  at: number;
}

export interface LeaderboardEntry extends PublicProfile {
  net: number;
  rounds: number;
  balance: number;
}

export interface SettlementView {
  round: number;
  number: number;
  results: { playerId: string; wagered: number; returned: number; net: number; winningSpots: string[] }[];
}

export interface RoomState {
  code: string;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number;
  serverNow: number;
  roundNo: number;
  /** SHA-256(code:round:number:salt) – wird vor der Runde veröffentlicht (Provably Fair). */
  commit: string;
  /** Erst nach Einsatzschluss gesetzt. */
  reveal: { number: number; salt: string } | null;
  players: PlayerView[];
  spectators: PlayerView[];
  table: TableBet[];
  history: HistoryEntry[];
  distribution: number[];
  totalRounds: number;
  leaderboard: LeaderboardEntry[];
  lastSettlement: SettlementView | null;
  maxPlayers: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  avatar: string;
  color: string;
  img?: number | null;
  text: string;
  at: number;
  system?: boolean;
}

export interface OwnProfile extends PublicProfile {
  balance: number;
}

export interface PlayerStats {
  roundsPlayed: number;
  roundsWon: number;
  totalWagered: number;
  totalReturned: number;
  biggestWin: number;
  resets: number;
  createdAt: number;
}

export interface PlayerHistoryRow {
  roomCode: string;
  round: number;
  number: number;
  wagered: number;
  returned: number;
  bets: { spot: string; amount: number }[];
  at: number;
}

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;
