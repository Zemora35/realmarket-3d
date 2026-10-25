import type { Vec2 } from '@realmarket/shared';
import { cellToWorld, isFree, nearestFreeCell, worldToCell, type NavGrid } from './grid';

/** Basit ikili yığın (min-heap) — A* açık listesi için. */
class MinHeap {
  private items: number[] = [];
  private scores: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, score: number) {
    this.items.push(item);
    this.scores.push(score);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.scores[p] <= this.scores[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.items.length) {
      this.items[0] = lastItem;
      this.scores[0] = lastScore;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.scores[l] < this.scores[m]) m = l;
        if (r < this.items.length && this.scores[r] < this.scores[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

function octile(dc: number, dr: number) {
  const a = Math.abs(dc);
  const b = Math.abs(dr);
  return Math.max(a, b) + (SQRT2 - 1) * Math.min(a, b);
}

/**
 * 8 komşulu A* (köşe kesme yok, oktil sezgisel). Sonuç dünya koordinatlarında,
 * görüş hattı ile sadeleştirilmiş noktalar. Yol yoksa null.
 */
export function findPath(grid: NavGrid, start: Vec2, goal: Vec2, options: { smooth?: boolean } = {}): Vec2[] | null {
  const s0 = worldToCell(grid, start);
  const g0 = worldToCell(grid, goal);
  const s = nearestFreeCell(grid, s0.c, s0.r);
  const g = nearestFreeCell(grid, g0.c, g0.r);
  if (!s || !g) return null;

  const n = grid.cols * grid.rows;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const startIdx = s.r * grid.cols + s.c;
  const goalIdx = g.r * grid.cols + g.c;
  gScore[startIdx] = 0;
  const open = new MinHeap();
  open.push(startIdx, octile(g.c - s.c, g.r - s.r));

  while (open.size) {
    const cur = open.pop();
    if (cur === goalIdx) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const c = cur % grid.cols;
    const r = (cur - c) / grid.cols;
    for (const [dc, dr, cost] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!isFree(grid, nc, nr)) continue;
      // Çapraz harekette köşe kesmeyi engelle.
      if (dc !== 0 && dr !== 0 && (!isFree(grid, c + dc, r) || !isFree(grid, c, r + dr))) continue;
      const ni = nr * grid.cols + nc;
      if (closed[ni]) continue;
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni]) {
        gScore[ni] = tentative;
        came[ni] = cur;
        open.push(ni, tentative + octile(g.c - nc, g.r - nr));
      }
    }
  }
  if (startIdx !== goalIdx && came[goalIdx] === -1) return null;

  const cells: number[] = [];
  for (let at = goalIdx; at !== -1; at = came[at]) {
    cells.push(at);
    if (at === startIdx) break;
  }
  cells.reverse();
  const points = cells.map((idx) => {
    const c = idx % grid.cols;
    return cellToWorld(grid, c, (idx - c) / grid.cols);
  });
  return options.smooth === false ? points : smoothPath(grid, points);
}

/** İki nokta arasında engelsiz düz hat var mı (ızgara üzerinde örnekleme). */
export function lineOfSight(grid: NavGrid, a: Vec2, b: Vec2): boolean {
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(dist / (grid.cellSize * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cell = worldToCell(grid, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (!isFree(grid, cell.c, cell.r)) return false;
  }
  return true;
}

export function smoothPath(grid: NavGrid, points: Vec2[]): Vec2[] {
  if (points.length <= 2) return points;
  const out: Vec2[] = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (!lineOfSight(grid, points[anchor], points[i])) {
      out.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export function pathLength(points: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return len;
}

/**
 * Alışveriş listesi için durak sıralaması: en yakın komşu + 2-opt iyileştirme.
 * Mesafeler gerçek A* yol uzunluklarıdır. Ulaşılamayan duraklar sona eklenir.
 */
export function orderStops(grid: NavGrid, start: Vec2, stops: Vec2[]): { order: number[]; unreachable: number[] } {
  const pts = [start, ...stops];
  const n = pts.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) {
    dist[i][i] = 0;
    for (let j = i + 1; j < n; j++) {
      const p = findPath(grid, pts[i], pts[j]);
      const d = p ? pathLength(p) : Infinity;
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }
  const unreachable: number[] = [];
  const remaining = new Set<number>();
  for (let i = 1; i < n; i++) {
    if (dist[0][i] === Infinity) unreachable.push(i - 1);
    else remaining.add(i);
  }
  const route: number[] = [0];
  while (remaining.size) {
    const last = route[route.length - 1];
    let best = -1;
    for (const k of remaining) if (best === -1 || dist[last][k] < dist[last][best]) best = k;
    route.push(best);
    remaining.delete(best);
  }
  // 2-opt (başlangıç sabit, açık uçlu tur).
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const a = route[i - 1];
        const b = route[i];
        const c = route[j];
        const d = j + 1 < route.length ? route[j + 1] : -1;
        const before = dist[a][b] + (d >= 0 ? dist[c][d] : 0);
        const after = dist[a][c] + (d >= 0 ? dist[b][d] : 0);
        if (after + 1e-6 < before) {
          route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return { order: [...route.slice(1).map((i) => i - 1), ...unreachable], unreachable };
}
