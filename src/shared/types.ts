export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export type TileType = 'floor' | 'wall' | 'hideout' | 'extraction' | 'hazard';

export interface Hunter {
  id: string;
  name: string;
  x: number;
  y: number;
  facing: Direction;
  patrolPath: Point[];
  patrolIndex: number;
  isChasing: boolean;
  stunnedTurns: number;
  alive: boolean;
  telegraphedMove: {
    x: number;
    y: number;
    facing: Direction;
    action: 'patrol' | 'chase' | 'turn' | 'stunned';
  };
}

export interface FoodRation {
  id: string;
  x: number;
  y: number;
  collected: boolean;
}

export interface DecoyHazard {
  x: number;
  y: number;
  type: 'fake_ration' | 'spike_trap';
  placedBy: string;
}

export type CommunityBeaconType = 'ambush_warning' | 'supply_cache' | 'safe_corridor';

export interface CommunityBeacon {
  id: string;
  x: number;
  y: number;
  type: CommunityBeaconType;
  placedBy: string;
  note: string;
  collected?: boolean;
}

export interface FallenOperative {
  id: string;
  x: number;
  y: number;
  username: string;
  cause: 'captured' | 'starved';
  salvaged?: boolean;
}

export interface CommunityDirective {
  dateStr: string;
  totalExtractions: number;
  tier: number; // 0, 1, 2, 3
  activePerks: string[];
}

export type OracleGambitId =
  | 'NO_WEAPONS'
  | 'ALL_RATIONS'
  | 'SPEED_DEMON'
  | 'HUNTER_BANE';

export interface OracleGambit {
  id: OracleGambitId;
  title: string;
  condition: string;
  rewardText: string;
  multiplier: number;
  flatBonus: number;
}

export interface TacticalCards {
  vault: number;    // Jump 2 tiles
  knife: number;    // Ambush blade
  repulsor: number; // Woosh-smacker kinetic blast
  beacon: number;   // Squad tactical beacon (drop 1 per run)
}

export interface ReplayStep {
  turn: number;
  x: number;
  y: number;
  action?: 'move' | 'vault' | 'knife' | 'repulsor' | 'beacon' | 'hideout';
}

export interface GameMapData {
  seed: string;
  dateStr: string;
  width: number;
  height: number;
  tiles: TileType[][]; // [y][x]
  startPos: Point;
  extractionPos: Point;
  rations: FoodRation[];
  initialHunters: Hunter[];
  decoys: DecoyHazard[];
  beacons: CommunityBeacon[];
  fallenOperatives: FallenOperative[];
}

export type GameStatus = 'playing' | 'extracted' | 'captured' | 'starved';

export interface GameStats {
  turnsTaken: number;
  rationsCollected: number;
  huntersVaulted: number;
  huntersEliminated: number;
  huntersRepulsed: number;
  stealthBonusTriggered: number;
  weaponsUsedCount: number;
  staminaRemaining: number;
  finalScore: number;
  flairTag: string;
  oracleFulfilled: boolean;
  beaconsPlaced: number;
  dogtagsSalvaged: number;
  squadSuppliesUsed: number;
}

export interface GameState {
  map: GameMapData;
  playerPos: Point;
  stamina: number;
  score: number;
  rationsCollected: number;
  hideoutTurns: number;
  activeCards: TacticalCards;
  hunters: Hunter[];
  status: GameStatus;
  selectedGambit: OracleGambitId | null;
  history: ReplayStep[];
  stats: GameStats;
  turn: number;
  messageLog: { text: string; type: 'info' | 'warn' | 'success' | 'danger' }[];
  directivePerkActive: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  rations: number;
  turns: number;
  flairTag: string;
  oracleFulfilled: boolean;
  dateStr: string;
  timestamp: number;
  pathLength: number;
}

export interface UserProfile {
  username: string;
  currentStreak: number;
  bestStreak: number;
  totalExtractions: number;
  topScore: number;
  favoriteFlair: string;
  hasPlayedToday: boolean;
  operativesRescued: number;
  beaconsContributed: number;
}

// Devvit Web API Contracts
export interface InitDataResponse {
  type: 'init';
  username: string;
  dateStr: string;
  postId: string;
  profile: UserProfile;
  leaderboard: LeaderboardEntry[];
  todayMap: GameMapData;
  topGhost?: ReplayStep[];
  directive: CommunityDirective;
}

export interface SubmitRunRequest {
  dateStr: string;
  score: number;
  rations: number;
  turns: number;
  status: GameStatus;
  playerPos: Point;
  gambitId: OracleGambitId | null;
  gambitFulfilled: boolean;
  flairTag: string;
  history: ReplayStep[];
  stats: {
    dogtagsSalvaged: number;
    beaconsPlaced: number;
  };
}

export interface SubmitRunResponse {
  success: boolean;
  rank: number;
  newStreak: number;
  flairAssigned?: string;
  leaderboard: LeaderboardEntry[];
  directive: CommunityDirective;
}

export interface PlaceDecoyRequest {
  dateStr: string;
  x: number;
  y: number;
  type: 'fake_ration' | 'spike_trap';
}

export interface PlaceDecoyResponse {
  success: boolean;
  decoy: DecoyHazard;
}

export interface PlaceBeaconRequest {
  dateStr: string;
  x: number;
  y: number;
  type: CommunityBeaconType;
  note: string;
}

export interface PlaceBeaconResponse {
  success: boolean;
  beacon: CommunityBeacon;
}

export interface CommentRecapRequest {
  dateStr: string;
  score: number;
  rations: number;
  turns: number;
  status: GameStatus;
  gambitTitle: string;
  gambitFulfilled: boolean;
  flairTag: string;
  gridVisual: string;
  coopStats: {
    dogtagsSalvaged: number;
    beaconsPlaced: number;
  };
}

export interface CommentRecapResponse {
  success: boolean;
  commentId?: string;
  commentText: string;
}
