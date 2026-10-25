import * as THREE from 'three';
import { buildProductGeometry, type Detail } from '@realmarket/product-modeler';
import type { PackagingType, SceneProduct } from '@realmarket/shared';
import { getLabelTexture } from './textures';

interface Finish {
  label: { roughness: number; metalness: number };
  body: { roughness: number; metalness: number; transparent?: boolean; opacity?: number };
  cap: { roughness: number; metalness: number };
}

const FINISH: Partial<Record<PackagingType, Finish>> = {
  pet_bottle: { label: { roughness: 0.35, metalness: 0 }, body: { roughness: 0.08, metalness: 0, transparent: true, opacity: 0.82 }, cap: { roughness: 0.45, metalness: 0 } },
  glass_bottle: { label: { roughness: 0.45, metalness: 0 }, body: { roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.88 }, cap: { roughness: 0.3, metalness: 0.9 } },
  jar: { label: { roughness: 0.5, metalness: 0 }, body: { roughness: 0.05, metalness: 0.05 }, cap: { roughness: 0.3, metalness: 0.8 } },
  beverage_can: { label: { roughness: 0.22, metalness: 0.65 }, body: { roughness: 0.25, metalness: 0.95 }, cap: { roughness: 0.25, metalness: 0.95 } },
  tin_can: { label: { roughness: 0.55, metalness: 0 }, body: { roughness: 0.28, metalness: 0.9 }, cap: { roughness: 0.3, metalness: 0.9 } },
  spray: { label: { roughness: 0.25, metalness: 0.55 }, body: { roughness: 0.25, metalness: 0.9 }, cap: { roughness: 0.35, metalness: 0 } },
  chips_bag: { label: { roughness: 0.28, metalness: 0.25 }, body: { roughness: 0.3, metalness: 0.2 }, cap: { roughness: 0.4, metalness: 0 } },
  biscuit_pack: { label: { roughness: 0.3, metalness: 0.15 }, body: { roughness: 0.4, metalness: 0 }, cap: { roughness: 0.3, metalness: 0.2 } },
  fruit: { label: { roughness: 0.42, metalness: 0 }, body: { roughness: 0.5, metalness: 0 }, cap: { roughness: 0.8, metalness: 0 } },
  vegetable: { label: { roughness: 0.38, metalness: 0 }, body: { roughness: 0.5, metalness: 0 }, cap: { roughness: 0.8, metalness: 0 } },
};
const DEFAULT_FINISH: Finish = { label: { roughness: 0.55, metalness: 0 }, body: { roughness: 0.35, metalness: 0 }, cap: { roughness: 0.4, metalness: 0 } };

const materialCache = new Map<string, THREE.MeshStandardMaterial[]>();

/** Ürün malzemeleri [etiket, gövde, kapak] — aynı ürünün tüm kopyaları paylaşır. */
export function getProductMaterials(p: SceneProduct): THREE.MeshStandardMaterial[] {
  const key = `${p.id}:${p.images.length}:${p.appearance.primaryColor}`;
  const hit = materialCache.get(key);
  if (hit) return hit;
  const f = FINISH[p.packagingType] ?? DEFAULT_FINISH;
  const a = p.appearance;
  const mats = [
    new THREE.MeshStandardMaterial({ map: getLabelTexture(p), ...f.label }),
    new THREE.MeshStandardMaterial({
      color: a.bodyColor ?? (p.packagingType === 'beverage_can' || p.packagingType === 'tin_can' || p.packagingType === 'spray' ? '#c8ccd0' : a.primaryColor),
      roughness: f.body.roughness,
      metalness: f.body.metalness,
      transparent: f.body.transparent ?? false,
      opacity: f.body.opacity ?? 1,
    }),
    new THREE.MeshStandardMaterial({ color: a.capColor ?? a.accentColor, ...f.cap }),
  ];
  materialCache.set(key, mats);
  return mats;
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

/** Ürün geometrisi (LOD seviyesine göre) — aynı ürün için tek kopya. */
export function getProductGeometry(p: SceneProduct, detail: Detail): THREE.BufferGeometry {
  const d = p.dimensions ?? { widthMm: 80, heightMm: 200, depthMm: 80 };
  const key = `${p.id}:${detail}:${d.widthMm}x${d.heightMm}x${d.depthMm}:${p.packagingType}`;
  const hit = geometryCache.get(key);
  if (hit) return hit;
  const g = buildProductGeometry({
    packagingType: p.packagingType,
    width: d.widthMm / 1000,
    height: d.heightMm / 1000,
    depth: d.depthMm / 1000,
    shapeVariant: p.appearance.shapeVariant,
    detail,
  });
  geometryCache.set(key, g);
  return g;
}

/** Ortak sahne malzemeleri (raflar, soğutucular, kasalar). */
export function createFixtureMaterials() {
  return {
    steel: new THREE.MeshStandardMaterial({ color: '#e4e6e8', roughness: 0.38, metalness: 0.55 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: '#4b5157', roughness: 0.45, metalness: 0.6 }),
    back: new THREE.MeshStandardMaterial({ color: '#d5d8dc', roughness: 0.6, metalness: 0.2 }),
    base: new THREE.MeshStandardMaterial({ color: '#2f3337', roughness: 0.55, metalness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: '#f3f4f5', roughness: 0.3, metalness: 0.15 }),
    interior: new THREE.MeshStandardMaterial({ color: '#dfe6ee', roughness: 0.25, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: '#dff2ff', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
    wood: new THREE.MeshStandardMaterial({ color: '#a8763e', roughness: 0.75, metalness: 0 }),
    darkWood: new THREE.MeshStandardMaterial({ color: '#5b3b20', roughness: 0.8, metalness: 0 }),
    counter: new THREE.MeshStandardMaterial({ color: '#e8e2d6', roughness: 0.45, metalness: 0.05 }),
    belt: new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.85, metalness: 0 }),
    priceRail: new THREE.MeshStandardMaterial({ color: '#f7f7f7', roughness: 0.5, metalness: 0 }),
    red: new THREE.MeshStandardMaterial({ color: '#d7263d', roughness: 0.45, metalness: 0.1 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#ffcc00', roughness: 0.45, metalness: 0.05 }),
    lightStrip: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
    screen: new THREE.MeshBasicMaterial({ color: '#2b7de9', toneMapped: false }),
    scanner: new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false }),
  };
}
export type FixtureMaterials = ReturnType<typeof createFixtureMaterials>;
