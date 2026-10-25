import { describe, expect, it } from 'vitest';
import { createGrid, floodFill, isReachable } from './grid';
import { findPath, lineOfSight, orderStops, pathLength } from './astar';

const bounds = { minX: 0, minZ: 0, maxX: 10, maxZ: 10 };

describe('A* yol bulma', () => {
  it('engelsiz alanda düz yol bulur', () => {
    const grid = createGrid(bounds, [], { inflate: 0.3 });
    const path = findPath(grid, { x: 1, z: 1 }, { x: 9, z: 1 })!;
    expect(path).not.toBeNull();
    expect(path.length).toBe(2);
    expect(pathLength(path)).toBeCloseTo(8, 0);
  });

  it('duvarın etrafından dolaşır', () => {
    const wall = { minX: 4.5, minZ: 0, maxX: 5.5, maxZ: 8 };
    const grid = createGrid(bounds, [wall], { inflate: 0.3 });
    const path = findPath(grid, { x: 2, z: 2 }, { x: 8, z: 2 })!;
    expect(path).not.toBeNull();
    expect(pathLength(path)).toBeGreaterThan(12);
    for (let i = 1; i < path.length; i++) expect(lineOfSight(grid, path[i - 1], path[i])).toBe(true);
  });

  it('kapalı alana ulaşılamazsa null döner', () => {
    const box = [
      { minX: 6, minZ: 6, maxX: 10, maxZ: 6.5 },
      { minX: 6, minZ: 6, maxX: 6.5, maxZ: 10 },
    ];
    const grid = createGrid(bounds, box, { inflate: 0.3 });
    expect(findPath(grid, { x: 1, z: 1 }, { x: 8.5, z: 8.5 })).toBeNull();
    const reach = floodFill(grid, { x: 1, z: 1 });
    expect(isReachable(grid, reach, { x: 8.5, z: 8.5 })).toBe(false);
    expect(isReachable(grid, reach, { x: 3, z: 3 })).toBe(true);
  });

  it('alışveriş listesi duraklarını kısa tura göre sıralar', () => {
    const grid = createGrid(bounds, [], { inflate: 0.3 });
    const { order } = orderStops(grid, { x: 1, z: 1 }, [
      { x: 9, z: 9 },
      { x: 2, z: 2 },
      { x: 5, z: 5 },
    ]);
    expect(order).toEqual([1, 2, 0]);
  });
});
