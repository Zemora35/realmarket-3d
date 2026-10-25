import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PackagingType } from '@realmarket/shared';
import { ATLAS, atlasBox, disc, flatFaces, pillow, ringBody, type Ring } from './primitives';

/** Malzeme yuvaları: 0 = etiket/doku, 1 = gövde, 2 = kapak/aksesuar. */
export const MATERIAL_SLOTS = ['label', 'body', 'cap'] as const;
export type MaterialSlot = 0 | 1 | 2;

export type Detail = 'high' | 'low';

export interface ProductModelSpec {
  packagingType: PackagingType;
  /** metre */
  width: number;
  height: number;
  depth: number;
  shapeVariant?: string;
  detail?: Detail;
}

interface Part {
  geo: THREE.BufferGeometry;
  mat: MaterialSlot;
}

const SEG = { high: 28, low: 10 } as const;

/** [yükseklik oranı, yarıçap oranı] çiftlerinden halka listesi. */
function prof(R: number, h: number, pts: [number, number][]): Ring[] {
  return pts.map(([yf, rf]) => ({ y: yf * h, a: rf * R }));
}
/** Elips kesitli profil: a = R·rf·sx, b = R·rf·sz */
function eprof(ax: number, bz: number, h: number, pts: [number, number][], n = 2, cx = 0): Ring[] {
  return pts.map(([yf, rf]) => ({ y: yf * h, a: rf * ax, b: rf * bz, n, cx }));
}

function lathe(rings: Ring[], seg: number, mat: MaterialSlot, opts: { lobes?: number; lobeAmp?: number } = {}): Part {
  return { geo: ringBody(rings, { segments: seg, ...opts }), mat };
}
function cap(ring: Ring, seg: number, mat: MaterialSlot, up = true): Part {
  return { geo: disc(ring, seg, up), mat };
}

// --- Ambalaj şablonları ----------------------------------------------------

function petBottle(w: number, h: number, d: number, seg: number): Part[] {
  const R = Math.min(w, d) / 2;
  return [
    lathe(prof(R, h, [[0, 0.8], [0.015, 0.96], [0.04, 1], [0.11, 1], [0.125, 0.95], [0.14, 1], [0.22, 1]]), seg, 1),
    cap({ y: 0, a: 0.8 * R }, seg, 1, false),
    lathe(prof(R, h, [[0.22, 1], [0.41, 1], [0.6, 1]]), seg, 0),
    lathe(
      prof(R, h, [[0.6, 1], [0.66, 1], [0.72, 0.93], [0.78, 0.74], [0.83, 0.52], [0.86, 0.37], [0.87, 0.35], [0.875, 0.45], [0.885, 0.45], [0.89, 0.36]]),
      seg,
      1,
    ),
    lathe(prof(R, h, [[0.89, 0.4], [0.9, 0.42], [1, 0.42]]), seg, 2),
    cap({ y: h, a: 0.42 * R }, seg, 2),
  ];
}

function glassBottle(w: number, h: number, d: number, seg: number): Part[] {
  const R = Math.min(w, d) / 2;
  return [
    lathe(prof(R, h, [[0, 0.88], [0.02, 1], [0.08, 1]]), seg, 1),
    cap({ y: 0.004 * h, a: 0.88 * R }, seg, 1, false),
    lathe(prof(R, h, [[0.08, 1], [0.45, 1]]), seg, 0),
    lathe(prof(R, h, [[0.45, 1], [0.55, 1], [0.64, 0.86], [0.72, 0.5], [0.76, 0.36], [0.9, 0.32], [0.92, 0.37], [0.93, 0.33]]), seg, 1),
    lathe(prof(R, h, [[0.93, 0.4], [1, 0.4]]), seg, 2),
    cap({ y: h, a: 0.4 * R }, seg, 2),
  ];
}

function beverageCan(w: number, h: number, d: number, seg: number): Part[] {
  const R = Math.min(w, d) / 2;
  return [
    lathe(prof(R, h, [[0, 0.82], [0.03, 0.96], [0.06, 1]]), seg, 1),
    cap({ y: 0.01 * h, a: 0.82 * R }, seg, 1, false),
    lathe(prof(R, h, [[0.06, 1], [0.88, 1]]), seg, 0),
    lathe(prof(R, h, [[0.88, 1], [0.95, 0.87], [0.985, 0.85], [1, 0.86], [1, 0.8], [0.985, 0.8]]), seg, 1),
    cap({ y: 0.985 * h, a: 0.8 * R }, seg, 1),
  ];
}

function tinCan(w: number, h: number, d: number, seg: number): Part[] {
  const R = Math.min(w, d) / 2;
  return [
    lathe(prof(R, h, [[0, 0.95], [0.015, 1], [0.03, 1]]), seg, 1),
    cap({ y: 0.006 * h, a: 0.95 * R }, seg, 1, false),
    lathe(prof(R, h, [[0.03, 1], [0.97, 1]]), seg, 0),
    lathe(prof(R, h, [[0.97, 1], [0.985, 1], [1, 0.97], [0.99, 0.93]]), seg, 1),
    cap({ y: 0.99 * h, a: 0.93 * R }, seg, 1),
  ];
}

function yogurtCup(w: number, h: number, d: number, seg: number): Part[] {
  const R = Math.min(w, d) / 2;
  return [
    cap({ y: 0, a: 0.76 * R }, seg, 1, false),
    lathe(prof(R, h, [[0, 0.76], [0.9, 0.95]]), seg, 0),
    lathe(prof(R, h, [[0.9, 0.95], [0.93, 1], [0.97, 1]]), seg, 1),
    cap({ y: 0.97 * h, a: R }, seg, 2),
  ];
}

function jar(w: number, h: number, d: number, seg: number): Part[] {
  const R = Math.min(w, d) / 2;
  return [
    lathe(prof(R, h, [[0, 0.86], [0.02, 0.98], [0.06, 1], [0.15, 1]]), seg, 1),
    cap({ y: 0.003 * h, a: 0.86 * R }, seg, 1, false),
    lathe(prof(R, h, [[0.15, 1], [0.7, 1]]), seg, 0),
    lathe(prof(R, h, [[0.7, 1], [0.78, 0.95], [0.83, 0.87], [0.84, 0.86]]), seg, 1),
    lathe(prof(R, h, [[0.84, 0.92], [0.99, 0.92], [1, 0.9]]), seg, 2, { lobes: 40, lobeAmp: 0.008 }),
    cap({ y: h, a: 0.9 * R }, seg, 2),
  ];
}

function shampooBottle(w: number, h: number, d: number, seg: number): Part[] {
  const a = w / 2;
  const b = d / 2;
  const n = 2.6;
  return [
    lathe(eprof(a, b, h, [[0, 0.86], [0.02, 0.97], [0.06, 1], [0.12, 1]], n), seg, 1),
    cap({ y: 0, a: 0.86 * a, b: 0.86 * b, n }, seg, 1, false),
    lathe(eprof(a, b, h, [[0.12, 1], [0.68, 1]], n), seg, 0),
    lathe(eprof(a, b, h, [[0.68, 1], [0.75, 0.97], [0.8, 0.86], [0.82, 0.62]], n), seg, 1),
    lathe(eprof(a * 0.62, b * 0.86, h, [[0.82, 1], [0.97, 1], [1, 0.94]], 2.2), seg, 2),
    cap({ y: h, a: 0.62 * a * 0.94, b: 0.86 * b * 0.94, n: 2.2 }, seg, 2),
  ];
}

function detergentBottle(w: number, h: number, d: number, seg: number): Part[] {
  const a = w / 2;
  const b = d / 2;
  const n = 4;
  const capX = 0.22 * w;
  const parts: Part[] = [
    lathe(eprof(a, b, h, [[0, 0.92], [0.02, 0.99], [0.05, 1], [0.12, 1]], n), seg, 1),
    cap({ y: 0, a: 0.92 * a, b: 0.92 * b, n }, seg, 1, false),
    lathe(eprof(a, b, h, [[0.12, 1], [0.66, 1]], n), seg, 0),
    lathe(
      [
        { y: 0.66 * h, a, b, n },
        { y: 0.72 * h, a: 0.96 * a, b: 0.97 * b, n },
        { y: 0.8 * h, a: 0.7 * a, b: 0.85 * b, n, cx: 0.08 * w },
        { y: 0.86 * h, a: 0.42 * a, b: 0.6 * b, n: 2.4, cx: capX },
      ],
      seg,
      1,
    ),
    cap({ y: 0.86 * h, a: 0.42 * a, b: 0.6 * b, n: 2.4, cx: capX }, seg, 1),
    lathe(
      [
        { y: 0.86 * h, a: 0.16 * w, b: 0.16 * w, cx: capX },
        { y: 1.0 * h, a: 0.16 * w, b: 0.16 * w, cx: capX },
      ],
      seg,
      2,
      { lobes: 24, lobeAmp: 0.03 },
    ),
    cap({ y: h, a: 0.16 * w, cx: capX }, seg, 2),
  ];
  // Taşıma sapı: yarım torus, sol üstte.
  const handle = new THREE.TorusGeometry(0.13 * h, Math.min(0.11 * d, 0.022), 8, Math.max(8, seg / 2), Math.PI);
  handle.translate(-0.18 * w, 0.68 * h, 0);
  parts.push({ geo: handle, mat: 1 });
  return parts;
}

function milkCarton(w: number, h: number, d: number, seg: number): Part[] {
  const hb = h * 0.8;
  const hr = h * 0.15;
  const hf = h * 0.05;
  const body = atlasBox(w, hb, d);
  const top = hb + hr;
  const roof = flatFaces(
    [
      [
        [-w / 2, hb, d / 2],
        [w / 2, hb, d / 2],
        [w / 2, top, 0],
        [-w / 2, top, 0],
      ],
      [
        [w / 2, hb, -d / 2],
        [-w / 2, hb, -d / 2],
        [-w / 2, top, 0],
        [w / 2, top, 0],
      ],
      [
        [-w / 2, hb, -d / 2],
        [-w / 2, hb, d / 2],
        [-w / 2, top, 0],
      ],
      [
        [w / 2, hb, d / 2],
        [w / 2, hb, -d / 2],
        [w / 2, top, 0],
      ],
    ],
    ATLAS.top,
  );
  const fin = new THREE.BoxGeometry(w, hf, 0.004);
  fin.translate(0, top + hf / 2, 0);
  const capR = Math.min(w, d) * 0.17;
  const capGeo = new THREE.CylinderGeometry(capR, capR, 0.014, Math.max(8, seg / 2));
  // kapak eğik ön yüzün normaline hizalanır: n = (0, d/2, hr)
  const phi = Math.atan2(hr, d / 2);
  const nLen = Math.hypot(d / 2, hr);
  capGeo.rotateX(phi);
  capGeo.translate(w * 0.15, hb + hr * 0.5 + (0.006 * (d / 2)) / nLen, d / 4 + (0.006 * hr) / nLen);
  return [
    { geo: body, mat: 0 },
    { geo: roof, mat: 0 },
    { geo: fin, mat: 1 },
    { geo: capGeo, mat: 2 },
  ];
}

function cartonBox(w: number, h: number, d: number): Part[] {
  return [{ geo: atlasBox(w, h, d), mat: 0 }];
}

function bag(w: number, h: number, d: number, kind: 'chips' | 'pasta' | 'pouch', detail: Detail): Part[] {
  const hi = detail === 'high';
  const cfg = {
    chips: { seal: 0.05, pu: 0.35, pv: 0.45, gusset: false },
    pasta: { seal: 0.035, pu: 0.12, pv: 0.14, gusset: false },
    pouch: { seal: 0.06, pu: 0.3, pv: 0.5, gusset: true },
  }[kind];
  const { surfaces, bottom } = pillow({ w, h, d, nx: hi ? 16 : 6, ny: hi ? 20 : 8, ...cfg });
  const parts: Part[] = surfaces.map((geo) => ({ geo, mat: 0 as MaterialSlot }));
  if (bottom) parts.push({ geo: bottom, mat: 1 });
  return parts;
}

/** Yatay rulo (bisküvi), x ekseni boyunca uzanır. */
function biscuitRoll(w: number, h: number, d: number, seg: number): Part[] {
  const L = w;
  const R = Math.min(h, d) / 2;
  const parts: Part[] = [
    lathe(prof(R, L, [[0, 0.25], [0.035, 0.6], [0.07, 0.93]]), seg, 2, { lobes: 18, lobeAmp: 0.06 }),
    cap({ y: 0, a: 0.25 * R }, seg, 2, false),
    lathe(prof(R, L, [[0.07, 0.93], [0.08, 1], [0.92, 1], [0.93, 0.93]]), seg, 0),
    lathe(prof(R, L, [[0.93, 0.93], [0.965, 0.6], [1, 0.25]]), seg, 2, { lobes: 18, lobeAmp: 0.06 }),
    cap({ y: L, a: 0.25 * R }, seg, 2),
  ];
  return layDown(parts);
}

/** Yatay tüp (diş macunu): kapak ucu yuvarlak, diğer uç yassı kaynak. */
function tube(w: number, h: number, d: number, seg: number): Part[] {
  const L = w;
  const R = h / 2;
  const B = d / 2;
  const bodyRings: Ring[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    bodyRings.push({ y: (0.1 + 0.83 * t) * L, a: R * (1 - 0.9 * t ** 1.4), b: R + (B - R) * t });
  }
  const parts: Part[] = [
    lathe(
      [
        { y: 0, a: 0.4 * R },
        { y: 0.07 * L, a: 0.4 * R },
      ],
      seg,
      2,
      { lobes: 20, lobeAmp: 0.05 },
    ),
    cap({ y: 0, a: 0.4 * R }, seg, 2, false),
    lathe(
      [
        { y: 0.07 * L, a: 0.5 * R },
        { y: 0.1 * L, a: R },
      ],
      seg,
      1,
    ),
    lathe(bodyRings, seg, 0),
  ];
  const seal = new THREE.BoxGeometry(0.003, 0.07 * L, 2 * B);
  seal.translate(0, 0.965 * L, 0);
  parts.push({ geo: seal, mat: 1 });
  return layDown(parts);
}

function spray(w: number, h: number, d: number, seg: number): Part[] {
  const R = Math.min(w, d) / 2;
  return [
    lathe(prof(R, h, [[0, 0.9], [0.02, 1], [0.03, 1]]), seg, 1),
    cap({ y: 0.005 * h, a: 0.9 * R }, seg, 1, false),
    lathe(prof(R, h, [[0.03, 1], [0.74, 1]]), seg, 0),
    lathe(prof(R, h, [[0.74, 1], [0.78, 0.94], [0.8, 0.9]]), seg, 1),
    lathe(prof(R, h, [[0.8, 0.95], [0.97, 0.95], [1, 0.85]]), seg, 2),
    cap({ y: h, a: 0.85 * R }, seg, 2),
  ];
}

/** Uzun ekseni y olan parçaları x eksenine yatırır (yükseklik → genişlik). */
function layDown(parts: Part[]): Part[] {
  for (const p of parts) p.geo.rotateZ(-Math.PI / 2);
  return parts;
}

function fruit(w: number, h: number, d: number, variant: string, seg: number): Part[] {
  const R = 0.5;
  switch (variant) {
    case 'banana': {
      const rings: Ring[] = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const r = R * Math.max(0.12, Math.sin(Math.PI * t) ** 0.55) * 0.18;
        rings.push({ y: t, a: r, b: r, n: 3 });
      }
      const body = ringBody(rings, { segments: Math.max(6, seg / 2) });
      // muz kavisi: eksen x boyunca uzanır, uçlar yukarı kıvrılır
      const pos = body.getAttribute('position') as THREE.BufferAttribute;
      const bend = 1.1;
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i);
        const ang = (t - 0.5) * bend;
        const rad = 1 / bend - pos.getX(i);
        pos.setXYZ(i, Math.sin(ang) * rad, (1 - Math.cos(ang) * rad * bend) / bend, pos.getZ(i));
      }
      pos.needsUpdate = true;
      body.computeVertexNormals();
      const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.06, 6);
      stem.rotateZ(bend / 2 - Math.PI / 2);
      stem.translate(Math.sin(bend / 2) / bend + 0.02, (1 - Math.cos(bend / 2)) / bend + 0.012, 0);
      return [
        { geo: body, mat: 0 },
        { geo: stem, mat: 2 },
      ];
    }
    case 'lemon':
    case 'cucumber': {
      const pts: [number, number][] = [];
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const base = variant === 'lemon' ? Math.sin(Math.PI * t) ** 0.75 : Math.max(0.08, Math.sin(Math.PI * t) ** 0.25);
        pts.push([t, base]);
      }
      const parts: Part[] = [
        lathe(prof(R, 1, pts), seg, 0, variant === 'cucumber' ? { lobes: 7, lobeAmp: 0.03 } : {}),
      ];
      if (variant === 'cucumber') parts.push(cap({ y: 1, a: 0.08 * R }, seg, 2));
      return layDown(parts);
    }
    case 'tomato': {
      const pts: [number, number][] = [];
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const phi = (i / N) * Math.PI;
        pts.push([(1 - Math.cos(phi)) / 2 - 0.04 * Math.exp(-(((phi - Math.PI) / 0.45) ** 2)), Math.sin(phi)]);
      }
      const calyx = new THREE.ConeGeometry(0.14, 0.05, 5);
      calyx.translate(0, 0.97, 0);
      return [
        lathe(prof(R, 1, pts), seg, 0, { lobes: 5, lobeAmp: 0.05 }),
        { geo: calyx, mat: 2 },
      ];
    }
    case 'orange': {
      const pts: [number, number][] = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const phi = (i / N) * Math.PI;
        pts.push([(1 - Math.cos(phi)) / 2, Math.sin(phi)]);
      }
      return [lathe(prof(R, 1, pts), seg, 0), cap({ y: 1.0, a: 0.06 }, 8, 2)];
    }
    default: {
      // elma: üstte ve altta çukur
      const pts: [number, number][] = [
        [0.03, 0.001],
        [0.0, 0.22],
        [0.04, 0.5],
        [0.14, 0.78],
        [0.3, 0.95],
        [0.5, 1],
        [0.68, 0.97],
        [0.84, 0.84],
        [0.95, 0.6],
        [0.985, 0.32],
        [0.93, 0.12],
        [0.9, 0.001],
      ];
      const stem = new THREE.CylinderGeometry(0.018, 0.025, 0.2, 5);
      stem.translate(0.02, 0.9, 0);
      return [lathe(prof(R, 1, pts), seg, 0), { geo: stem, mat: 2 }];
    }
  }
}

/** Parçaları birleştirir; malzeme gruplarını ardışık tutar ve sonucu ölçülere tam oturtur. */
function assemble(parts: Part[], w: number, h: number, d: number): THREE.BufferGeometry {
  const sorted = [...parts].sort((a, b) => a.mat - b.mat);
  const geos = sorted.map((p) => {
    const g = p.geo;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    return g;
  });
  const merged = mergeGeometries(geos, true);
  if (!merged) throw new Error('Geometri birleştirilemedi');
  // grupları malzeme yuvasına göre birleştir
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  merged.groups.forEach((gr, i) => {
    const mat = sorted[i].mat;
    const last = groups[groups.length - 1];
    if (last && last.materialIndex === mat && last.start + last.count === gr.start) last.count += gr.count;
    else groups.push({ start: gr.start, count: gr.count, materialIndex: mat });
  });
  merged.clearGroups();
  for (const g of groups) merged.addGroup(g.start, g.count, g.materialIndex);
  for (const g of geos) g.dispose();
  return fitToDims(merged, w, h, d);
}

/** Sınır kutusunu tam olarak (w, h, d) yapar; taban y=0, x/z merkezli. */
export function fitToDims(g: THREE.BufferGeometry, w: number, h: number, d: number): THREE.BufferGeometry {
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const center = new THREE.Vector3();
  bb.getCenter(center);
  g.translate(-center.x, -bb.min.y, -center.z);
  g.scale(w / (size.x || 1), h / (size.y || 1), d / (size.z || 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * Parametrik ambalaj modeli üretir. Aynı spec => aynı geometri (deterministik).
 * Sonuç gruplu BufferGeometry'dir: grup materialIndex'i MATERIAL_SLOTS'a karşılık gelir.
 */
export function buildProductGeometry(spec: ProductModelSpec): THREE.BufferGeometry {
  const { width: w, height: h, depth: d } = spec;
  if (!(w > 0 && h > 0 && d > 0)) throw new Error('Ürün ölçüleri pozitif olmalı');
  const detail = spec.detail ?? 'high';
  const seg = SEG[detail];
  let parts: Part[];
  switch (spec.packagingType) {
    case 'pet_bottle':
      parts = petBottle(w, h, d, seg);
      break;
    case 'glass_bottle':
      parts = glassBottle(w, h, d, seg);
      break;
    case 'beverage_can':
      parts = beverageCan(w, h, d, seg);
      break;
    case 'tin_can':
      parts = tinCan(w, h, d, seg);
      break;
    case 'yogurt_cup':
      parts = yogurtCup(w, h, d, seg);
      break;
    case 'jar':
      parts = jar(w, h, d, seg);
      break;
    case 'shampoo_bottle':
      parts = shampooBottle(w, h, d, seg);
      break;
    case 'detergent_bottle':
      parts = detergentBottle(w, h, d, seg);
      break;
    case 'milk_carton':
      parts = milkCarton(w, h, d, seg);
      break;
    case 'chips_bag':
      parts = bag(w, h, d, 'chips', detail);
      break;
    case 'pasta_pack':
      parts = bag(w, h, d, 'pasta', detail);
      break;
    case 'pouch':
      parts = bag(w, h, d, 'pouch', detail);
      break;
    case 'biscuit_pack':
      parts = biscuitRoll(w, h, d, seg);
      break;
    case 'tube':
      parts = tube(w, h, d, seg);
      break;
    case 'spray':
      parts = spray(w, h, d, seg);
      break;
    case 'fruit':
    case 'vegetable':
      parts = fruit(w, h, d, spec.shapeVariant ?? (spec.packagingType === 'fruit' ? 'apple' : 'tomato'), detail === 'high' ? 18 : 8);
      break;
    case 'carton_box':
    case 'custom':
    default:
      parts = cartonBox(w, h, d);
  }
  return assemble(parts, w, h, d);
}

export interface GeometryValidation {
  ok: boolean;
  triangleCount: number;
  sizeMm: { width: number; height: number; depth: number };
  maxScaleErrorPct: number;
  issues: string[];
}

/** Ölçek ve poligon bütçesi doğrulaması (kalite kontrolü). */
export function validateProductGeometry(
  geometry: THREE.BufferGeometry,
  expectedMm: { widthMm: number; heightMm: number; depthMm: number },
  budget = { maxTriangles: 6000 },
): GeometryValidation {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  const sizeMm = { width: size.x * 1000, height: size.y * 1000, depth: size.z * 1000 };
  const errs = [
    Math.abs(sizeMm.width - expectedMm.widthMm) / expectedMm.widthMm,
    Math.abs(sizeMm.height - expectedMm.heightMm) / expectedMm.heightMm,
    Math.abs(sizeMm.depth - expectedMm.depthMm) / expectedMm.depthMm,
  ];
  const maxScaleErrorPct = Math.max(...errs) * 100;
  const triangleCount = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
  const issues: string[] = [];
  if (maxScaleErrorPct > 2) issues.push(`Model ölçeği hatalı (sapma %${maxScaleErrorPct.toFixed(1)})`);
  if (triangleCount > budget.maxTriangles) issues.push(`Aşırı poligon: ${triangleCount} üçgen (bütçe ${budget.maxTriangles})`);
  const uv = geometry.getAttribute('uv');
  if (!uv) issues.push('UV koordinatları eksik');
  else {
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (!Number.isFinite(u) || !Number.isFinite(v) || u < -0.01 || u > 1.01 || v < -0.01 || v > 1.01) {
        issues.push('Bozuk UV: [0,1] aralığı dışında değer');
        break;
      }
    }
  }
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
      issues.push('Geometride geçersiz (NaN) köşe');
      break;
    }
  }
  return { ok: issues.length === 0, triangleCount, sizeMm, maxScaleErrorPct, issues };
}
