import * as THREE from 'three';
import type { LayoutObject, SceneData, ShelfFixture } from '@realmarket/shared';
import type { FixtureMaterials } from '@realmarket/engine-3d';

export type MatKey = keyof FixtureMaterials;

/** Tek bir kutu parçası (dünya koordinatı, taban değil merkez). */
export interface BoxPart {
  mat: MatKey;
  pos: [number, number, number];
  size: [number, number, number];
  rotY: number;
}

export interface PriceTagPart {
  productId: string;
  pos: [number, number, number];
  rotY: number;
}

export interface CoolerDoor {
  id: string;
  /** Menteşe konumu (dünya) */
  hinge: [number, number, number];
  rotY: number;
  width: number;
  height: number;
}

export interface SignPart {
  id: string;
  text: string;
  color: string;
  pos: [number, number, number];
  rotY: number;
  size: [number, number];
  doubleSided: boolean;
  hanging: boolean;
}

export interface FixtureParts {
  boxes: BoxPart[];
  priceTags: PriceTagPart[];
  coolerDoors: CoolerDoor[];
  signs: SignPart[];
  staticCarts: { pos: [number, number, number]; rotY: number }[];
}

/** Nesne-yerel (x sağ, z ön) kutuyu dünya parçasına çevirir. */
function localBox(
  o: { position: { x: number; z: number }; rotationY: number },
  mat: MatKey,
  center: [number, number, number],
  size: [number, number, number],
): BoxPart {
  const c = Math.cos(o.rotationY);
  const s = Math.sin(o.rotationY);
  const [lx, ly, lz] = center;
  return { mat, pos: [o.position.x + lx * c + lz * s, ly, o.position.z - lx * s + lz * c], size, rotY: o.rotationY };
}

function localPoint(o: { position: { x: number; z: number }; rotationY: number }, lx: number, ly: number, lz: number): [number, number, number] {
  const c = Math.cos(o.rotationY);
  const s = Math.sin(o.rotationY);
  return [o.position.x + lx * c + lz * s, ly, o.position.z - lx * s + lz * c];
}

function gondola(o: LayoutObject, out: FixtureParts) {
  const D = o.size.x;
  const L = o.size.z;
  const H = o.size.y;
  const bays = Number(o.meta?.bays ?? 8);
  const bayW = Number(o.meta?.bayWidthM ?? L / bays);
  out.boxes.push(localBox(o, 'back', [0, H / 2 + 0.06, 0], [0.04, H - 0.12, L]));
  out.boxes.push(localBox(o, 'darkSteel', [0, H + 0.02, 0], [0.09, 0.05, L]));
  for (const sx of [-1, 1]) out.boxes.push(localBox(o, 'base', [sx * (D / 4 + 0.025), 0.06, 0], [D / 2 - 0.05, 0.12, L]));
  for (let b = 0; b <= bays; b++) {
    out.boxes.push(localBox(o, 'darkSteel', [0, H / 2, -L / 2 + b * bayW], [0.07, H, 0.035]));
  }
  for (const sz of [-1, 1]) out.boxes.push(localBox(o, 'steel', [0, H / 2, sz * (L / 2 + 0.015)], [D, H, 0.03]));
}

function shelfBoards(shelf: ShelfFixture, out: FixtureParts, opts: { rail: boolean; inset?: number }) {
  const inset = opts.inset ?? 0.006;
  for (const l of shelf.levels) {
    const depth = l.depthM + 0.02;
    const cz = shelf.depthM / 2 - l.zOffsetM - depth / 2;
    out.boxes.push(localBox(shelf, shelf.kind === 'produce_table' ? 'wood' : 'steel', [0, l.heightM - 0.0125, cz], [shelf.widthM - inset * 2, 0.025, depth]));
    if (opts.rail) {
      out.boxes.push(localBox(shelf, 'priceRail', [0, l.heightM - 0.03, shelf.depthM / 2 - l.zOffsetM + 0.008], [shelf.widthM - inset * 2, 0.045, 0.012]));
    }
  }
}

function cooler(o: LayoutObject, shelf: ShelfFixture | undefined, out: FixtureParts) {
  const W = o.size.x;
  const H = o.size.y;
  const D = o.size.z;
  for (const sx of [-1, 1]) out.boxes.push(localBox(o, 'white', [sx * (W / 2 - 0.03), H / 2, 0], [0.06, H, D]));
  out.boxes.push(localBox(o, 'white', [0, H - 0.11, 0], [W, 0.22, D]));
  out.boxes.push(localBox(o, 'base', [0, 0.07, 0.02], [W, 0.14, D - 0.04]));
  out.boxes.push(localBox(o, 'interior', [0, H / 2, -D / 2 + 0.025], [W - 0.1, H, 0.05]));
  out.boxes.push(localBox(o, 'lightStrip', [0, H - 0.11, D / 2 + 0.002], [W - 0.2, 0.05, 0.004]));
  const doors = 3;
  const dw = (W - 0.12) / doors;
  for (let i = 0; i < doors; i++) {
    out.coolerDoors.push({ id: `${o.id}-d${i}`, hinge: localPoint(o, -W / 2 + 0.06 + i * dw, 0.15, D / 2 + 0.02), rotY: o.rotationY, width: dw, height: H - 0.38 });
    // dikmelerde LED aydınlatma
    out.boxes.push(localBox(o, 'lightStrip', [-W / 2 + 0.06 + i * dw, H / 2, D / 2 - 0.06], [0.015, H - 0.5, 0.01]));
  }
  if (shelf) shelfBoards(shelf, out, { rail: true, inset: 0.07 });
}

function openChiller(o: LayoutObject, shelf: ShelfFixture | undefined, out: FixtureParts) {
  const W = o.size.x;
  const H = o.size.y;
  const D = o.size.z;
  for (const sx of [-1, 1]) out.boxes.push(localBox(o, 'white', [sx * (W / 2 - 0.03), H / 2, -0.05], [0.06, H, D - 0.1]));
  out.boxes.push(localBox(o, 'white', [0, H - 0.12, -D / 2 + 0.25], [W, 0.24, 0.5]));
  out.boxes.push(localBox(o, 'lightStrip', [0, H - 0.245, -D / 2 + 0.3], [W - 0.15, 0.01, 0.08]));
  out.boxes.push(localBox(o, 'white', [0, 0.11, 0.02], [W, 0.22, D - 0.04]));
  out.boxes.push(localBox(o, 'darkSteel', [0, 0.235, D / 2 - 0.03], [W, 0.03, 0.06]));
  out.boxes.push(localBox(o, 'interior', [0, H / 2, -D / 2 + 0.025], [W - 0.1, H, 0.05]));
  if (shelf) shelfBoards({ ...shelf, levels: shelf.levels.filter((l) => l.index > 0) }, out, { rail: true, inset: 0.07 });
  if (shelf) {
    const l0 = shelf.levels[0];
    if (l0) out.boxes.push(localBox(shelf, 'priceRail', [0, l0.heightM - 0.03, shelf.depthM / 2 + 0.008], [shelf.widthM - 0.14, 0.045, 0.012]));
  }
}

function produceTable(o: LayoutObject, shelf: ShelfFixture | undefined, out: FixtureParts) {
  const W = o.size.x;
  const D = o.size.z;
  out.boxes.push(localBox(o, 'darkWood', [0, 0.325, 0], [W, 0.65, D]));
  if (!shelf) return;
  for (const l of shelf.levels) {
    const cz = D / 2 - l.zOffsetM - l.depthM / 2;
    const platform = l.heightM - 0.65 - 0.012;
    if (platform > 0.01) out.boxes.push(localBox(o, 'darkWood', [0, 0.65 + platform / 2, cz], [W, platform, l.depthM]));
    out.boxes.push(localBox(o, 'wood', [0, l.heightM - 0.006, cz], [W - 0.02, 0.012, l.depthM - 0.02]));
    out.boxes.push(localBox(o, 'wood', [0, l.heightM + 0.04, cz + l.depthM / 2 - 0.01], [W, 0.1, 0.02]));
    out.boxes.push(localBox(o, 'wood', [0, l.heightM + 0.05, cz - l.depthM / 2 + 0.01], [W, 0.12, 0.02]));
    for (const sx of [-1, 0, 1]) out.boxes.push(localBox(o, 'wood', [(sx * (W - 0.02)) / 2, l.heightM + 0.05, cz], [0.02, 0.12, l.depthM]));
    out.boxes.push(localBox(o, 'priceRail', [0, l.heightM + 0.065, cz + l.depthM / 2 + 0.002], [W, 0.05, 0.006]));
  }
}

function promoStand(o: LayoutObject, shelf: ShelfFixture | undefined, out: FixtureParts) {
  const W = o.size.x;
  const H = o.size.y;
  const D = o.size.z;
  out.boxes.push(localBox(o, 'red', [0, 0.15, 0], [W, 0.3, D]));
  out.boxes.push(localBox(o, 'red', [0, H / 2 + 0.25, -D / 2 + 0.02], [W, H + 0.5, 0.04]));
  for (const sx of [-1, 1]) out.boxes.push(localBox(o, 'red', [sx * (W / 2 - 0.015), H / 2, 0], [0.03, H, D]));
  if (shelf) shelfBoards({ ...shelf, levels: shelf.levels.filter((l) => l.index > 0) }, out, { rail: true, inset: 0.035 });
  out.signs.push({
    id: `${o.id}-sign`,
    text: 'KAMPANYA',
    color: '#e8a400',
    pos: localPoint(o, 0, H + 0.3, -D / 2 + 0.05),
    rotY: o.rotationY,
    size: [W, 0.32],
    doubleSided: false,
    hanging: false,
  });
}

function checkout(o: LayoutObject, out: FixtureParts) {
  const W = o.size.x;
  const L = o.size.z;
  const H = 0.88;
  out.boxes.push(localBox(o, 'counter', [0, H / 2, 0], [W, H, L]));
  out.boxes.push(localBox(o, 'base', [0, 0.05, 0], [W + 0.02, 0.1, L + 0.02]));
  out.boxes.push(localBox(o, 'belt', [0.05, H + 0.01, L / 4], [W - 0.25, 0.02, L / 2 - 0.1]));
  out.boxes.push(localBox(o, 'darkSteel', [0.05, H + 0.005, -0.25], [W - 0.25, 0.012, 0.36]));
  out.boxes.push(localBox(o, 'scanner', [0.05, H + 0.013, -0.25], [0.18, 0.004, 0.12]));
  out.boxes.push(localBox(o, 'darkSteel', [-0.15, H + 0.18, -0.25], [0.05, 0.34, 0.05]));
  out.boxes.push(localBox(o, 'base', [-0.15, H + 0.38, -0.25], [0.04, 0.22, 0.3]));
  out.boxes.push(localBox(o, 'screen', [-0.125, H + 0.38, -0.25], [0.004, 0.18, 0.26]));
  out.boxes.push(localBox(o, 'counter', [0.05, H - 0.1, -L / 2 + 0.3], [W - 0.1, 0.03, 0.55]));
  out.boxes.push(localBox(o, 'darkSteel', [-W / 2 + 0.04, 1.2, -L / 2 + 0.12], [0.05, 2.4, 0.05]));
  out.signs.push({
    id: `${o.id}-num`,
    text: `KASA ${o.meta?.number ?? ''}`,
    color: '#1d4ed8',
    pos: localPoint(o, -W / 2 + 0.04, 2.45, -L / 2 + 0.12),
    rotY: 0,
    size: [0.7, 0.24],
    doubleSided: true,
    hanging: false,
  });
}

function cartCorral(o: LayoutObject, out: FixtureParts) {
  const W = o.size.x;
  const L = o.size.z;
  for (const sx of [-1, 1]) out.boxes.push(localBox(o, 'steel', [sx * (W / 2 - 0.02), 0.9, 0], [0.04, 0.04, L]));
  for (const sz of [-1, 1]) out.boxes.push(localBox(o, 'steel', [0, 0.45, sz * (L / 2 - 0.02)], [W, 0.9, 0.04]));
  for (let i = 0; i < 3; i++) {
    const p = localPoint(o, 0, 0, -L / 2 + 0.7 + i * 0.32);
    out.staticCarts.push({ pos: p, rotY: o.rotationY + Math.PI });
  }
}

/** Yerleşim + planogram yuvalarından tüm sabit 3D parçaları üretir. */
export function buildFixtureParts(scene: SceneData): FixtureParts {
  const out: FixtureParts = { boxes: [], priceTags: [], coolerDoors: [], signs: [], staticCarts: [] };
  const shelvesByParent = new Map<string, ShelfFixture[]>();
  for (const s of scene.layout.shelves) shelvesByParent.set(s.parentId, [...(shelvesByParent.get(s.parentId) ?? []), s]);
  for (const o of scene.layout.objects) {
    const shelf = shelvesByParent.get(o.id)?.[0];
    switch (o.type) {
      case 'gondola':
        gondola(o, out);
        for (const s of shelvesByParent.get(o.id) ?? []) shelfBoards(s, out, { rail: true });
        break;
      case 'cooler':
        cooler(o, shelf, out);
        break;
      case 'open_chiller':
        openChiller(o, shelf, out);
        break;
      case 'produce_table':
        produceTable(o, shelf, out);
        break;
      case 'promo_stand':
        promoStand(o, shelf, out);
        break;
      case 'checkout':
        checkout(o, out);
        break;
      case 'cart_corral':
        cartCorral(o, out);
        break;
      case 'sign': {
        const m = o.meta as { text: string; color: string; height: number; doubleSided: boolean; wallMounted?: boolean };
        out.signs.push({
          id: o.id,
          text: m.text,
          color: m.color,
          pos: [o.position.x, m.height, o.position.z],
          rotY: o.rotationY,
          size: [o.size.x, o.size.y],
          doubleSided: m.doubleSided,
          hanging: !m.wallMounted,
        });
        break;
      }
    }
  }
  // fiyat etiketleri: her yuva için ön rayda bir etiket
  const shelves = new Map(scene.layout.shelves.map((s) => [s.id, s]));
  for (const slot of scene.slots) {
    const shelf = shelves.get(slot.shelfId);
    if (!shelf) continue;
    const level = shelf.levels.find((l) => l.index === slot.levelIndex);
    if (!level) continue;
    const blockW = (slot.facings * slot.unitWidthMm + (slot.facings - 1) * 2) / 1000;
    const lx = -shelf.widthM / 2 + slot.xMm / 1000 + Math.min(blockW / 2, 0.06);
    const yTag = shelf.kind === 'produce_table' ? level.heightM + 0.065 : level.heightM - 0.03;
    const lz = shelf.depthM / 2 - level.zOffsetM + (shelf.kind === 'produce_table' ? 0.006 : 0.0155);
    out.priceTags.push({ productId: slot.productId, pos: localPoint(shelf, lx, yTag, lz), rotY: shelf.rotationY });
  }
  return out;
}

/** Kutu parçasını instance matrisine çevirir. */
export function boxMatrix(b: BoxPart, m = new THREE.Matrix4()) {
  return m.compose(
    new THREE.Vector3(...b.pos),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rotY),
    new THREE.Vector3(...b.size),
  );
}
