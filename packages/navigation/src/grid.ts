import type { Rect, Vec2 } from '@realmarket/shared';

/** Mağaza zemininin yürünebilirlik ızgarası. blocked[i] = 1 ise geçilemez. */
export interface NavGrid {
  cols: number;
  rows: number;
  cellSize: number;
  originX: number;
  originZ: number;
  blocked: Uint8Array;
}

export function createGrid(
  bounds: Rect,
  obstacles: Rect[],
  options: { cellSize?: number; inflate?: number } = {},
): NavGrid {
  const cellSize = options.cellSize ?? 0.25;
  const inflate = options.inflate ?? 0.35;
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);
  const blocked = new Uint8Array(cols * rows);
  const grid: NavGrid = { cols, rows, cellSize, originX: bounds.minX, originZ: bounds.minZ, blocked };

  // Duvarlara yakın şerit (oyuncu yarıçapı) yürünemez.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = bounds.minX + (c + 0.5) * cellSize;
      const z = bounds.minZ + (r + 0.5) * cellSize;
      if (x < bounds.minX + inflate || x > bounds.maxX - inflate || z < bounds.minZ + inflate || z > bounds.maxZ - inflate) {
        blocked[r * cols + c] = 1;
      }
    }
  }
  for (const o of obstacles) markRect(grid, o, inflate);
  return grid;
}

export function markRect(grid: NavGrid, rect: Rect, inflate = 0): void {
  const c0 = Math.max(0, Math.floor((rect.minX - inflate - grid.originX) / grid.cellSize));
  const c1 = Math.min(grid.cols - 1, Math.floor((rect.maxX + inflate - grid.originX) / grid.cellSize));
  const r0 = Math.max(0, Math.floor((rect.minZ - inflate - grid.originZ) / grid.cellSize));
  const r1 = Math.min(grid.rows - 1, Math.floor((rect.maxZ + inflate - grid.originZ) / grid.cellSize));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid.blocked[r * grid.cols + c] = 1;
}

export function worldToCell(grid: NavGrid, p: Vec2): { c: number; r: number } {
  return {
    c: Math.min(grid.cols - 1, Math.max(0, Math.floor((p.x - grid.originX) / grid.cellSize))),
    r: Math.min(grid.rows - 1, Math.max(0, Math.floor((p.z - grid.originZ) / grid.cellSize))),
  };
}

export function cellToWorld(grid: NavGrid, c: number, r: number): Vec2 {
  return { x: grid.originX + (c + 0.5) * grid.cellSize, z: grid.originZ + (r + 0.5) * grid.cellSize };
}

export function isFree(grid: NavGrid, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && grid.blocked[r * grid.cols + c] === 0;
}

/** Engelli bir hücreye en yakın serbest hücreyi BFS ile bulur. */
export function nearestFreeCell(grid: NavGrid, c: number, r: number, maxRadius = 40): { c: number; r: number } | null {
  if (isFree(grid, c, r)) return { c, r };
  for (let radius = 1; radius <= maxRadius; radius++) {
    let best: { c: number; r: number; d: number } | null = null;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        if (!isFree(grid, c + dc, r + dr)) continue;
        const d = dc * dc + dr * dr;
        if (!best || d < best.d) best = { c: c + dc, r: r + dr, d };
      }
    }
    if (best) return { c: best.c, r: best.r };
  }
  return null;
}

/** Başlangıçtan ulaşılabilen hücreleri işaretler (bağlantılılık doğrulaması için). */
export function floodFill(grid: NavGrid, start: Vec2): Uint8Array {
  const seen = new Uint8Array(grid.cols * grid.rows);
  const s = worldToCell(grid, start);
  const first = nearestFreeCell(grid, s.c, s.r);
  if (!first) return seen;
  const queue: number[] = [first.r * grid.cols + first.c];
  seen[queue[0]] = 1;
  while (queue.length) {
    const idx = queue.pop()!;
    const c = idx % grid.cols;
    const r = (idx - c) / grid.cols;
    const neighbors = [
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ];
    for (const [nc, nr] of neighbors) {
      if (!isFree(grid, nc, nr)) continue;
      const ni = nr * grid.cols + nc;
      if (seen[ni]) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

export function isReachable(grid: NavGrid, reach: Uint8Array, p: Vec2): boolean {
  const cell = worldToCell(grid, p);
  const free = nearestFreeCell(grid, cell.c, cell.r, 4);
  return !!free && reach[free.r * grid.cols + free.c] === 1;
}
