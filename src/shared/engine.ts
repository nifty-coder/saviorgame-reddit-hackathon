import {
  findShortestPath,
  getTile,
  isInsideGrid,
} from './generator';
import type {
  CommunityBeacon,
  CommunityDirective,
  Direction,
  GameMapData,
  GameState,
  Hunter,
  OracleGambit,
  OracleGambitId,
  Point,
  TacticalCards,
} from './types';

export const ORACLE_GAMBITS: Record<OracleGambitId, OracleGambit> = {
  NO_WEAPONS: {
    id: 'NO_WEAPONS',
    title: 'Ghost Operative',
    condition: 'Complete extraction without using Blade or Repulsor',
    rewardText: '+700 pts & 1.5x Multiplier',
    multiplier: 1.5,
    flatBonus: 700,
  },
  ALL_RATIONS: {
    id: 'ALL_RATIONS',
    title: "Glutton's Heist",
    condition: 'Scavenge all 5 Food Rations before extracting',
    rewardText: '+700 pts & 1.5x Multiplier',
    multiplier: 1.5,
    flatBonus: 700,
  },
  SPEED_DEMON: {
    id: 'SPEED_DEMON',
    title: 'Speed Demon',
    condition: 'Reach extraction in 20 turns or fewer',
    rewardText: '+700 pts & 1.5x Multiplier',
    multiplier: 1.5,
    flatBonus: 700,
  },
  HUNTER_BANE: {
    id: 'HUNTER_BANE',
    title: "Hunter's Bane",
    condition: 'Ambush and eliminate at least 1 Hunter with Blade',
    rewardText: '+700 pts & 1.5x Multiplier',
    multiplier: 1.5,
    flatBonus: 700,
  },
};

const DIR_OFFSETS: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export function getHunterSightlineTiles(
  hunter: Hunter,
  map: GameMapData
): Point[] {
  if (!hunter.alive || hunter.stunnedTurns > 0) return [];

  const { x, y, facing } = hunter;
  const { dx, dy } = DIR_OFFSETS[facing];
  const sightTiles: Point[] = [];

  for (let dist = 1; dist <= 3; dist++) {
    const fx = x + dx * dist;
    const fy = y + dy * dist;

    if (!isInsideGrid(fx, fy) || getTile(map.tiles, fx, fy) === 'wall') {
      break;
    }
    sightTiles.push({ x: fx, y: fy });

    if (dist >= 2) {
      const lateralDirs =
        facing === 'up' || facing === 'down'
          ? [
              { lx: -1, ly: 0 },
              { lx: 1, ly: 0 },
            ]
          : [
              { lx: 0, ly: -1 },
              { lx: 0, ly: 1 },
            ];

      for (const { lx, ly } of lateralDirs) {
        const sx = fx + lx;
        const sy = fy + ly;
        if (isInsideGrid(sx, sy) && getTile(map.tiles, sx, sy) !== 'wall') {
          sightTiles.push({ x: sx, y: sy });
        }
      }
    }
  }

  return sightTiles;
}

export function computeTelegraphedMoves(
  hunters: Hunter[],
  playerPos: Point,
  playerHidden: boolean,
  map: GameMapData
): Hunter[] {
  return hunters.map((hunter) => {
    if (!hunter.alive) {
      return hunter;
    }

    if (hunter.stunnedTurns > 0) {
      return {
        ...hunter,
        telegraphedMove: {
          x: hunter.x,
          y: hunter.y,
          facing: hunter.facing,
          action: 'stunned',
        },
      };
    }

    const sightTiles = getHunterSightlineTiles(hunter, map);
    const seesPlayer =
      !playerHidden &&
      sightTiles.some((pt) => pt.x === playerPos.x && pt.y === playerPos.y);

    const isChasing = seesPlayer || hunter.isChasing;

    if (isChasing && !playerHidden) {
      const chasePath = findShortestPath(
        { x: hunter.x, y: hunter.y },
        playerPos,
        map.tiles
      );

      if (chasePath && chasePath.length > 1) {
        const nextStep = chasePath[1];
        if (nextStep) {
          let nextFacing = hunter.facing;
          if (nextStep.x > hunter.x) nextFacing = 'right';
          else if (nextStep.x < hunter.x) nextFacing = 'left';
          else if (nextStep.y > hunter.y) nextFacing = 'down';
          else if (nextStep.y < hunter.y) nextFacing = 'up';

          return {
            ...hunter,
            isChasing: true,
            telegraphedMove: {
              x: nextStep.x,
              y: nextStep.y,
              facing: nextFacing,
              action: 'chase',
            },
          };
        }
      }
    }

    const nextPatrolIdx = (hunter.patrolIndex + 1) % hunter.patrolPath.length;
    const targetPatrol = hunter.patrolPath[nextPatrolIdx] ?? {
      x: hunter.x,
      y: hunter.y,
    };

    let nextFacing = hunter.facing;
    if (targetPatrol.x > hunter.x) nextFacing = 'right';
    else if (targetPatrol.x < hunter.x) nextFacing = 'left';
    else if (targetPatrol.y > hunter.y) nextFacing = 'down';
    else if (targetPatrol.y < hunter.y) nextFacing = 'up';

    return {
      ...hunter,
      isChasing: false,
      telegraphedMove: {
        x: targetPatrol.x,
        y: targetPatrol.y,
        facing: nextFacing,
        action: 'patrol',
      },
    };
  });
}

export function initializeGameState(
  map: GameMapData,
  selectedGambit: OracleGambitId | null = null,
  directive?: CommunityDirective
): GameState {
  const extraVault = directive && directive.tier >= 2 ? 1 : 0;

  const initialCards: TacticalCards = {
    vault: 2 + extraVault,
    knife: 1,
    repulsor: 2,
    beacon: 1,
  };

  const initialHunters = computeTelegraphedMoves(
    map.initialHunters,
    map.startPos,
    false,
    map
  );

  return {
    map,
    playerPos: { ...map.startPos },
    stamina: 25,
    score: 0,
    rationsCollected: 0,
    hideoutTurns: 0,
    activeCards: initialCards,
    hunters: initialHunters,
    status: 'playing',
    selectedGambit,
    history: [{ turn: 0, x: map.startPos.x, y: map.startPos.y, action: 'move' }],
    turn: 0,
    stats: {
      turnsTaken: 0,
      rationsCollected: 0,
      huntersVaulted: 0,
      huntersEliminated: 0,
      huntersRepulsed: 0,
      stealthBonusTriggered: 0,
      weaponsUsedCount: 0,
      staminaRemaining: 25,
      finalScore: 0,
      flairTag: 'Operative',
      oracleFulfilled: false,
      beaconsPlaced: 0,
      dogtagsSalvaged: 0,
      squadSuppliesUsed: 0,
    },
    directivePerkActive: !!(directive && directive.tier >= 1),
    messageLog: [
      {
        text: 'Infiltrated sector. 25 Stamina. Look for fellow Redditors beacons & fallen dogtags.',
        type: 'info',
      },
    ],
  };
}

export function determinePlaystyleFlair(state: GameState): string {
  const { stats, rationsCollected, stamina } = state;
  if (stats.dogtagsSalvaged >= 1 && stats.beaconsPlaced >= 1)
    return 'Guardian Savior';
  if (stats.dogtagsSalvaged >= 1) return 'Squad Medic';
  if (stats.beaconsPlaced >= 1) return 'Tactical Pathfinder';
  if (stats.huntersEliminated >= 2) return 'Apex Hunter';
  if (stats.huntersEliminated >= 1) return 'Ambush Assassin';
  if (stats.stealthBonusTriggered >= 2 && stats.weaponsUsedCount === 0)
    return 'Shadow Tactician';
  if (stats.huntersVaulted >= 2) return 'Acrobatic Phantom';
  if (rationsCollected === 5) return 'Ration Hoarder';
  if (stamina <= 3) return 'Risk Runner';
  if (stats.weaponsUsedCount === 0) return 'Ghost Operative';
  return 'Vanguard Savior';
}

export function checkOracleGambit(state: GameState): boolean {
  if (!state.selectedGambit) return false;
  const { stats, rationsCollected } = state;

  switch (state.selectedGambit) {
    case 'NO_WEAPONS':
      return stats.weaponsUsedCount === 0;
    case 'ALL_RATIONS':
      return rationsCollected === 5;
    case 'SPEED_DEMON':
      return stats.turnsTaken <= 20;
    case 'HUNTER_BANE':
      return stats.huntersEliminated >= 1;
    default:
      return false;
  }
}

export function finalizeScore(state: GameState): GameState {
  let score = state.score;
  score += 1000;
  score += state.stamina * 50;
  // Squad collaboration bonuses
  score += state.stats.dogtagsSalvaged * 400;
  score += state.stats.beaconsPlaced * 200;

  const oracleFulfilled = checkOracleGambit(state);
  if (oracleFulfilled && state.selectedGambit) {
    const gambit = ORACLE_GAMBITS[state.selectedGambit];
    score = Math.round((score + gambit.flatBonus) * gambit.multiplier);
  }

  const flairTag = determinePlaystyleFlair(state);

  return {
    ...state,
    score,
    stats: {
      ...state.stats,
      finalScore: score,
      staminaRemaining: state.stamina,
      flairTag,
      oracleFulfilled,
    },
  };
}

function checkStealthBypass(
  playerPos: Point,
  hunters: Hunter[],
  currentScore: number
): { score: number; triggered: boolean } {
  let bonus = 0;
  let triggered = false;

  for (const h of hunters) {
    if (h.alive) {
      const dist = Math.abs(h.x - playerPos.x) + Math.abs(h.y - playerPos.y);
      if (dist <= 2) {
        bonus += 500;
        triggered = true;
      }
    }
  }

  return { score: currentScore + bonus, triggered };
}

export function advanceTurn(
  state: GameState,
  newPlayerPos: Point,
  actionType: 'move' | 'vault' | 'knife' | 'repulsor' | 'beacon'
): GameState {
  if (state.status !== 'playing') return state;

  let stamina = state.stamina - (actionType === 'beacon' ? 0 : 1);
  let score = state.score;
  let rationsCollected = state.rationsCollected;
  let hideoutTurns = Math.max(0, state.hideoutTurns - 1);
  let activeVaults = state.activeCards.vault;
  const map = { ...state.map };
  const history = [...state.history];
  const messageLog = [...state.messageLog];
  const stats = {
    ...state.stats,
    turnsTaken: state.stats.turnsTaken + (actionType === 'beacon' ? 0 : 1),
  };

  const targetTile = getTile(map.tiles, newPlayerPos.x, newPlayerPos.y);

  if (targetTile === 'hideout') {
    hideoutTurns = 2;
    messageLog.unshift({
      text: 'Entered Stealth Alcove: Inaudible & cloaked for 2 turns.',
      type: 'info',
    });
  }

  if (targetTile === 'hazard' && actionType !== 'vault') {
    stamina -= 3;
    messageLog.unshift({
      text: 'Triggered Spikes! -3 Stamina penalty.',
      type: 'danger',
    });
  }

  // 1. Check Food Rations
  map.rations = map.rations.map((r) => {
    if (!r.collected && r.x === newPlayerPos.x && r.y === newPlayerPos.y) {
      stamina = Math.min(30, stamina + 4);
      score += 300;
      rationsCollected++;
      stats.rationsCollected++;
      messageLog.unshift({
        text: `+300 pts! Scavenged Food Ration (+4 Stamina). [${rationsCollected}/5]`,
        type: 'success',
      });
      return { ...r, collected: true };
    }
    return r;
  });

  // 2. Check Community Tactical Beacons (Collaboration with fellow players!)
  map.beacons = map.beacons.map((b) => {
    if (!b.collected) {
      const dist = Math.abs(b.x - newPlayerPos.x) + Math.abs(b.y - newPlayerPos.y);
      if (dist === 0) {
        if (b.type === 'supply_cache') {
          stamina = Math.min(30, stamina + 2);
          score += 150;
          stats.squadSuppliesUsed++;
          messageLog.unshift({
            text: `📦 SQUAD AID: Recovered cache left by u/${b.placedBy} (+2 Stamina, +150 pts)!`,
            type: 'success',
          });
          return { ...b, collected: true };
        } else if (b.type === 'ambush_warning') {
          score += 100;
          messageLog.unshift({
            text: `⚠️ SQUAD INTEL: u/${b.placedBy} warns: "${b.note}" (+100 pts scout bonus)!`,
            type: 'warn',
          });
          return { ...b, collected: true };
        }
      } else if (dist === 1 && b.type === 'ambush_warning') {
        messageLog.unshift({
          text: `⚠️ AMBUSH ALERT: Warning beacon from u/${b.placedBy} ahead! Hunter patrol nearby.`,
          type: 'warn',
        });
      }
    }
    return b;
  });

  // 3. Check Fallen Operatives (Rescue Dogtags)
  map.fallenOperatives = map.fallenOperatives.map((f) => {
    if (!f.salvaged && f.x === newPlayerPos.x && f.y === newPlayerPos.y) {
      stamina = Math.min(30, stamina + 1);
      score += 400;
      activeVaults++;
      stats.dogtagsSalvaged++;
      messageLog.unshift({
        text: `🎖️ SQUAD RESCUE: Salvaged dogtag of u/${f.username} (+400 pts, +1 Stamina, +1 Vault charge)!`,
        type: 'success',
      });
      return { ...f, salvaged: true };
    }
    return f;
  });

  // 4. Check Community Decoys
  for (const decoy of map.decoys) {
    if (decoy.x === newPlayerPos.x && decoy.y === newPlayerPos.y) {
      if (decoy.type === 'fake_ration') {
        messageLog.unshift({
          text: `Decoy! Rival Redditor (${decoy.placedBy}) planted a fake ration.`,
          type: 'warn',
        });
      } else if (decoy.type === 'spike_trap' && actionType !== 'vault') {
        stamina -= 3;
        messageLog.unshift({
          text: `Decoy Trap! Tripped a wire placed by ${decoy.placedBy} (-3 Stamina).`,
          type: 'danger',
        });
      }
    }
  }

  if (hideoutTurns > 0) {
    const bypass = checkStealthBypass(newPlayerPos, state.hunters, score);
    if (bypass.triggered) {
      score = bypass.score;
      stats.stealthBonusTriggered++;
      messageLog.unshift({
        text: '+500 pts! Shadow Bypass bonus as Hunter patrolled past.',
        type: 'success',
      });
    }
  }

  const steppedOnHunter = state.hunters.some(
    (h) => h.alive && h.x === newPlayerPos.x && h.y === newPlayerPos.y
  );

  if (steppedOnHunter && actionType !== 'vault') {
    return {
      ...state,
      playerPos: newPlayerPos,
      stamina: Math.max(0, stamina),
      status: 'captured',
      messageLog: [
        { text: 'Captured! Stepped directly into Hunter ambush.', type: 'danger' },
        ...messageLog,
      ],
    };
  }

  const nextHunters: Hunter[] = state.hunters.map((h) => {
    if (!h.alive) return h;

    if (h.stunnedTurns > 0) {
      return {
        ...h,
        stunnedTurns: h.stunnedTurns - 1,
      };
    }

    const { x: tx, y: ty, facing: tf } = h.telegraphedMove;
    const nextPatrolIdx =
      h.telegraphedMove.action === 'patrol'
        ? (h.patrolIndex + 1) % h.patrolPath.length
        : h.patrolIndex;

    return {
      ...h,
      x: tx,
      y: ty,
      facing: tf,
      patrolIndex: nextPatrolIdx,
    };
  });

  if (hideoutTurns <= 0) {
    const hunterIntercepted = nextHunters.some(
      (h) => h.alive && h.x === newPlayerPos.x && h.y === newPlayerPos.y
    );
    if (hunterIntercepted) {
      return {
        ...state,
        playerPos: newPlayerPos,
        stamina: Math.max(0, stamina),
        status: 'captured',
        messageLog: [
          { text: 'Intercepted! Hunter cornered you.', type: 'danger' },
          ...messageLog,
        ],
      };
    }
  }

  if (
    newPlayerPos.x === map.extractionPos.x &&
    newPlayerPos.y === map.extractionPos.y
  ) {
    if (rationsCollected >= 1) {
      const extractedState: GameState = {
        ...state,
        map,
        playerPos: newPlayerPos,
        stamina,
        score,
        rationsCollected,
        hideoutTurns,
        hunters: nextHunters,
        activeCards: { ...state.activeCards, vault: activeVaults },
        status: 'extracted',
        stats,
        history: [
          ...history,
          { turn: state.turn + 1, x: newPlayerPos.x, y: newPlayerPos.y, action: actionType },
        ],
        messageLog: [
          { text: 'Mission Accomplished! Sector extracted.', type: 'success' },
          ...messageLog,
        ],
      };
      return finalizeScore(extractedState);
    } else {
      messageLog.unshift({
        text: 'Extraction Gate Locked! Requires at least 1 Food Ration to extract.',
        type: 'warn',
      });
    }
  }

  if (stamina <= 0) {
    return {
      ...state,
      map,
      playerPos: newPlayerPos,
      stamina: 0,
      score,
      status: 'starved',
      messageLog: [
        { text: 'Stamina Depleted! Starved before reaching extraction.', type: 'danger' },
        ...messageLog,
      ],
    };
  }

  const telegraphedHunters = computeTelegraphedMoves(
    nextHunters,
    newPlayerPos,
    hideoutTurns > 0,
    map
  );

  return {
    ...state,
    map,
    playerPos: newPlayerPos,
    stamina,
    score,
    rationsCollected,
    hideoutTurns,
    hunters: telegraphedHunters,
    activeCards: { ...state.activeCards, vault: activeVaults },
    status: 'playing',
    turn: state.turn + 1,
    stats,
    history: [
      ...history,
      { turn: state.turn + 1, x: newPlayerPos.x, y: newPlayerPos.y, action: actionType },
    ],
    messageLog,
  };
}

export function movePlayer(state: GameState, dir: Direction): GameState {
  if (state.status !== 'playing') return state;

  const { dx, dy } = DIR_OFFSETS[dir];
  const nx = state.playerPos.x + dx;
  const ny = state.playerPos.y + dy;

  if (!isInsideGrid(nx, ny) || getTile(state.map.tiles, nx, ny) === 'wall') {
    return state;
  }

  return advanceTurn(state, { x: nx, y: ny }, 'move');
}

export function executeVault(state: GameState, dir: Direction): GameState {
  if (state.status !== 'playing' || state.activeCards.vault <= 0) return state;

  const { dx, dy } = DIR_OFFSETS[dir];
  const midX = state.playerPos.x + dx;
  const midY = state.playerPos.y + dy;
  const targetX = state.playerPos.x + dx * 2;
  const targetY = state.playerPos.y + dy * 2;

  if (
    !isInsideGrid(targetX, targetY) ||
    getTile(state.map.tiles, targetX, targetY) === 'wall'
  ) {
    return state;
  }

  let vaultedHunter = false;
  for (const h of state.hunters) {
    if (h.alive && h.x === midX && h.y === midY) {
      vaultedHunter = true;
      break;
    }
  }

  let nextScore = state.score;
  const stats = { ...state.stats };

  if (vaultedHunter) {
    nextScore += 200;
    stats.huntersVaulted++;
  }

  const updatedState: GameState = {
    ...state,
    score: nextScore,
    stats,
    activeCards: {
      ...state.activeCards,
      vault: state.activeCards.vault - 1,
    },
    messageLog: vaultedHunter
      ? [
          { text: '+200 pts! Apex Vault leaped clean over a Hunter.', type: 'success' },
          ...state.messageLog,
        ]
      : [
          { text: 'Vaulted 2 tiles forward.', type: 'info' },
          ...state.messageLog,
        ],
  };

  return advanceTurn(updatedState, { x: targetX, y: targetY }, 'vault');
}

export function executeKnife(state: GameState, hunterId: string): GameState {
  if (state.status !== 'playing' || state.activeCards.knife <= 0) return state;

  const targetHunter = state.hunters.find((h) => h.id === hunterId && h.alive);
  if (!targetHunter) return state;

  const dist =
    Math.abs(targetHunter.x - state.playerPos.x) +
    Math.abs(targetHunter.y - state.playerPos.y);
  if (dist !== 1) return state;

  const hunterFacing = targetHunter.facing;
  const isBehind =
    (hunterFacing === 'up' && state.playerPos.y > targetHunter.y) ||
    (hunterFacing === 'down' && state.playerPos.y < targetHunter.y) ||
    (hunterFacing === 'left' && state.playerPos.x > targetHunter.x) ||
    (hunterFacing === 'right' && state.playerPos.x < targetHunter.x);

  const canAmbush = isBehind || state.hideoutTurns > 0;

  if (!canAmbush) {
    return {
      ...state,
      messageLog: [
        {
          text: 'Ambush Blade Failed: Hunter saw your strike! Attack from behind or stealth alcove.',
          type: 'danger',
        },
        ...state.messageLog,
      ],
    };
  }

  const updatedHunters = state.hunters.map((h) =>
    h.id === hunterId ? { ...h, alive: false, stunnedTurns: 0 } : h
  );

  const updatedStats = {
    ...state.stats,
    huntersEliminated: state.stats.huntersEliminated + 1,
    weaponsUsedCount: state.stats.weaponsUsedCount + 1,
  };

  const nextState: GameState = {
    ...state,
    score: state.score + 1200,
    hunters: updatedHunters,
    stats: updatedStats,
    activeCards: {
      ...state.activeCards,
      knife: state.activeCards.knife - 1,
    },
    messageLog: [
      {
        text: `+1,200 pts! Ambushed ${targetHunter.name} from shadows.`,
        type: 'success',
      },
      ...state.messageLog,
    ],
  };

  return nextState;
}

export function executeRepulsor(state: GameState, dir: Direction): GameState {
  if (state.status !== 'playing' || state.activeCards.repulsor <= 0) return state;

  const { dx, dy } = DIR_OFFSETS[dir];

  let targetHunter: Hunter | null = null;
  let targetDist = 99;

  for (const h of state.hunters) {
    if (!h.alive) continue;
    for (let d = 1; d <= 3; d++) {
      const rx = state.playerPos.x + dx * d;
      const ry = state.playerPos.y + dy * d;
      if (h.x === rx && h.y === ry && d < targetDist) {
        targetHunter = h;
        targetDist = d;
      }
    }
  }

  if (!targetHunter) {
    return {
      ...state,
      messageLog: [
        { text: 'Repulsor Blast fired, but no Hunter was in range.', type: 'warn' },
        ...state.messageLog,
      ],
    };
  }

  let finalX = targetHunter.x;
  let finalY = targetHunter.y;

  for (let step = 1; step <= 3; step++) {
    const kx = finalX + dx;
    const ky = finalY + dy;
    if (isInsideGrid(kx, ky) && getTile(state.map.tiles, kx, ky) !== 'wall') {
      finalX = kx;
      finalY = ky;
    } else {
      break;
    }
  }

  const updatedHunters = state.hunters.map((h) => {
    if (h.id === targetHunter!.id) {
      return {
        ...h,
        x: finalX,
        y: finalY,
        stunnedTurns: 2,
        isChasing: false,
        telegraphedMove: {
          x: finalX,
          y: finalY,
          facing: h.facing,
          action: 'stunned' as const,
        },
      };
    }
    return h;
  });

  const updatedStats = {
    ...state.stats,
    huntersRepulsed: state.stats.huntersRepulsed + 1,
    weaponsUsedCount: state.stats.weaponsUsedCount + 1,
  };

  return {
    ...state,
    score: state.score + 250,
    hunters: updatedHunters,
    stats: updatedStats,
    activeCards: {
      ...state.activeCards,
      repulsor: state.activeCards.repulsor - 1,
    },
    messageLog: [
      {
        text: `+250 pts! Kinetic Repulsor blasted ${targetHunter.name} back 3 tiles and stunned for 2 turns.`,
        type: 'success',
      },
      ...state.messageLog,
    ],
  };
}

// 5. Collaborative Action: Drop Tactical Squad Beacon for fellow players
export function executePlaceBeacon(
  state: GameState,
  type: 'ambush_warning' | 'supply_cache',
  username: string
): GameState {
  if (state.status !== 'playing' || state.activeCards.beacon <= 0) return state;

  const newBeacon: CommunityBeacon = {
    id: `beacon-${Date.now()}`,
    x: state.playerPos.x,
    y: state.playerPos.y,
    type,
    placedBy: username,
    note: type === 'ambush_warning' ? 'Hunter patrol route spotted!' : 'Emergency squad rations',
    collected: false,
  };

  const updatedStats = {
    ...state.stats,
    beaconsPlaced: state.stats.beaconsPlaced + 1,
  };

  return {
    ...state,
    score: state.score + 200,
    activeCards: {
      ...state.activeCards,
      beacon: state.activeCards.beacon - 1,
    },
    map: {
      ...state.map,
      beacons: [...state.map.beacons, newBeacon],
    },
    stats: updatedStats,
    messageLog: [
      {
        text: `📡 +200 pts! Deployed ${
          type === 'ambush_warning' ? 'Ambush Alert' : 'Supply Cache'
        } for fellow operatives.`,
        type: 'success',
      },
      ...state.messageLog,
    ],
  };
}
