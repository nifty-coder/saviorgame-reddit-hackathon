import './index.css';

import {
  StrictMode,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  ORACLE_GAMBITS,
  checkOracleGambit,
  executeKnife,
  executePlaceBeacon,
  executeRepulsor,
  executeVault,
  getHunterSightlineTiles,
  initializeGameState,
  movePlayer,
} from '../shared/engine';
import { generateDailyMap, getTile, getTodayDateString } from '../shared/generator';
import type {
  CommentRecapResponse,
  Direction,
  GameState,
  Hunter,
  InitDataResponse,
  OracleGambitId,
  Point,
  SubmitRunResponse,
} from '../shared/types';

function getDirection(from: Point, to: Point): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else if (dy !== 0) {
    return dy > 0 ? 'down' : 'up';
  }
  return null;
}

// -------------------------------------------------------------
// PROCEDURAL VIDEO GAME CANVAS GRAPHICS ENGINE
// -------------------------------------------------------------

function drawCobblestoneTile(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  size: number,
  x: number,
  y: number
) {
  // Base cool slate dungeon flagstone floor
  ctx.fillStyle = (x + y) % 2 === 0 ? '#0f1724' : '#0c131e';
  ctx.fillRect(tx, ty, size, size);

  // Mortar grooves between floor pavers
  ctx.strokeStyle = '#060a10';
  ctx.lineWidth = 1;
  ctx.strokeRect(tx + 0.5, ty + 0.5, size - 1, size - 1);

  // Individual flagstones inside walkable tile
  const half = size / 2;
  const stones = [
    { ox: 2, oy: 2, w: half - 3, h: half - 3, c: '#162232' },
    { ox: half + 1, oy: 2, w: half - 3, h: half - 4, c: '#131e2c' },
    { ox: 3, oy: half + 1, w: half - 4, h: half - 3, c: '#111a26' },
    { ox: half, oy: half, w: half - 2, h: half - 2, c: '#182536' },
  ];

  for (const s of stones) {
    ctx.fillStyle = s.c;
    ctx.fillRect(tx + s.ox, ty + s.oy, s.w, s.h);

    // Stone top highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(tx + s.ox, ty + s.oy, s.w, 1);
  }

  // Subtle floor grid dot in center for clear tactical navigation
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(tx + half - 1, ty + half - 1, 2, 2);

  // Occasional moss/rubble fleck based on coordinate hash
  if ((x * 7 + y * 13) % 5 === 0) {
    ctx.fillStyle = '#15803d'; // moss
    ctx.fillRect(tx + 4, ty + size - 5, 3, 2);
  } else if ((x * 11 + y * 5) % 7 === 0) {
    ctx.fillStyle = '#334155'; // small pebble
    ctx.fillRect(tx + size - 6, ty + 5, 2, 2);
  }
}

function drawWallBlock(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  size: number,
  hasTorch: boolean,
  pulseTime: number
) {
  // 1. Prominent drop shadow cast onto floor to emphasize elevation
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(tx + 2, ty + size - 2, size - 2, 4);
  ctx.fillRect(tx + size - 2, ty + 4, 3, size - 4);

  // 2. Outer dark border of the fortified masonry
  ctx.fillStyle = '#1c0c06';
  ctx.fillRect(tx + 1, ty + 1, size - 2, size - 2);

  // 3. Wall front face (warm castle terracotta & iron-brick masonry)
  ctx.fillStyle = '#421f14';
  ctx.fillRect(tx + 2, ty + 3, size - 4, size - 5);

  // 4. Horizontal brick courses & mortar
  ctx.strokeStyle = '#220e07';
  ctx.lineWidth = 1;
  const midY = ty + size * 0.58;
  ctx.beginPath();
  ctx.moveTo(tx + 2, midY);
  ctx.lineTo(tx + size - 2, midY);
  ctx.stroke();

  // Vertical brick joints
  ctx.beginPath();
  ctx.moveTo(tx + size * 0.45, ty + size * 0.32);
  ctx.lineTo(tx + size * 0.45, midY);
  ctx.moveTo(tx + size * 0.68, midY);
  ctx.lineTo(tx + size * 0.68, ty + size - 2);
  ctx.stroke();

  // Individual brick texture highlights (warm earthen bricks)
  ctx.fillStyle = '#56281a';
  ctx.fillRect(tx + 3, ty + size * 0.34, size * 0.4 - 2, midY - ty - size * 0.34 - 1);
  ctx.fillStyle = '#4e2417';
  ctx.fillRect(tx + size * 0.47, ty + size * 0.34, size * 0.5 - 2, midY - ty - size * 0.34 - 1);
  ctx.fillStyle = '#5c2d1e';
  ctx.fillRect(tx + 3, midY + 1, size * 0.64 - 2, size - (midY - ty) - 4);

  // 5. 2.5D Raised Parapet / Rampart Cap (Top 32% of block)
  // Base cap block
  ctx.fillStyle = '#6c2918';
  ctx.fillRect(tx + 2, ty + 2, size - 4, size * 0.3);

  // Upper illuminated stone slab
  ctx.fillStyle = '#8a341f';
  ctx.fillRect(tx + 2, ty + 2, size - 4, size * 0.2);

  // Bright warm amber / bronze rim highlight along top edge
  ctx.fillStyle = '#c2410c';
  ctx.fillRect(tx + 2, ty + 2, size - 4, 1.5);
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(tx + 3, ty + 2, size - 6, 1);

  // Front bevel of the raised parapet (gives true 3D depth)
  ctx.fillStyle = '#2d1109';
  ctx.fillRect(tx + 2, ty + size * 0.31, size - 4, 1.5);

  // Reinforced iron studs / corner rivets
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(tx + 4, ty + size - 5, 2, 2);
  ctx.fillRect(tx + size - 6, ty + size - 5, 2, 2);
  ctx.fillStyle = '#fdba74';
  ctx.fillRect(tx + 4, ty + size - 5, 1, 1);
  ctx.fillRect(tx + size - 6, ty + size - 5, 1, 1);

  // 6. Wall Torch with animated flickering flame
  if (hasTorch) {
    const torchX = tx + size / 2;
    const torchY = ty + size * 0.5;

    // Torch iron bracket
    ctx.fillStyle = '#1c0c06';
    ctx.fillRect(torchX - 1.5, torchY, 3, 6);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(torchX - 2.5, torchY + 1, 5, 2);

    // Warm ambient light glow radius
    const flicker = Math.sin(pulseTime * 9) * 2;
    const torchGlow = ctx.createRadialGradient(
      torchX,
      torchY - 3,
      1,
      torchX,
      torchY - 3,
      size * 0.9 + flicker
    );
    torchGlow.addColorStop(0, 'rgba(251, 146, 60, 0.45)');
    torchGlow.addColorStop(0.5, 'rgba(245, 158, 11, 0.18)');
    torchGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = torchGlow;
    ctx.beginPath();
    ctx.arc(torchX, torchY - 3, size * 0.9 + flicker, 0, Math.PI * 2);
    ctx.fill();

    // Fire flame core
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(torchX, torchY - 3, 3 + Math.sin(pulseTime * 7), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(torchX, torchY - 3.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHideoutCave(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  size: number
) {
  // Shaded alcove ground
  ctx.fillStyle = '#060a10';
  ctx.fillRect(tx + 1, ty + 1, size - 2, size - 2);

  // Cavern rock archway (ancient mossy granite)
  ctx.fillStyle = '#263342';
  ctx.beginPath();
  ctx.arc(tx + size / 2, ty + size / 2 + 3, size / 2.3, Math.PI, 0, false);
  ctx.lineTo(tx + size - 3, ty + size - 2);
  ctx.lineTo(tx + 3, ty + size - 2);
  ctx.closePath();
  ctx.fill();

  // Dark cavern interior opening (stealth void)
  ctx.fillStyle = '#020408';
  ctx.beginPath();
  ctx.arc(tx + size / 2, ty + size / 2 + 5, size / 3.4, Math.PI, 0, false);
  ctx.lineTo(tx + size - 6, ty + size - 2);
  ctx.lineTo(tx + 6, ty + size - 2);
  ctx.closePath();
  ctx.fill();

  // Stone keystones along arch with moss highlights
  ctx.fillStyle = '#475569';
  ctx.fillRect(tx + size / 2 - 2, ty + 3, 4, 3);
  ctx.fillRect(tx + 6, ty + 8, 3, 3);
  ctx.fillRect(tx + size - 9, ty + 8, 3, 3);

  // Overhanging ivy / vines
  ctx.fillStyle = '#10b981';
  ctx.fillRect(tx + 9, ty + 7, 2, 5);
  ctx.fillRect(tx + size - 12, ty + 7, 2, 6);
  ctx.fillStyle = '#059669';
  ctx.fillRect(tx + 10, ty + 11, 2, 3);

  // Cyan stealth mist shimmer (signals safe hiding spot)
  ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
  ctx.fillRect(tx + 6, ty + size - 6, size - 12, 3);
}

function drawFoodRationChest(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  size: number,
  pulseTime: number
) {
  const cx = tx + size / 2;
  const cy = ty + size / 2;
  const pulse = Math.sin(pulseTime * 2.5) * 2;

  // Golden radiating god-ray aura
  const aura = ctx.createRadialGradient(cx, cy, 2, cx, cy, size / 2 + pulse);
  aura.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
  aura.addColorStop(0.6, 'rgba(245, 158, 11, 0.15)');
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + pulse, 0, Math.PI * 2);
  ctx.fill();

  // Chest body (wooden treasure supply crate)
  const cw = 18;
  const ch = 14;
  const cLeft = cx - cw / 2;
  const cTop = cy - ch / 2 + 2;

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(cLeft + 1, cTop + ch, cw - 2, 3);

  // Rich oak chest
  ctx.fillStyle = '#b45309';
  ctx.fillRect(cLeft, cTop, cw, ch);

  // Curved chest lid
  ctx.fillStyle = '#d97706';
  ctx.fillRect(cLeft, cTop, cw, 5);

  // Brass reinforcement bands
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cLeft + 3, cTop, 2.5, ch);
  ctx.fillRect(cLeft + cw - 5.5, cTop, 2.5, ch);

  // Chest keyhole latch
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(cx - 2, cTop + 4, 4, 4);
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx - 0.75, cTop + 5.5, 1.5, 2);

  // Floating sparkle star
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx + 6, cTop - 2 + Math.sin(pulseTime * 3) * 2, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawExtractionGate(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  size: number,
  pulseTime: number
) {
  const cx = tx + size / 2;
  const cy = ty + size / 2;
  const rot = pulseTime * 1.5;

  // Swirling emerald vortex aura
  const portalGlow = ctx.createRadialGradient(cx, cy, 3, cx, cy, size / 2 + 4);
  portalGlow.addColorStop(0, 'rgba(52, 211, 153, 0.6)');
  portalGlow.addColorStop(0.5, 'rgba(16, 185, 129, 0.25)');
  portalGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = portalGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 4, 0, Math.PI * 2);
  ctx.fill();

  // Ancient stone monolith pillars
  ctx.fillStyle = '#334155';
  ctx.fillRect(tx + 4, ty + 4, 5, size - 8);
  ctx.fillRect(tx + size - 9, ty + 4, 5, size - 8);

  // Top lintel stone
  ctx.fillRect(tx + 3, ty + 3, size - 6, 5);

  // Carved runic glyphs on pillars
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(tx + 5.5, ty + 12, 2, 2);
  ctx.fillRect(tx + 5.5, ty + 20, 2, 3);
  ctx.fillRect(tx + size - 7.5, ty + 14, 2, 3);

  // Rotating celestial rings
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.28, 0, Math.PI * 1.6);
  ctx.stroke();

  ctx.restore();

  // Portal gateway core
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#a7f3d0';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawHunterDrone(
  ctx: CanvasRenderingContext2D,
  h: Hunter,
  tx: number,
  ty: number,
  size: number,
  pulseTime: number
) {
  const cx = tx + size / 2;
  const cy = ty + size / 2;

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + size / 3.2, size / 3.4, size / 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mechanical Spider Legs / Treads
  ctx.strokeStyle = h.stunnedTurns > 0 ? '#6b7280' : '#475569';
  ctx.lineWidth = 2;
  const legOffsets = [
    { dx: -7, dy: -5 },
    { dx: 7, dy: -5 },
    { dx: -8, dy: 5 },
    { dx: 8, dy: 5 },
  ];
  for (const leg of legOffsets) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + leg.dx, cy + leg.dy);
    ctx.stroke();
  }

  // Heavy armored chassis
  ctx.fillStyle = h.stunnedTurns > 0 ? '#4c1d95' : '#7f1d1d'; // stunned purple or crimson
  ctx.beginPath();
  ctx.arc(cx, cy, size / 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Brass / steel reinforced armor plate
  ctx.strokeStyle = h.stunnedTurns > 0 ? '#a855f7' : '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Directional optical turret
  const fdx = h.facing === 'right' ? 1 : h.facing === 'left' ? -1 : 0;
  const fdy = h.facing === 'down' ? 1 : h.facing === 'up' ? -1 : 0;

  // Glowing Crimson/Stun Eye
  const eyeX = cx + fdx * 6;
  const eyeY = cy + fdy * 6;

  ctx.fillStyle = h.stunnedTurns > 0 ? '#c084fc' : '#f87171';
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, 1, 0, Math.PI * 2);
  ctx.fill();

  // Electric stun sparks if stunned
  if (h.stunnedTurns > 0) {
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 1.5;
    const sparkOffset = Math.sin(pulseTime * 12) * 4;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 8);
    ctx.lineTo(cx, cy - 12 + sparkOffset);
    ctx.lineTo(cx + 4, cy - 8);
    ctx.stroke();

    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`⚡${h.stunnedTurns}`, cx, cy - 13);
  }
}

function drawSearchlightBeam(
  ctx: CanvasRenderingContext2D,
  h: Hunter,
  map: GameState['map'],
  tileSize: number,
  pulseTime: number
) {
  const sightTiles = getHunterSightlineTiles(h, map);
  if (sightTiles.length === 0) return;

  const hx = h.x * tileSize + tileSize / 2;
  const hy = h.y * tileSize + tileSize / 2;

  // Draw smooth cone polygon connecting tiles
  for (const pt of sightTiles) {
    const px = pt.x * tileSize;
    const py = pt.y * tileSize;

    // Searchlight floor illumination
    const distToHunter = Math.hypot(pt.x - h.x, pt.y - h.y);
    const alpha = Math.max(0.12, 0.28 - distToHunter * 0.05);

    ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
    ctx.fillRect(px + 1, py + 1, tileSize - 2, tileSize - 2);

    // Hazard danger crosshatches along outer tiles
    if (distToHunter >= 2) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 2, py + 2, tileSize - 4, tileSize - 4);
    }
  }

  // Telegraphed Intent Arrow (Directional Path Projection)
  const tg = h.telegraphedMove;
  if (tg.action !== 'stunned') {
    const tx = tg.x * tileSize + tileSize / 2;
    const ty = tg.y * tileSize + tileSize / 2;
    const isChase = tg.action === 'chase';

    const beamColor = isChase ? '#ef4444' : '#f59e0b';
    const arrowLen = 7;
    const angle = Math.atan2(ty - hy, tx - hx);

    // Dotted projection line
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = beamColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();

    // Arrowhead
    ctx.fillStyle = beamColor;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(
      tx - arrowLen * Math.cos(angle - Math.PI / 5),
      ty - arrowLen * Math.sin(angle - Math.PI / 5)
    );
    ctx.lineTo(
      tx - arrowLen * Math.cos(angle + Math.PI / 5),
      ty - arrowLen * Math.sin(angle + Math.PI / 5)
    );
    ctx.closePath();
    ctx.fill();

    // Target tile tactical bracket
    ctx.strokeStyle = isChase ? '#ef4444' : '#f59e0b';
    ctx.lineWidth = 1.5;
    const pulseOffset = Math.sin(pulseTime * 4) * 1.5;
    ctx.strokeRect(
      tg.x * tileSize + 4 - pulseOffset,
      tg.y * tileSize + 4 - pulseOffset,
      tileSize - 8 + pulseOffset * 2,
      tileSize - 8 + pulseOffset * 2
    );
  }
}

function drawAdventurer(
  ctx: CanvasRenderingContext2D,
  playerPos: Point,
  hideoutTurns: number,
  tileSize: number,
  pulseTime: number
) {
  const px = playerPos.x * tileSize + tileSize / 2;
  const py = playerPos.y * tileSize + tileSize / 2;
  const isHidden = hideoutTurns > 0;

  // Warm Lantern dynamic lighting aura casting light on adjacent floor!
  const lanternLight = ctx.createRadialGradient(
    px + 5,
    py,
    2,
    px + 5,
    py,
    tileSize * 1.4
  );
  if (!isHidden) {
    lanternLight.addColorStop(0, 'rgba(254, 240, 138, 0.28)');
    lanternLight.addColorStop(0.5, 'rgba(245, 158, 11, 0.12)');
    lanternLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lanternLight;
    ctx.beginPath();
    ctx.arc(px + 5, py, tileSize * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(px, py + sizeOffset(tileSize, 10), 7, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isHidden) {
    // Cloaked stealth aura particles
    ctx.fillStyle = 'rgba(6, 182, 212, 0.28)';
    ctx.beginPath();
    ctx.arc(px, py, tileSize / 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Adventurer Body / Tunic
  ctx.fillStyle = isHidden ? 'rgba(34, 211, 238, 0.75)' : '#0284c7';
  ctx.fillRect(px - 5, py - 3, 10, 10);

  // Leather belt & buckle
  ctx.fillStyle = '#78350f';
  ctx.fillRect(px - 5, py + 3, 10, 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(px - 1, py + 3, 2, 2);

  // Adventurer Head / Hood
  ctx.fillStyle = isHidden ? '#22d3ee' : '#e0e7ff';
  ctx.beginPath();
  ctx.arc(px, py - 6, 5, 0, Math.PI * 2);
  ctx.fill();

  // Signature Crimson Scarf (flapping in the breeze!)
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(px - 4, py - 3, 8, 2.5);
  // Scarf tail waving
  const scarfWave = Math.sin(pulseTime * 5) * 2;
  ctx.beginPath();
  ctx.moveTo(px - 4, py - 2);
  ctx.lineTo(px - 8, py - 1 + scarfWave);
  ctx.lineTo(px - 4, py);
  ctx.closePath();
  ctx.fill();

  // Brass Lantern held in hand
  if (!isHidden) {
    const lx = px + 6;
    const ly = py + 2;
    ctx.fillStyle = '#78350f'; // lantern frame
    ctx.fillRect(lx - 2, ly - 2, 4, 5);
    ctx.fillStyle = '#fef08a'; // glowing glass
    ctx.fillRect(lx - 1, ly - 1, 2, 3);
  }

  // Stealth Cloak Indicator tag
  if (isHidden) {
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`CLOAK [${hideoutTurns}]`, px, py - 14);
  }
}

function sizeOffset(size: number, factor: number): number {
  return size / factor;
}

// -------------------------------------------------------------
// MAIN GAME COMPONENT
// -------------------------------------------------------------

export const Game = () => {
  const [initData, setInitData] = useState<InitDataResponse | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [activeModal, setActiveModal] = useState<
    'gambit_select' | 'debrief' | 'leaderboard' | 'drop_beacon' | 'how_to_play' | null
  >('gambit_select');
  const [activeAbility, setActiveAbility] = useState<
    'vault' | 'knife' | 'repulsor' | null
  >(null);
  const [showGhost, setShowGhost] = useState(false);
  const [ghostStepIndex, setGhostStepIndex] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [recapPosted, setRecapPosted] = useState(false);

  // Decoy & Beacon planting state
  const [plantType, setPlantType] = useState<'fake_ration' | 'spike_trap'>('fake_ration');
  const [decoyPlaced, setDecoyPlaced] = useState(false);
  const [beaconTypeToDrop, setBeaconTypeToDrop] = useState<'ambush_warning' | 'supply_cache'>('ambush_warning');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hasSubmittedRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/init');
        if (res.ok) {
          const json: InitDataResponse = await res.json();
          setInitData(json);
          const state = initializeGameState(json.todayMap, null, json.directive);
          setGameState(state);
        } else {
          const dateStr = getTodayDateString();
          const map = generateDailyMap(dateStr, []);
          const state = initializeGameState(map, null);
          setGameState(state);
        }
      } catch (e) {
        console.warn('Network init warning, using local generator:', e);
        const dateStr = getTodayDateString();
        const map = generateDailyMap(dateStr, []);
        const state = initializeGameState(map, null);
        setGameState(state);
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (!showGhost || !initData?.topGhost || initData.topGhost.length === 0)
      return;
    const interval = setInterval(() => {
      setGhostStepIndex((prev) => (prev + 1) % initData.topGhost!.length);
    }, 600);
    return () => clearInterval(interval);
  }, [showGhost, initData]);

  // Submit Run Results When Game Ends
  useEffect(() => {
    if (!gameState || gameState.status === 'playing' || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    const timeout = setTimeout(() => {
      setActiveModal('debrief');
    }, 100);

    async function submit() {
      if (!gameState) return;
      try {
        const payload = {
          dateStr: gameState.map.dateStr,
          score: gameState.score,
          rations: gameState.rationsCollected,
          turns: gameState.turn,
          status: gameState.status,
          playerPos: gameState.playerPos,
          gambitId: gameState.selectedGambit,
          gambitFulfilled: gameState.stats.oracleFulfilled,
          flairTag: gameState.stats.flairTag,
          history: gameState.history,
          stats: {
            dogtagsSalvaged: gameState.stats.dogtagsSalvaged,
            beaconsPlaced: gameState.stats.beaconsPlaced,
          },
        };

        const res = await fetch('/api/submit-run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const result: SubmitRunResponse = await res.json();
          setInitData((prev) =>
            prev
              ? {
                  ...prev,
                  leaderboard: result.leaderboard,
                  directive: result.directive,
                  profile: {
                    ...prev.profile,
                    currentStreak: result.newStreak,
                  },
                }
              : null
          );
        }
      } catch (err) {
        console.error('Error submitting run:', err);
      }
    }

    void submit();
    return () => clearTimeout(timeout);
  }, [gameState]);

  const handleMove = useCallback(
    (dir: Direction) => {
      if (!gameState || gameState.status !== 'playing') return;

      if (activeAbility === 'vault') {
        const next = executeVault(gameState, dir);
        setGameState(next);
        setActiveAbility(null);
      } else if (activeAbility === 'repulsor') {
        const next = executeRepulsor(gameState, dir);
        setGameState(next);
        setActiveAbility(null);
      } else {
        const next = movePlayer(gameState, dir);
        setGameState(next);
      }
    },
    [gameState, activeAbility]
  );

  const handleKnifeAction = useCallback(() => {
    if (!gameState || gameState.status !== 'playing') return;
    if (gameState.activeCards.knife <= 0) {
      showToast('No Ambush Blade charges remaining.');
      return;
    }

    const adjacentHunter = gameState.hunters.find(
      (h) =>
        h.alive &&
        Math.abs(h.x - gameState.playerPos.x) +
          Math.abs(h.y - gameState.playerPos.y) ===
          1
    );

    if (!adjacentHunter) {
      showToast('No Hunter in adjacent melee range.');
      return;
    }

    const next = executeKnife(gameState, adjacentHunter.id);
    setGameState(next);
    setActiveAbility(null);
  }, [gameState, showToast]);

  const handleDeployBeacon = useCallback(
    async (type: 'ambush_warning' | 'supply_cache') => {
      if (!gameState || gameState.status !== 'playing') return;
      if (gameState.activeCards.beacon <= 0) {
        showToast('Squad beacon already deployed this run.');
        return;
      }

      const username = initData?.username || 'Squad Operative';
      const next = executePlaceBeacon(gameState, type, username);
      setGameState(next);
      setActiveModal(null);
      showToast(
        `Deployed ${type === 'ambush_warning' ? 'Ambush Alert' : 'Supply Cache'}!`
      );

      try {
        await fetch('/api/place-beacon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateStr: gameState.map.dateStr,
            x: gameState.playerPos.x,
            y: gameState.playerPos.y,
            type,
            note:
              type === 'ambush_warning'
                ? 'Hunter patrol route spotted!'
                : 'Emergency squad rations',
          }),
        });
      } catch (e) {
        console.error(e);
      }
    },
    [gameState, initData, showToast]
  );

  const handleTileClick = useCallback(
    (tileX: number, tileY: number) => {
      if (!gameState || gameState.status !== 'playing') return;

      const pPos = gameState.playerPos;
      const dx = tileX - pPos.x;
      const dy = tileY - pPos.y;
      const dist = Math.abs(dx) + Math.abs(dy);

      if (activeAbility === 'vault') {
        if (
          (Math.abs(dx) === 2 && dy === 0) ||
          (Math.abs(dy) === 2 && dx === 0)
        ) {
          const dir = dx === 2 ? 'right' : dx === -2 ? 'left' : dy === 2 ? 'down' : 'up';
          handleMove(dir);
          return;
        }
      }

      if (activeAbility === 'knife') {
        const targetHunter = gameState.hunters.find(
          (h) => h.alive && h.x === tileX && h.y === tileY
        );
        if (targetHunter && dist === 1) {
          const next = executeKnife(gameState, targetHunter.id);
          setGameState(next);
          setActiveAbility(null);
          return;
        }
      }

      if (activeAbility === 'repulsor') {
        const dir = getDirection(pPos, { x: tileX, y: tileY });
        if (dir) {
          handleMove(dir);
          return;
        }
      }

      if (dist === 1) {
        const dir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
        handleMove(dir);
      }
    },
    [gameState, activeAbility, handleMove]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activeModal !== null) return;
      if (e.repeat) return;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          handleMove('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          handleMove('down');
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          handleMove('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          handleMove('right');
          break;
        case '1':
          setActiveAbility((prev) => (prev === 'vault' ? null : 'vault'));
          break;
        case '2':
          handleKnifeAction();
          break;
        case '3':
          setActiveAbility((prev) => (prev === 'repulsor' ? null : 'repulsor'));
          break;
        case '4':
          if (gameState && gameState.activeCards.beacon > 0) {
            setActiveModal('drop_beacon');
          }
          break;
        case 'Escape':
          setActiveAbility(null);
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, handleKnifeAction, activeModal, gameState]);

  // Tactical Canvas Renderer with Video Game Visual Polish
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pulseTime = 0;

    const render = () => {
      pulseTime += 0.04;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const displaySize = Math.min(rect.width, rect.height);

      if (
        canvas.width !== Math.floor(displaySize * dpr) ||
        canvas.height !== Math.floor(displaySize * dpr)
      ) {
        canvas.width = Math.floor(displaySize * dpr);
        canvas.height = Math.floor(displaySize * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const size = displaySize;
      const tileSize = size / 9;

      // Deep Dungeon void background
      ctx.fillStyle = '#090d13';
      ctx.fillRect(0, 0, size, size);

      // 1. Draw Base Tiles (Cobblestone, Walls, Caverns, Extraction)
      for (let y = 0; y < 9; y++) {
        for (let x = 0; x < 9; x++) {
          const tile = getTile(gameState.map.tiles, x, y);
          const tx = x * tileSize;
          const ty = y * tileSize;

          if (tile === 'wall') {
            const hasTorch = (x + y * 2) % 4 === 1;
            drawWallBlock(ctx, tx, ty, tileSize, hasTorch, pulseTime);
          } else if (tile === 'hideout') {
            drawCobblestoneTile(ctx, tx, ty, tileSize, x, y);
            drawHideoutCave(ctx, tx, ty, tileSize);
          } else if (tile === 'extraction') {
            drawCobblestoneTile(ctx, tx, ty, tileSize, x, y);
            drawExtractionGate(ctx, tx, ty, tileSize, pulseTime);
          } else {
            drawCobblestoneTile(ctx, tx, ty, tileSize, x, y);

            if (tile === 'hazard') {
              // Spike Punji Trap Grate
              ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
              ctx.fillRect(tx + 2, ty + 2, tileSize - 4, tileSize - 4);
              ctx.strokeStyle = '#dc2626';
              ctx.lineWidth = 1.5;
              ctx.strokeRect(tx + 2, ty + 2, tileSize - 4, tileSize - 4);

              // Iron spikes
              ctx.fillStyle = '#94a3b8';
              const sOffsets = [
                { sx: tx + 8, sy: ty + 8 },
                { sx: tx + tileSize - 10, sy: ty + 8 },
                { sx: tx + 8, sy: ty + tileSize - 10 },
                { sx: tx + tileSize - 10, sy: ty + tileSize - 10 },
                { sx: tx + tileSize / 2, sy: ty + tileSize / 2 },
              ];
              for (const sp of sOffsets) {
                ctx.beginPath();
                ctx.moveTo(sp.sx, sp.sy - 4);
                ctx.lineTo(sp.sx + 2.5, sp.sy + 3);
                ctx.lineTo(sp.sx - 2.5, sp.sy + 3);
                ctx.closePath();
                ctx.fill();
              }
            }
          }
        }
      }

      // 2. Draw Community Decoys
      for (const decoy of gameState.map.decoys) {
        const dx = decoy.x * tileSize + tileSize / 2;
        const dy = decoy.y * tileSize + tileSize / 2;

        if (decoy.type === 'fake_ration') {
          // Looks identical to real chest until stepped on!
          drawFoodRationChest(ctx, decoy.x * tileSize, decoy.y * tileSize, tileSize, pulseTime);
        } else {
          // Decoy wire trap
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(dx - 8, dy - 8, 16, 16);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(dx - 2, dy - 2, 4, 4);
        }
      }

      // 3. Draw Community Tactical Beacons
      for (const b of gameState.map.beacons) {
        if (!b.collected) {
          const bx = b.x * tileSize + tileSize / 2;
          const by = b.y * tileSize + tileSize / 2;
          const bPulse = Math.sin(pulseTime * 3) * 3;

          if (b.type === 'ambush_warning') {
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(bx, by, tileSize / 2.7 + bPulse, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚠️', bx, by + 4);
          } else {
            ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
            ctx.fillRect(bx - 9, by - 9, 18, 18);
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(bx - 9, by - 9, 18, 18);

            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('📦', bx, by + 4);
          }
        }
      }

      // 4. Draw Fallen Operatives Dogtags
      for (const fallen of gameState.map.fallenOperatives) {
        if (!fallen.salvaged) {
          const fx = fallen.x * tileSize + tileSize / 2;
          const fy = fallen.y * tileSize + tileSize / 2;
          const fGlow = Math.sin(pulseTime * 2.5) * 2;

          ctx.fillStyle = 'rgba(251, 191, 36, 0.3)';
          ctx.beginPath();
          ctx.arc(fx, fy, tileSize / 3 + fGlow, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🎖️', fx, fy + 4);
        }
      }

      // 5. Draw Food Rations (Supply Chests)
      for (const r of gameState.map.rations) {
        if (!r.collected) {
          drawFoodRationChest(ctx, r.x * tileSize, r.y * tileSize, tileSize, pulseTime);
        }
      }

      // 6. Draw Hunter Searchlight Beams & Intent Arrows
      for (const h of gameState.hunters) {
        if (!h.alive) continue;
        drawSearchlightBeam(ctx, h, gameState.map, tileSize, pulseTime);
      }

      // 7. Draw Hunter Mech Drones
      for (const h of gameState.hunters) {
        if (!h.alive) continue;
        drawHunterDrone(ctx, h, h.x * tileSize, h.y * tileSize, tileSize, pulseTime);
      }

      // 8. Draw Ghost Replay Runner
      if (
        showGhost &&
        initData?.topGhost &&
        initData.topGhost.length > ghostStepIndex
      ) {
        const gStep = initData.topGhost[ghostStepIndex];
        if (gStep) {
          const gx = gStep.x * tileSize + tileSize / 2;
          const gy = gStep.y * tileSize + tileSize / 2;

          ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
          ctx.beginPath();
          ctx.arc(gx, gy, tileSize / 3.4, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('GHOST', gx, gy + tileSize / 2 - 2);
        }
      }

      // 9. Draw Adventurer Player
      drawAdventurer(
        ctx,
        gameState.playerPos,
        gameState.hideoutTurns,
        tileSize,
        pulseTime
      );

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [gameState, showGhost, ghostStepIndex, initData]);

  const onCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const tileSize = rect.width / 9;
    const tileX = Math.floor(x / tileSize);
    const tileY = Math.floor(y / tileSize);

    if (tileX >= 0 && tileX < 9 && tileY >= 0 && tileY < 9) {
      handleTileClick(tileX, tileY);
    }
  };

  const buildEmojiGrid = useCallback(() => {
    if (!gameState) return '';
    const visited = new Set(gameState.history.map((h) => `${h.x},${h.y}`));
    let visual = '';

    for (let y = 0; y < 9; y++) {
      let row = '';
      for (let x = 0; x < 9; x++) {
        const tile = getTile(gameState.map.tiles, x, y);
        if (
          x === gameState.map.extractionPos.x &&
          y === gameState.map.extractionPos.y
        ) {
          row += '🟩';
        } else if (
          x === gameState.map.startPos.x &&
          y === gameState.map.startPos.y
        ) {
          row += '🟦';
        } else if (visited.has(`${x},${y}`)) {
          row += '🟨';
        } else if (tile === 'wall') {
          row += '⬛';
        } else if (tile === 'hideout') {
          row += '🟦';
        } else {
          row += '▫️';
        }
      }
      visual += row + '\n';
    }
    return visual;
  }, [gameState]);

  const handlePostRecap = async () => {
    if (!gameState || recapPosted) return;
    const gridVisual = buildEmojiGrid();
    const gambitTitle = gameState.selectedGambit
      ? ORACLE_GAMBITS[gameState.selectedGambit].title
      : 'None';

    try {
      const res = await fetch('/api/recap-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateStr: gameState.map.dateStr,
          score: gameState.score,
          rations: gameState.rationsCollected,
          turns: gameState.turn,
          status: gameState.status,
          gambitTitle,
          gambitFulfilled: gameState.stats.oracleFulfilled,
          flairTag: gameState.stats.flairTag,
          gridVisual,
          coopStats: {
            dogtagsSalvaged: gameState.stats.dogtagsSalvaged,
            beaconsPlaced: gameState.stats.beaconsPlaced,
          },
        }),
      });

      if (res.ok) {
        const json: CommentRecapResponse = await res.json();
        setRecapPosted(true);
        if (json.commentText) {
          void navigator.clipboard.writeText(json.commentText);
        }
        showToast('Tactical Recap posted to thread!');
      }
    } catch (e) {
      console.error(e);
      showToast('Could not post comment automatically. Copied to clipboard!');
    }
  };

  const handleCopyRecap = () => {
    if (!gameState) return;
    const gridVisual = buildEmojiGrid();
    const gambit = gameState.selectedGambit
      ? ORACLE_GAMBITS[gameState.selectedGambit]
      : null;

    const text = `SAVIOR ${gameState.map.dateStr} ⚔️ ${gameState.score.toLocaleString()} pts
Status: ${gameState.status === 'extracted' ? '🟩 EXTRACTED' : '🟥 FALLEN'}
🍞 Rations: ${gameState.rationsCollected}/5 | ⚡ Stamina: ${gameState.stamina}
🤝 Squad Co-op: 🎖️ ${gameState.stats.dogtagsSalvaged} Dogtags | 📡 ${gameState.stats.beaconsPlaced} Beacons
🔮 Oracle: [${gambit ? gambit.title : 'None'}] ${gameState.stats.oracleFulfilled ? '✅ FULFILLED' : '❌ MISSED'}
🏷️ Flair: ${gameState.stats.flairTag}

${gridVisual}`;

    void navigator.clipboard.writeText(text);
    showToast('Spoiler-safe recap copied to clipboard!');
  };

  const handlePlantDecoy = async () => {
    if (!gameState || decoyPlaced) return;
    try {
      const res = await fetch('/api/place-decoy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateStr: gameState.map.dateStr,
          x: gameState.playerPos.x,
          y: gameState.playerPos.y,
          type: plantType,
        }),
      });
      if (res.ok) {
        setDecoyPlaced(true);
        showToast(
          `Planted ${plantType === 'fake_ration' ? 'Fake Ration' : 'Decoy Trap'} for next runners!`
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRetryRun = useCallback(() => {
    if (!initData) return;
    const state = initializeGameState(initData.todayMap, null, initData.directive);
    setGameState(state);
    setActiveModal(null);
    setActiveAbility(null);
    setShowGhost(false);
    setGhostStepIndex(0);
    setDecoyPlaced(false);
    setRecapPosted(false);
    hasSubmittedRef.current = false;
    showToast('Sector restarted! Keep your eye on hunter red arrows.');
  }, [initData, showToast]);

  if (!gameState) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#080c11] text-amber-400 font-mono">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs uppercase tracking-widest">
          INFILTRATING SECTOR 9x9...
        </span>
      </div>
    );
  }

  const selectedGambitObj = gameState.selectedGambit
    ? ORACLE_GAMBITS[gameState.selectedGambit]
    : null;

  const directive = initData?.directive;

  return (
    <div className="flex relative flex-col justify-between items-center w-full h-full max-h-screen bg-[#080c11] text-slate-100 p-2 sm:p-3 overflow-hidden select-none">
      {toastMessage && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-amber-400/80 text-amber-300 font-mono text-xs px-4 py-2 rounded-lg shadow-xl shadow-black/80 flex items-center gap-2">
          <span>⚡</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP TACTICAL HUD BAR */}
      <header className="w-full max-w-md flex justify-between items-center border-b border-slate-800 pb-1 z-10 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-black text-sm tracking-wider text-amber-400">
            SAVIOR
          </span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
            {gameState.map.dateStr}
          </span>
          <span className="text-[9px] font-mono text-cyan-400/80 bg-slate-900 border border-cyan-800/60 px-1 py-0.5 rounded">
            v1.2.0-coop
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono text-slate-400">STAMINA:</span>
              <span
                className={`text-xs font-mono font-bold ${
                  gameState.stamina <= 5
                    ? 'text-red-400 animate-pulse'
                    : 'text-emerald-400'
                }`}
              >
                {gameState.stamina}/25
              </span>
            </div>
            <div className="w-14 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  gameState.stamina <= 5 ? 'bg-red-500' : 'bg-emerald-400'
                }`}
                style={{
                  width: `${Math.min(100, (gameState.stamina / 25) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 px-1.5 py-0.5 rounded">
            <span className="text-xs">🍞</span>
            <span
              className={`text-xs font-mono font-bold ${
                gameState.rationsCollected >= 1
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}
            >
              {gameState.rationsCollected}/5
            </span>
          </div>

          <div className="text-right">
            <span className="text-xs font-mono font-bold text-slate-100">
              {gameState.score.toLocaleString()}
            </span>
            <span className="text-[9px] font-mono text-slate-500 ml-0.5">PTS</span>
          </div>
        </div>
      </header>

      {/* SQUAD CO-OP DIRECTIVE & ORACLE MINI BAR */}
      <div className="w-full max-w-md my-0.5 px-2 py-0.5 bg-slate-900/70 border border-slate-800/80 rounded flex justify-between items-center text-[10px] font-mono shrink-0">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-cyan-400 font-semibold">🤝 SQUAD:</span>
          <span className="text-slate-300 truncate">
            {directive ? `${directive.totalExtractions}/15 Extractions` : 'Sector Active'}
          </span>
        </div>
        {selectedGambitObj && (
          <span className="text-amber-400 truncate ml-2">
            🔮 {selectedGambitObj.title} {checkOracleGambit(gameState) ? '✅' : '⚠️'}
          </span>
        )}
      </div>

      {/* INTERACTIVE 9x9 CANVAS VIEWPORT */}
      <main className="relative flex items-center justify-center my-auto w-full max-w-[360px] sm:max-w-[390px] aspect-square shrink-0">
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          className="w-full h-full rounded-lg border border-slate-800 shadow-2xl shadow-black cursor-crosshair touch-none"
        />

        {activeAbility && (
          <div className="absolute top-2 left-2 bg-slate-900/90 border border-amber-400 text-amber-300 text-[10px] font-mono px-2 py-1 rounded shadow pointer-events-none">
            {activeAbility === 'vault' && '⚡ VAULT ARMED: Tap tile 2 steps away'}
            {activeAbility === 'knife' && '🗡️ BLADE ARMED: Tap adjacent Hunter from behind'}
            {activeAbility === 'repulsor' && '💨 REPULSOR ARMED: Tap direction to blast'}
          </div>
        )}
      </main>

      {/* CONTEXTUAL INTEL & MESSAGE FEED */}
      <div className="w-full max-w-md px-1 text-[11px] font-mono truncate text-slate-400 my-0.5 shrink-0 flex items-center justify-between">
        <span className="truncate">
          {gameState.messageLog[0]?.text || 'Evade red cones. Plan before moving.'}
        </span>
        <button
          onClick={() => setShowGhost((prev) => !prev)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors shrink-0 ml-1 ${
            showGhost
              ? 'bg-slate-700 text-white border-slate-500'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          {showGhost ? '👻 GHOST: ON' : '👻 GHOST: OFF'}
        </button>
      </div>

      {/* TACTICAL LOADOUT DOCK & D-PAD CONTROLS */}
      <footer className="w-full max-w-md flex flex-col gap-1.5 pt-1 border-t border-slate-800 shrink-0">
        <div className="grid grid-cols-4 gap-1">
          {/* Card 1: Vault */}
          <button
            onClick={() =>
              setActiveAbility((prev) => (prev === 'vault' ? null : 'vault'))
            }
            disabled={gameState.activeCards.vault <= 0}
            className={`py-1.5 px-0.5 rounded flex flex-col items-center justify-center border font-mono transition-all cursor-pointer ${
              activeAbility === 'vault'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                : gameState.activeCards.vault > 0
                  ? 'bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-400/60'
                  : 'bg-slate-950 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-0.5 text-[10px] sm:text-[11px] font-bold">
              <span>⚡VAULT</span>
              <span className="text-[9px]">({gameState.activeCards.vault})</span>
            </div>
            <span className="text-[8px] opacity-75">Leap 2</span>
          </button>

          {/* Card 2: Ambush Blade */}
          <button
            onClick={handleKnifeAction}
            disabled={gameState.activeCards.knife <= 0}
            className={`py-1.5 px-0.5 rounded flex flex-col items-center justify-center border font-mono transition-all cursor-pointer ${
              activeAbility === 'knife'
                ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/20'
                : gameState.activeCards.knife > 0
                  ? 'bg-slate-900 border-slate-700 text-slate-200 hover:border-red-400/60'
                  : 'bg-slate-950 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-0.5 text-[10px] sm:text-[11px] font-bold">
              <span>🗡️BLADE</span>
              <span className="text-[9px]">({gameState.activeCards.knife})</span>
            </div>
            <span className="text-[8px] opacity-75">Ambush</span>
          </button>

          {/* Card 3: Woosh-Smacker */}
          <button
            onClick={() =>
              setActiveAbility((prev) => (prev === 'repulsor' ? null : 'repulsor'))
            }
            disabled={gameState.activeCards.repulsor <= 0}
            className={`py-1.5 px-0.5 rounded flex flex-col items-center justify-center border font-mono transition-all cursor-pointer ${
              activeAbility === 'repulsor'
                ? 'bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/20'
                : gameState.activeCards.repulsor > 0
                  ? 'bg-slate-900 border-slate-700 text-slate-200 hover:border-purple-400/60'
                  : 'bg-slate-950 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-0.5 text-[10px] sm:text-[11px] font-bold">
              <span>💨BLAST</span>
              <span className="text-[9px]">({gameState.activeCards.repulsor})</span>
            </div>
            <span className="text-[8px] opacity-75">Stun 2t</span>
          </button>

          {/* Card 4: Collaborative Squad Beacon */}
          <button
            onClick={() => setActiveModal('drop_beacon')}
            disabled={gameState.activeCards.beacon <= 0}
            className={`py-1.5 px-0.5 rounded flex flex-col items-center justify-center border font-mono transition-all cursor-pointer ${
              gameState.activeCards.beacon > 0
                ? 'bg-cyan-950/80 border-cyan-500/80 text-cyan-300 hover:bg-cyan-900/60'
                : 'bg-slate-950 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-0.5 text-[10px] sm:text-[11px] font-bold">
              <span>📡BEACON</span>
              <span className="text-[9px]">({gameState.activeCards.beacon})</span>
            </div>
            <span className="text-[8px] opacity-75">Squad Aid</span>
          </button>
        </div>

        {/* Compact D-Pad */}
        <div className="flex items-center justify-center gap-2 pb-0.5">
          <button
            onClick={() => handleMove('left')}
            className="w-12 h-7 rounded bg-slate-900 border border-slate-700 active:bg-slate-700 text-slate-300 font-mono font-bold text-sm flex items-center justify-center cursor-pointer shadow"
          >
            ◀
          </button>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => handleMove('up')}
              className="w-12 h-7 rounded bg-slate-900 border border-slate-700 active:bg-slate-700 text-slate-300 font-mono font-bold text-sm flex items-center justify-center cursor-pointer shadow"
            >
              ▲
            </button>
            <button
              onClick={() => handleMove('down')}
              className="w-12 h-7 rounded bg-slate-900 border border-slate-700 active:bg-slate-700 text-slate-300 font-mono font-bold text-sm flex items-center justify-center cursor-pointer shadow"
            >
              ▼
            </button>
          </div>
          <button
            onClick={() => handleMove('right')}
            className="w-12 h-7 rounded bg-slate-900 border border-slate-700 active:bg-slate-700 text-slate-300 font-mono font-bold text-sm flex items-center justify-center cursor-pointer shadow"
          >
            ▶
          </button>
        </div>
      </footer>

      {/* MODAL: SQUAD BEACON DEPLOYMENT */}
      {activeModal === 'drop_beacon' && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-slate-900 border border-cyan-500/60 rounded-xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="border-b border-slate-800 pb-2">
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                TACTICAL SQUAD DEPLOYMENT
              </span>
              <h2 className="text-base font-bold font-mono text-slate-100">
                Deploy Squad Signal // Current Tile
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Leave a tactical beacon for subsequent Redditors navigating this sector.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setBeaconTypeToDrop('ambush_warning')}
                className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                  beaconTypeToDrop === 'ambush_warning'
                    ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                    : 'border-slate-800 bg-slate-950/80 text-slate-300'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <span>⚠️ Ambush Warning Flare</span>
                  <span className="text-[10px] font-normal text-amber-400">+200 pts</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Marks this location to alert other players when hunters patrol nearby.
                </p>
              </button>

              <button
                onClick={() => setBeaconTypeToDrop('supply_cache')}
                className={`w-full text-left p-2.5 rounded-lg border transition-all cursor-pointer ${
                  beaconTypeToDrop === 'supply_cache'
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                    : 'border-slate-800 bg-slate-950/80 text-slate-300'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <span>📦 Emergency Supply Cache</span>
                  <span className="text-[10px] font-normal text-cyan-400">+200 pts</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Leaves emergency field rations (+2 Stamina) for the next player who reaches here.
                </p>
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  void handleDeployBeacon(beaconTypeToDrop);
                }}
                className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-mono font-bold text-xs uppercase cursor-pointer shadow"
              >
                Deploy Signal // +200 pts
              </button>
              <button
                onClick={() => setActiveModal(null)}
                className="py-2.5 px-3 rounded bg-slate-800 text-slate-300 font-mono text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: PRE-RUN ORACLE GAMBIT SELECTION */}
      {activeModal === 'gambit_select' && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="border-b border-slate-800 pb-2">
              <span className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                TACTICAL INTELLIGENCE // TURN 0
              </span>
              <h2 className="text-lg font-bold font-mono text-slate-100">
                The Oracle Gambit
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Commit to a pre-run operational wager. Fulfill it during extraction to earn{' '}
                <span className="text-amber-300 font-semibold">+700 pts & a 1.5x score multiplier</span>.
              </p>
            </div>

            <div className="space-y-2">
              {(Object.keys(ORACLE_GAMBITS) as OracleGambitId[]).map((gid) => {
                const g = ORACLE_GAMBITS[gid];
                return (
                  <button
                    key={gid}
                    onClick={() => {
                      setGameState((prev) =>
                        prev ? { ...prev, selectedGambit: gid } : null
                      );
                      setActiveModal(null);
                      showToast(`Oracle Gambit set: ${g.title}`);
                    }}
                    className="w-full text-left p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-amber-400/80 hover:bg-slate-800/60 transition-all cursor-pointer group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-xs text-slate-200 group-hover:text-amber-400">
                        {g.title}
                      </span>
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        {g.rewardText}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {g.condition}
                    </p>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs uppercase tracking-wider cursor-pointer"
            >
              Skip Gambit // Standard Run
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: MISSION DEBRIEF */}
      {activeModal === 'debrief' && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl flex flex-col gap-2.5 max-h-[90vh] overflow-y-auto">
            <div className="text-center border-b border-slate-800 pb-2">
              <span
                className={`text-xl sm:text-2xl font-black font-mono tracking-wider ${
                  gameState.status === 'extracted'
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }`}
              >
                {gameState.status === 'extracted'
                  ? 'MISSION EXTRACTED'
                  : 'OPERATIVE FALLEN'}
              </span>
              <p className="text-xs font-mono text-slate-400 mt-0.5">
                {gameState.status === 'extracted'
                  ? 'Sector cleared. Intel and rations secured.'
                  : gameState.status === 'starved'
                    ? 'Stamina depleted before reaching Extraction Gate.'
                    : 'Hunter intercepted operative without defensive cover.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">FINAL SCORE</span>
                <span className="text-base sm:text-lg font-bold text-amber-400">
                  {gameState.score.toLocaleString()}
                </span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">RATIONS SECURED</span>
                <span className="text-sm sm:text-base font-bold text-slate-200">
                  {gameState.rationsCollected}/5 🍞
                </span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">OPERATIVE FLAIR</span>
                <span className="text-xs font-bold text-cyan-400 truncate block">
                  {gameState.stats.flairTag}
                </span>
              </div>
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">SQUAD CO-OP</span>
                <span className="text-xs font-bold text-emerald-400">
                  🎖️ {gameState.stats.dogtagsSalvaged} | 📡 {gameState.stats.beaconsPlaced}
                </span>
              </div>
            </div>

            {/* TACTICAL SURVIVAL TIP ON DEFEAT */}
            {gameState.status !== 'extracted' && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs font-mono space-y-1">
                <div className="flex items-center justify-between text-amber-300 font-bold text-[11px]">
                  <span>💡 SURVIVAL TIP // HOW NOT TO DIE:</span>
                  <button
                    onClick={() => setActiveModal('how_to_play')}
                    className="text-[10px] text-amber-400 underline hover:text-amber-200 cursor-pointer"
                  >
                    View Manual
                  </button>
                </div>
                {gameState.status === 'starved' ? (
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    You ran out of stamina. Every step costs <strong className="text-amber-400">1⚡</strong>. Collect the golden supply chests <strong className="text-amber-400">🍞</strong> along your path for <strong className="text-emerald-400">+4⚡ Stamina</strong>! Avoid backtracking and head straight towards the green portal.
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Ambushed by a Hunter! Watch the <strong className="text-red-400">Red Cones</strong> (their sightlines) and the <strong className="text-red-400">Red Arrows</strong> (their next step). Use <strong className="text-purple-400">[💨 BLAST]</strong> to stun them, <strong className="text-amber-400">[⚡ VAULT]</strong> to leap away, or hide inside <strong className="text-cyan-400">Caverns</strong>!
                  </p>
                )}
              </div>
            )}

            {gameState.status === 'extracted' && !decoyPlaced && (
              <div className="p-2 rounded bg-slate-950/80 border border-slate-800 text-xs font-mono">
                <span className="text-[10px] text-amber-400 font-bold block mb-1">
                  ASYNCHRONOUS RIVALRY // DROP HAZARD
                </span>
                <p className="text-[10px] text-slate-400 mb-1.5">
                  Plant 1 trap on your extraction tile for subsequent Redditors:
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPlantType('fake_ration')}
                    className={`flex-1 py-1 rounded text-[10px] border ${
                      plantType === 'fake_ration'
                        ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                        : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    🍞 Fake Ration
                  </button>
                  <button
                    onClick={() => setPlantType('spike_trap')}
                    className={`flex-1 py-1 rounded text-[10px] border ${
                      plantType === 'spike_trap'
                        ? 'border-red-400 bg-red-500/20 text-red-300'
                        : 'border-slate-800 text-slate-400'
                    }`}
                  >
                    ⚠️ Wire Trap
                  </button>
                  <button
                    onClick={() => {
                      void handlePlantDecoy();
                    }}
                    className="py-1 px-3 rounded bg-amber-500 text-slate-950 font-bold text-[10px] cursor-pointer"
                  >
                    Plant
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              {/* RETRY BUTTON WHEN FALLEN */}
              {gameState.status !== 'extracted' && (
                <button
                  onClick={handleRetryRun}
                  className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg flex items-center justify-center gap-1.5"
                >
                  <span>🔄</span>
                  <span>REDEPLOY OPERATIVE // TRY AGAIN</span>
                </button>
              )}
              <button
                onClick={() => {
                  void handlePostRecap();
                }}
                disabled={recapPosted}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow-lg flex items-center justify-center gap-1.5"
              >
                <span>💬</span>
                <span>
                  {recapPosted ? 'RECAP POSTED TO THREAD' : 'POST RECAP TO REDDIT THREAD'}
                </span>
              </button>

              <div className="flex gap-2">
                <button
                  onClick={handleCopyRecap}
                  className="flex-1 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs cursor-pointer"
                >
                  📋 Copy Emoji Card
                </button>
                <button
                  onClick={() => setActiveModal('leaderboard')}
                  className="flex-1 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs cursor-pointer"
                >
                  🏆 Leaderboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DAILY LEADERBOARD */}
      {activeModal === 'leaderboard' && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl flex flex-col gap-3 max-h-[85vh]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <div>
                <h3 className="font-mono font-bold text-sm text-slate-100">
                  Daily Extraction Board
                </h3>
                <span className="text-[10px] font-mono text-amber-400">
                  Sector {gameState.map.dateStr}
                </span>
              </div>
              <button
                onClick={() => setActiveModal('debrief')}
                className="text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-1.5 overflow-y-auto max-h-[50vh] pr-1">
              {initData?.leaderboard && initData.leaderboard.length > 0 ? (
                initData.leaderboard.map((entry) => (
                  <div
                    key={`${entry.username}-${entry.rank}`}
                    className="flex justify-between items-center p-2 rounded bg-slate-950/70 border border-slate-800/80 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-5 font-bold ${
                          entry.rank === 1
                            ? 'text-amber-400'
                            : entry.rank === 2
                              ? 'text-slate-300'
                              : entry.rank === 3
                                ? 'text-amber-700'
                                : 'text-slate-500'
                        }`}
                      >
                        #{entry.rank}
                      </span>
                      <div>
                        <span className="text-slate-200 font-semibold block">
                          {entry.username}
                        </span>
                        <span className="text-[10px] text-cyan-400">
                          {entry.flairTag}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-amber-400 block">
                        {entry.score.toLocaleString()} pts
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {entry.rations}/5 rations
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs font-mono text-slate-500">
                  No extractions recorded yet today. Be the first Savior!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: HOW TO PLAY / FIELD MANUAL */}
      {activeModal === 'how_to_play' && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/60 rounded-xl p-4 shadow-2xl flex flex-col gap-3 max-h-[88vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🧭</span>
                <div>
                  <h3 className="font-mono font-black text-sm text-amber-400">
                    SAVIOR FIELD MANUAL
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    Tactical Survival Guide
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {/* Step-by-Step Goal */}
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[11px] font-bold text-emerald-400 block mb-1">
                  🎯 MISSION GOAL (HOW TO WIN)
                </span>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                  <li>
                    Start at bottom-left <strong className="text-blue-400">(🟦 Operative)</strong>.
                  </li>
                  <li>
                    Collect at least <strong className="text-amber-400">1 Golden Supply Chest 🍞</strong>. The exit gate is locked until you have food!
                  </li>
                  <li>
                    Reach the <strong className="text-emerald-400">Green Portal 🟩</strong> at top-right before Stamina drops to 0.
                  </li>
                </ol>
              </div>

              {/* Survival rules */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[11px] font-bold text-red-400 block mb-1">
                  💀 HOW NOT TO DIE
                </span>
                <ul className="space-y-1.5 text-slate-300 text-[11px] leading-relaxed">
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-400 font-bold shrink-0">⚡ 25 STAMINA:</span>
                    <span>Every step costs 1⚡. Grab chests 🍞 for +4⚡ so you don&apos;t starve!</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-red-400 font-bold shrink-0">🔴 RED CONES:</span>
                    <span>Hunter vision cones. Walking in front of a Hunter triggers an alert!</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-red-400 font-bold shrink-0">➡️ RED ARROWS:</span>
                    <span>Shows where the Hunter will step NEXT turn. Never walk onto that tile!</span>
                  </li>
                </ul>
              </div>

              {/* Abilities */}
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[11px] font-bold text-cyan-400 block mb-1">
                  🎒 TACTICAL LOADOUT (BOTTOM BUTTONS)
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <strong className="text-amber-300 block">⚡ VAULT (Jump)</strong>
                    <span className="text-slate-400">Leap 2 tiles over walls, traps, or hunters.</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <strong className="text-purple-300 block">💨 BLAST (Stun)</strong>
                    <span className="text-slate-400">Knocks hunter 3 tiles back &amp; stuns for 2 turns!</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <strong className="text-red-300 block">🗡️ BLADE (Ambush)</strong>
                    <span className="text-slate-400">Eliminate adjacent hunter from behind or cave (+1,200 pts).</span>
                  </div>
                  <div className="p-1.5 rounded bg-slate-900 border border-slate-800">
                    <strong className="text-emerald-300 block">🕳️ CAVERN (Hide)</strong>
                    <span className="text-slate-400">Step into caves to become invisible for 2 turns!</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow"
            >
              UNDERSTOOD // RESUME MISSION
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Game />
  </StrictMode>
);
