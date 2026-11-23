import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findShortestPath,
  generateDailyMap,
  getTodayDateString,
} from './generator';
import {
  advanceTurn,
  executeKnife,
  executePlaceBeacon,
  executeRepulsor,
  executeVault,
  finalizeScore,
  getHunterSightlineTiles,
  initializeGameState,
  movePlayer,
} from './engine';

void describe('SAVIOR Deterministic Generator & Solvability', () => {
  void it('generates identical layouts for the same daily seed', () => {
    const seed = '2026-11-22';
    const map1 = generateDailyMap(seed);
    const map2 = generateDailyMap(seed);

    assert.equal(map1.seed, map2.seed);
    assert.deepEqual(map1.startPos, map2.startPos);
    assert.deepEqual(map1.extractionPos, map2.extractionPos);
    assert.equal(map1.rations.length, 5);
    assert.deepEqual(map1.rations, map2.rations);
    assert.deepEqual(map1.tiles, map2.tiles);
  });

  void it('guarantees solvability via BFS pathfinding from Start to Extraction', () => {
    const dates = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-12-08'];
    for (const d of dates) {
      const map = generateDailyMap(d);
      const path = findShortestPath(
        map.startPos,
        map.extractionPos,
        map.tiles,
        map.width,
        map.height
      );

      assert.ok(path !== null, `Map for date ${d} must be solvable`);
      if (path) {
        assert.ok(path.length >= 2, 'Path must connect start and end');
        assert.ok(
          path.length <= 25,
          `Path length ${path.length} must be within stamina budget`
        );
      }
    }
  });

  void it('places exactly 5 reachable food rations', () => {
    const map = generateDailyMap('2026-11-22');
    assert.equal(map.rations.length, 5);

    for (const r of map.rations) {
      const pathToRation = findShortestPath(
        map.startPos,
        { x: r.x, y: r.y },
        map.tiles
      );
      assert.ok(pathToRation !== null, `Ration at (${r.x}, ${r.y}) must be reachable`);
    }
  });

  void it('initializes 3 hunters with valid telegraphed moves', () => {
    const map = generateDailyMap('2026-11-22');
    assert.equal(map.initialHunters.length, 3);

    for (const h of map.initialHunters) {
      assert.ok(h.alive);
      assert.ok(h.telegraphedMove !== undefined);
      assert.ok(['patrol', 'chase', 'turn', 'stunned'].includes(h.telegraphedMove.action));
      assert.ok(h.patrolPath.length >= 2);
    }
  });
});

void describe('SAVIOR Core Mechanics & Tactical Abilities', () => {
  void it('starts player with 25 stamina and consumes 1 stamina per move', () => {
    const map = generateDailyMap(getTodayDateString());
    const state = initializeGameState(map, 'NO_WEAPONS');

    assert.equal(state.stamina, 25);
    assert.equal(state.status, 'playing');

    const stateAfterMove = movePlayer(state, 'up');
    if (stateAfterMove !== state) {
      assert.equal(stateAfterMove.stamina, 24);
      assert.equal(stateAfterMove.turn, 1);
    }
  });

  void it('Hunter sightline cone calculates up to 3 tiles forward', () => {
    const map = generateDailyMap('2026-11-22');
    const hunter = { ...map.initialHunters[0]! };
    hunter.x = 4;
    hunter.y = 4;
    hunter.facing = 'up';

    const tiles = getHunterSightlineTiles(hunter, map);
    assert.ok(Array.isArray(tiles));
    const hasForwardTile = tiles.some((pt) => pt.x === 4 && pt.y === 3);
    assert.ok(hasForwardTile, 'Cone should project forward');
  });

  void it('Vault leaps 2 tiles in a straight line and consumes 1 charge', () => {
    const map = generateDailyMap('2026-11-22');
    map.tiles[7]![0] = 'floor';
    map.tiles[6]![0] = 'floor';

    const state = initializeGameState(map, null);
    state.playerPos = { x: 0, y: 8 };
    state.activeCards.vault = 2;

    const nextState = executeVault(state, 'up');
    assert.equal(nextState.playerPos.y, 6);
    assert.equal(nextState.activeCards.vault, 1);
  });

  void it('Ambush Blade melee takedown eliminates hunter from behind', () => {
    const map = generateDailyMap('2026-11-22');
    const state = initializeGameState(map, 'HUNTER_BANE');

    state.playerPos = { x: 4, y: 5 };
    state.hunters = [
      {
        id: 'test-hunter',
        name: 'Sentry',
        x: 4,
        y: 4,
        facing: 'up',
        patrolPath: [{ x: 4, y: 4 }],
        patrolIndex: 0,
        isChasing: false,
        stunnedTurns: 0,
        alive: true,
        telegraphedMove: { x: 4, y: 4, facing: 'up', action: 'patrol' },
      },
    ];
    state.activeCards.knife = 1;

    const nextState = executeKnife(state, 'test-hunter');
    assert.equal(nextState.hunters[0]!.alive, false);
    assert.equal(nextState.activeCards.knife, 0);
    assert.equal(nextState.stats.huntersEliminated, 1);
    assert.ok(nextState.score >= 1200);
  });

  void it('Woosh-Smacker repulsor blasts hunter 3 tiles away and stuns for 2 turns', () => {
    const map = generateDailyMap('2026-11-22');
    for (let x = 1; x <= 6; x++) {
      map.tiles[4]![x] = 'floor';
    }

    const state = initializeGameState(map, null);
    state.playerPos = { x: 2, y: 4 };
    state.hunters = [
      {
        id: 'repulse-target',
        name: 'Mech',
        x: 3,
        y: 4,
        facing: 'left',
        patrolPath: [{ x: 3, y: 4 }],
        patrolIndex: 0,
        isChasing: true,
        stunnedTurns: 0,
        alive: true,
        telegraphedMove: { x: 2, y: 4, facing: 'left', action: 'chase' },
      },
    ];
    state.activeCards.repulsor = 2;

    const nextState = executeRepulsor(state, 'right');
    const repulsedHunter = nextState.hunters[0]!;
    assert.equal(repulsedHunter.stunnedTurns, 2);
    assert.equal(repulsedHunter.isChasing, false);
    assert.equal(nextState.activeCards.repulsor, 1);
    assert.ok(repulsedHunter.x > 3, 'Hunter should be knocked backward');
  });

  void it('The Oracle Gambit rewards 1.5x multiplier when fulfilled', () => {
    const map = generateDailyMap('2026-11-22');
    const state = initializeGameState(map, 'ALL_RATIONS');
    state.rationsCollected = 5;
    state.stamina = 10;
    state.score = 1500;

    const finalState = finalizeScore(state);
    assert.equal(finalState.stats.oracleFulfilled, true);
    assert.equal(finalState.score, 5550);
  });
});

void describe('SAVIOR Squad Collaboration & Community Directives', () => {
  void it('allows players to deploy a tactical beacon for squad assistance', () => {
    const map = generateDailyMap('2026-11-22');
    const state = initializeGameState(map, null);
    state.activeCards.beacon = 1;
    state.playerPos = { x: 3, y: 3 };

    const nextState = executePlaceBeacon(state, 'supply_cache', 'TestOperative');
    assert.equal(nextState.activeCards.beacon, 0);
    assert.equal(nextState.stats.beaconsPlaced, 1);
    assert.equal(nextState.score, 200);
    assert.equal(nextState.map.beacons.length, 1);
    assert.equal(nextState.map.beacons[0]!.type, 'supply_cache');
    assert.equal(nextState.map.beacons[0]!.placedBy, 'TestOperative');
  });

  void it('salvages fallen operative dogtags for extra stamina, score, and vault charge', () => {
    const map = generateDailyMap('2026-11-22');
    map.tiles[7]![0] = 'floor';
    map.fallenOperatives = [
      {
        id: 'fallen-1',
        x: 0,
        y: 7,
        username: 'BraveScavenger',
        cause: 'captured',
        salvaged: false,
      },
    ];

    const state = initializeGameState(map, null);
    state.playerPos = { x: 0, y: 8 };
    state.stamina = 15;
    state.activeCards.vault = 2;

    const nextState = advanceTurn(state, { x: 0, y: 7 }, 'move');
    assert.equal(nextState.stats.dogtagsSalvaged, 1);
    assert.equal(nextState.activeCards.vault, 3, 'Gains +1 vault charge from salvage');
    assert.equal(nextState.stamina, 15, '15 - 1 move + 1 salvage = 15');
    assert.ok(nextState.score >= 400);
    assert.equal(nextState.map.fallenOperatives[0]!.salvaged, true);
  });

  void it('activates Community Directive Tier 2 bonus (+1 Starting Vault)', () => {
    const map = generateDailyMap('2026-11-22');
    const directive = {
      dateStr: '2026-11-22',
      totalExtractions: 8,
      tier: 2,
      activePerks: ['Enhanced Radar', '+1 Starting Vault'],
    };

    const state = initializeGameState(map, null, directive);
    assert.equal(state.activeCards.vault, 3, 'Starts with 3 vaults under Tier 2 perk');
    assert.equal(state.directivePerkActive, true);
  });
});
