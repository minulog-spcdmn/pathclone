import { Rng } from '../engine/Random.ts';
import type { ZoneDef } from '../data/zones.ts';
import { Zone } from './Zone.ts';
import type { Vec2 } from '../engine/Vec2.ts';
import { v2 } from '../engine/Vec2.ts';

function carveCircle(walkable: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): void {
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(w - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) walkable[y * w + x] = 1;
    }
  }
}

interface Walker {
  pos: Vec2;
  dir: number; // radians
}

/** Organic cave/ruin generator: circular "blob" carving with momentum + branching walkers. */
export function generateFieldZone(def: ZoneDef, seed: number): Zone {
  const { width: w, height: h } = def;
  const walkable = new Uint8Array(w * h);
  const rng = new Rng(seed);

  const start = v2(w / 2, h / 2);
  const walkers: Walker[] = [{ pos: { ...start }, dir: rng.range(0, Math.PI * 2) }];
  const carvedPoints: Vec2[] = [];
  const totalSteps = Math.round((w * h) / 26);

  let steps = 0;
  while (steps < totalSteps && walkers.length > 0) {
    for (let wi = walkers.length - 1; wi >= 0; wi--) {
      const walker = walkers[wi];
      const radius = rng.range(2.2, 4.4);
      carveCircle(walkable, w, h, walker.pos.x, walker.pos.y, radius);
      carvedPoints.push({ ...walker.pos });

      walker.dir += rng.range(-0.5, 0.5);
      const dist = rng.range(2.5, 4.5);
      const nx = walker.pos.x + Math.cos(walker.dir) * dist;
      const ny = walker.pos.y + Math.sin(walker.dir) * dist;
      const margin = 3;
      walker.pos.x = Math.min(w - margin, Math.max(margin, nx));
      walker.pos.y = Math.min(h - margin, Math.max(margin, ny));

      if (walkers.length < 5 && rng.chance(0.045)) {
        walkers.push({ pos: { ...walker.pos }, dir: walker.dir + (rng.chance(0.5) ? 1 : -1) * rng.range(0.9, 1.8) });
      }
      if (walkers.length > 1 && rng.chance(0.01)) {
        walkers.splice(wi, 1);
      }
      steps++;
      if (steps >= totalSteps) break;
    }
  }

  // Ensure border stays solid (walls) for a clean edge.
  for (let x = 0; x < w; x++) {
    walkable[x] = 0;
    walkable[(h - 1) * w + x] = 0;
  }
  for (let y = 0; y < h; y++) {
    walkable[y * w] = 0;
    walkable[y * w + (w - 1)] = 0;
  }

  const spawnPoint = start;
  // Waypoint placed at the carved point furthest from spawn (a natural "far corner" of the zone).
  let waypointPos = spawnPoint;
  let bestDist = -1;
  for (const p of carvedPoints) {
    const d = (p.x - spawnPoint.x) ** 2 + (p.y - spawnPoint.y) ** 2;
    if (d > bestDist) {
      bestDist = d;
      waypointPos = p;
    }
  }

  const zone = new Zone(def, walkable, spawnPoint, waypointPos);

  // Distribute zone exits across other well-spread carved points.
  const exitCandidates = [...carvedPoints].sort(() => rng.next() - 0.5);
  def.connections.forEach((conn, i) => {
    const pos = exitCandidates[Math.min(i * 7, exitCandidates.length - 1)] ?? spawnPoint;
    zone.exits.push({ toZoneId: conn.to, label: conn.label, pos, radius: 1.4 });
  });

  // Scatter simple decoration markers (rocks/rubble) on walkable tiles away from spawn.
  const decoCount = Math.round((w * h) / 90);
  for (let i = 0; i < decoCount; i++) {
    const p = rng.pick(carvedPoints);
    if ((p.x - spawnPoint.x) ** 2 + (p.y - spawnPoint.y) ** 2 > 16) {
      zone.decorations.push({ pos: p, kind: rng.pick(['rock', 'bush', 'debris']) });
    }
  }

  return zone;
}

/** Hand-authored hub town: open plaza with a few structures for flavor. */
export function generateHubTown(def: ZoneDef): Zone {
  const { width: w, height: h } = def;
  const walkable = new Uint8Array(w * h).fill(1);
  for (let x = 0; x < w; x++) {
    walkable[x] = 0;
    walkable[(h - 1) * w + x] = 0;
  }
  for (let y = 0; y < h; y++) {
    walkable[y * w] = 0;
    walkable[y * w + (w - 1)] = 0;
  }
  // A couple of simple building blocks (walls) for visual structure.
  const buildings = [
    { x: 4, y: 4, w: 5, h: 4 },
    { x: w - 9, y: 4, w: 5, h: 4 },
    { x: 4, y: h - 8, w: 5, h: 4 },
  ];
  for (const b of buildings) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) {
        walkable[y * w + x] = 0;
      }
    }
  }
  const spawnPoint = v2(w / 2, h / 2 + 4);
  const waypointPos = v2(w / 2, h / 2 - 2);
  const zone = new Zone(def, walkable, spawnPoint, waypointPos);
  def.connections.forEach((conn, i) => {
    zone.exits.push({ toZoneId: conn.to, label: conn.label, pos: v2(w / 2 - 3 + i * 3, h - 5), radius: 1.6 });
  });
  zone.decorations.push({ pos: v2(w / 2, h / 2 - 2), kind: 'waypoint' });
  zone.decorations.push({ pos: v2(w / 2 - 6, h / 2), kind: 'stash' });
  return zone;
}

export function generateZone(def: ZoneDef, seed: number): Zone {
  if (def.kind === 'town') return generateHubTown(def);
  return generateFieldZone(def, seed);
}
