import * as THREE from 'three';
import { expandSlotUnits } from '@realmarket/planogram';
import type { SceneData, SceneProduct } from '@realmarket/shared';

/** Raftaki tek bir fiziksel ürün birimi. */
export interface Unit {
  idx: number;
  productId: string;
  storeProductId: string;
  slotId: string;
  shelfId: string;
  departmentCode: string;
  /** Taban merkezi (dünya). */
  pos: THREE.Vector3;
  yaw: number;
  /** Dünya eksenlerinde yarı boyutlar (AABB). */
  half: THREE.Vector3;
  matrix: THREE.Matrix4;
  taken: boolean;
  /** Rafın ön yüz normali; arka paneli olan raflarda (gondol, soğutucu) örtme testi için. */
  normal: { x: number; z: number } | null;
  /** Raf arka düzleminden bir nokta. */
  planeX: number;
  planeZ: number;
}

const CELL = 0.5;
export const MAX_DEPTH_ROWS = 2;
const key = (cx: number, cz: number) => `${cx},${cz}`;

/**
 * Sahnedeki tüm ürün birimleri. Her ürün için tek geometri/malzeme paylaşılır;
 * birimler instanced mesh'lerde gösterilir. Seçim için ışın–AABB testi + uzamsal ızgara.
 */
export class UnitRegistry {
  units: Unit[] = [];
  products = new Map<string, SceneProduct>();
  byProduct = new Map<string, number[]>();
  private grid = new Map<string, number[]>();
  private listeners = new Set<() => void>();
  version = 0;

  build(scene: SceneData) {
    this.units = [];
    this.byProduct.clear();
    this.grid.clear();
    this.products = new Map(scene.products.map((p) => [p.id, p]));
    const shelves = new Map(scene.layout.shelves.map((s) => [s.id, s]));
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (const slot of scene.slots) {
      const shelf = shelves.get(slot.shelfId);
      const product = this.products.get(slot.productId);
      if (!shelf || !product) continue;
      // Derinlikte yalnızca ön iki sıra çizilir; arkadakiler sanal stoktur (müşteri görmez).
      const rowSize = slot.facings * slot.stackCount;
      const local = expandSlotUnits(slot, shelf.widthM, shelf.depthM).slice(0, Math.min(slot.visibleUnits, rowSize * MAX_DEPTH_ROWS));
      const occludable = shelf.kind !== 'produce_table' && shelf.kind !== 'promo_stand';
      const c = Math.cos(shelf.rotationY);
      const s = Math.sin(shelf.rotationY);
      const swap = Math.abs(s) > 0.5;
      const hw = slot.unitWidthMm / 2000;
      const hh = slot.unitHeightMm / 2000;
      const hd = slot.unitDepthMm / 2000;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), shelf.rotationY);
      for (const u of local) {
        const pos = new THREE.Vector3(shelf.position.x + u.x * c + u.z * s, u.y, shelf.position.z - u.x * s + u.z * c);
        const unit: Unit = {
          idx: this.units.length,
          productId: product.id,
          storeProductId: product.storeProductId,
          slotId: slot.slotId,
          shelfId: shelf.id,
          departmentCode: shelf.departmentCode,
          pos,
          yaw: shelf.rotationY,
          half: new THREE.Vector3(swap ? hd : hw, hh, swap ? hw : hd),
          matrix: new THREE.Matrix4().compose(pos, q.clone(), scale),
          taken: false,
          normal: occludable ? { x: s, z: c } : null,
          planeX: shelf.position.x - (shelf.depthM / 2) * s,
          planeZ: shelf.position.z - (shelf.depthM / 2) * c,
        };
        this.units.push(unit);
        this.byProduct.set(product.id, [...(this.byProduct.get(product.id) ?? []), unit.idx]);
        const x0 = Math.floor((pos.x - unit.half.x) / CELL);
        const x1 = Math.floor((pos.x + unit.half.x) / CELL);
        const z0 = Math.floor((pos.z - unit.half.z) / CELL);
        const z1 = Math.floor((pos.z + unit.half.z) / CELL);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const k = key(cx, cz);
            const list = this.grid.get(k);
            if (list) list.push(unit.idx);
            else this.grid.set(k, [unit.idx]);
          }
        }
      }
    }
    this.version++;
    this.emit();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }

  setTaken(idx: number, taken: boolean) {
    const u = this.units[idx];
    if (!u || u.taken === taken) return;
    u.taken = taken;
    this.version++;
    this.emit();
  }

  /** Bir ürünün raftaki (alınmamış) birim sayısı. */
  shelfCount(productId: string) {
    return (this.byProduct.get(productId) ?? []).filter((i) => !this.units[i].taken).length;
  }

  /** Işın boyunca en yakın alınmamış birim (öne bakan ön sıra öncelikli doğal sonuç). */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): { idx: number; dist: number } | null {
    const seen = new Set<number>();
    let best: { idx: number; dist: number } | null = null;
    const steps = Math.ceil(maxDist / 0.1);
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * maxDist;
      const x = origin.x + dir.x * t;
      const z = origin.z + dir.z * t;
      const list = this.grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!list) continue;
      for (const idx of list) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        const u = this.units[idx];
        if (u.taken) continue;
        const d = rayAabb(origin, dir, u.pos.x - u.half.x, u.pos.y, u.pos.z - u.half.z, u.pos.x + u.half.x, u.pos.y + u.half.y * 2, u.pos.z + u.half.z);
        if (d !== null && d <= maxDist && (!best || d < best.dist)) best = { idx, dist: d };
      }
      if (best && best.dist < t - CELL) break;
    }
    return best;
  }
}

function rayAabb(o: THREE.Vector3, d: THREE.Vector3, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number | null {
  let tmin = 0;
  let tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [o.x, d.x, minX, maxX],
    [o.y, d.y, minY, maxY],
    [o.z, d.z, minZ, maxZ],
  ];
  for (const [oo, dd, mn, mx] of axes) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < mn || oo > mx) return null;
    } else {
      let t1 = (mn - oo) / dd;
      let t2 = (mx - oo) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export const registry = new UnitRegistry();
