import type {
  CommunityBeacon,
  DecoyHazard,
  Direction,
  FallenOperative,
  FoodRation,
  GameMapData,
  Hunter,
  Point,
  TileType,
} from './types';

// Deterministic Mulberry32 PRNG
export class SeededRNG {
  private state: number;

  constructor(seedStr: string) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
    }
    this.state = h >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  shuffle<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tempI = copy[i];
      const tempJ = copy[j];
      if (tempI !== undefined && tempJ !== undefined) {
        copy[i] = tempJ;
        copy[j] = tempI;
      }
    }
    return copy;
  }
}

export function getTodayDateString(): string {
  const now = new Date();
  const parts = now.toISOString().split('T');
  return parts[0] ?? '2026-11-22';
}

const DIRS: { dir: Direction; dx: number; dy: number }[] = [
  { dir: 'up', dx: 0, dy: -1 },
  { dir: 'down', dx: 0, dy: 1 },
  { dir: 'left', dx: -1, dy: 0 },
  { dir: 'right', dx: 1, dy: 0 },
];

export function isInsideGrid(x: number, y: number, width = 9, height = 9): boolean {
  return x >= 0 && x < width && y >= 0 && y < height;
}

export function getTile(tiles: TileType[][], x: number, y: number): TileType {
  const row = tiles[y];
  if (!row) return 'wall';
  const cell = row[x];
  return cell ?? 'wall';
}

export function setTile(tiles: TileType[][], x: number, y: number, val: TileType): void {
  const row = tiles[y];
  if (row && x >= 0 && x < row.length) {
    row[x] = val;
  }
}

export function findShortestPath(
  start: Point,
  target: Point,
  tiles: TileType[][],
  width = 9,
  height = 9
): Point[] | null {
  const queue: { pt: Point; path: Point[] }[] = [{ pt: start, path: [start] }];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const { pt, path } = current;

    if (pt.x === target.x && pt.y === target.y) {
      return path;
    }

    for (const { dx, dy } of DIRS) {
      const nx = pt.x + dx;
      const ny = pt.y + dy;
      const key = `${nx},${ny}`;
      if (
        isInsideGrid(nx, ny, width, height) &&
        !visited.has(key) &&
        getTile(tiles, nx, ny) !== 'wall'
      ) {
        visited.add(key);
        queue.push({ pt: { x: nx, y: ny }, path: [...path, { x: nx, y: ny }] });
      }
    }
  }

  return null;
}

export function generateDailyMap(
  dateStr: string,
  communityDecoys: DecoyHazard[] = [],
  communityBeacons: CommunityBeacon[] = [],
  fallenOperatives: FallenOperative[] = []
): GameMapData {
  const rng = new SeededRNG(`savior-map-seed-${dateStr}`);
  const width = 9;
  const height = 9;

  let tiles: TileType[][] = [];
  const startPos: Point = { x: 0, y: 8 };
  const extractionPos: Point = { x: 8, y: 0 };

  let attempts = 0;
  let solvable = false;

  while (!solvable && attempts < 20) {
    attempts++;
    tiles = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => 'floor' as TileType)
    );

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if ((x <= 1 && y >= 7) || (x >= 7 && y <= 1)) {
          continue;
        }

        if (x % 2 === 1 && y % 2 === 1) {
          if (rng.next() < 0.75) {
            setTile(tiles, x, y, 'wall');
          }
        } else if (rng.next() < 0.18) {
          setTile(tiles, x, y, 'wall');
        }
      }
    }

    let path = findShortestPath(startPos, extractionPos, tiles, width, height);

    if (!path) {
      let cx = startPos.x;
      let cy = startPos.y;
      while (cx !== extractionPos.x || cy !== extractionPos.y) {
        setTile(tiles, cx, cy, 'floor');
        if (cx < extractionPos.x && (rng.next() > 0.5 || cy === extractionPos.y)) {
          cx++;
        } else if (cy > extractionPos.y) {
          cy--;
        }
      }
      setTile(tiles, extractionPos.x, extractionPos.y, 'floor');
      path = findShortestPath(startPos, extractionPos, tiles, width, height);
    }

    if (path && path.length <= 25) {
      solvable = true;
    }
  }

  setTile(tiles, startPos.x, startPos.y, 'floor');
  setTile(tiles, extractionPos.x, extractionPos.y, 'extraction');

  const candidateHideouts: Point[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (getTile(tiles, x, y) === 'floor') {
        let adjacentWalls = 0;
        for (const { dx, dy } of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (getTile(tiles, nx, ny) === 'wall') adjacentWalls++;
        }
        if (adjacentWalls >= 2) {
          candidateHideouts.push({ x, y });
        }
      }
    }
  }

  const shuffledHideouts = rng.shuffle(candidateHideouts);
  const hideoutCount = Math.min(3, shuffledHideouts.length);
  for (let i = 0; i < hideoutCount; i++) {
    const pt = shuffledHideouts[i];
    if (pt) {
      setTile(tiles, pt.x, pt.y, 'hideout');
    }
  }

  const candidateHazards: Point[] = [];
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (getTile(tiles, x, y) === 'floor') {
        candidateHazards.push({ x, y });
      }
    }
  }
  const shuffledHazards = rng.shuffle(candidateHazards);
  for (let i = 0; i < Math.min(2, shuffledHazards.length); i++) {
    const pt = shuffledHazards[i];
    if (pt) {
      setTile(tiles, pt.x, pt.y, 'hazard');
    }
  }

  const candidateRationPositions: Point[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (
        getTile(tiles, x, y) === 'floor' &&
        !(x === startPos.x && y === startPos.y) &&
        !(x === extractionPos.x && y === extractionPos.y)
      ) {
        const pathToRation = findShortestPath(startPos, { x, y }, tiles, width, height);
        if (pathToRation) {
          candidateRationPositions.push({ x, y });
        }
      }
    }
  }

  const selectedRations: Point[] = [];
  const shuffledCandidates = rng.shuffle(candidateRationPositions);

  for (const pt of shuffledCandidates) {
    if (selectedRations.length >= 5) break;
    const isFarEnough = selectedRations.every(
      (existing) => Math.abs(existing.x - pt.x) + Math.abs(existing.y - pt.y) >= 2
    );
    if (isFarEnough) {
      selectedRations.push(pt);
    }
  }

  if (selectedRations.length < 5) {
    for (const pt of shuffledCandidates) {
      if (selectedRations.length >= 5) break;
      if (!selectedRations.some((r) => r.x === pt.x && r.y === pt.y)) {
        selectedRations.push(pt);
      }
    }
  }

  const rations: FoodRation[] = selectedRations.map((pt, index) => ({
    id: `ration-${index + 1}`,
    x: pt.x,
    y: pt.y,
    collected: false,
  }));

  const initialHunters: Hunter[] = [];

  const hunterConfigs = [
    {
      id: 'hunter-alpha',
      name: 'Vanguard Alpha',
      anchor: { x: 2, y: 6 },
      patrolOffsets: [
        { dx: 0, dy: 0 },
        { dx: 1, dy: 0 },
        { dx: 1, dy: -1 },
        { dx: 0, dy: -1 },
      ],
      initialFacing: 'right' as Direction,
    },
    {
      id: 'hunter-bravo',
      name: 'Centurion Beta',
      anchor: { x: 4, y: 4 },
      patrolOffsets: [
        { dx: 0, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 1, dy: 1 },
        { dx: 1, dy: 0 },
      ],
      initialFacing: 'down' as Direction,
    },
    {
      id: 'hunter-gamma',
      name: 'Gate Stalker',
      anchor: { x: 6, y: 2 },
      patrolOffsets: [
        { dx: 0, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: -1, dy: 1 },
        { dx: 0, dy: 1 },
      ],
      initialFacing: 'left' as Direction,
    },
  ];

  hunterConfigs.forEach((cfg) => {
    const patrolPath: Point[] = [];
    for (const offset of cfg.patrolOffsets) {
      const px = Math.min(8, Math.max(0, cfg.anchor.x + offset.dx));
      const py = Math.min(8, Math.max(0, cfg.anchor.y + offset.dy));
      const tile = getTile(tiles, px, py);
      if (tile !== 'wall' && tile !== 'hazard') {
        if (!patrolPath.some((p) => p.x === px && p.y === py)) {
          patrolPath.push({ x: px, y: py });
        }
      }
    }

    if (patrolPath.length === 0) {
      for (let r = 0; r < 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const px = cfg.anchor.x + dx;
            const py = cfg.anchor.y + dy;
            if (
              isInsideGrid(px, py) &&
              getTile(tiles, px, py) === 'floor' &&
              patrolPath.length < 3
            ) {
              patrolPath.push({ x: px, y: py });
            }
          }
        }
      }
    }

    if (patrolPath.length < 2) {
      patrolPath.push({ x: cfg.anchor.x, y: cfg.anchor.y });
    }

    const startPosH = patrolPath[0] ?? { x: cfg.anchor.x, y: cfg.anchor.y };
    const nextPosH = patrolPath[1 % patrolPath.length] ?? startPosH;

    let facing: Direction = cfg.initialFacing;
    if (nextPosH.x > startPosH.x) facing = 'right';
    else if (nextPosH.x < startPosH.x) facing = 'left';
    else if (nextPosH.y > startPosH.y) facing = 'down';
    else if (nextPosH.y < startPosH.y) facing = 'up';

    initialHunters.push({
      id: cfg.id,
      name: cfg.name,
      x: startPosH.x,
      y: startPosH.y,
      facing,
      patrolPath,
      patrolIndex: 0,
      isChasing: false,
      stunnedTurns: 0,
      alive: true,
      telegraphedMove: {
        x: nextPosH.x,
        y: nextPosH.y,
        facing,
        action: 'patrol',
      },
    });
  });

  const validDecoys: DecoyHazard[] = communityDecoys.filter(
    (d) =>
      isInsideGrid(d.x, d.y) &&
      getTile(tiles, d.x, d.y) === 'floor' &&
      !(d.x === startPos.x && d.y === startPos.y) &&
      !(d.x === extractionPos.x && d.y === extractionPos.y)
  );

  const validBeacons: CommunityBeacon[] = communityBeacons.filter(
    (b) =>
      isInsideGrid(b.x, b.y) &&
      getTile(tiles, b.x, b.y) !== 'wall'
  );

  const validFallen: FallenOperative[] = fallenOperatives.filter(
    (f) =>
      isInsideGrid(f.x, f.y) &&
      getTile(tiles, f.x, f.y) !== 'wall'
  );

  return {
    seed: `savior-seed-${dateStr}`,
    dateStr,
    width,
    height,
    tiles,
    startPos,
    extractionPos,
    rations,
    initialHunters,
    decoys: validDecoys,
    beacons: validBeacons,
    fallenOperatives: validFallen,
  };
}
