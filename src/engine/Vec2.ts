export interface Vec2 {
  x: number;
  y: number;
}

export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function length(a: Vec2): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return length(sub(a, b));
}

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: a.x / len, y: a.y / len };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function angleTo(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function fromAngle(angle: number, mag = 1): Vec2 {
  return { x: Math.cos(angle) * mag, y: Math.sin(angle) * mag };
}

export function clampLength(a: Vec2, max: number): Vec2 {
  const len = length(a);
  if (len <= max || len < 1e-6) return a;
  return scale(a, max / len);
}
