import {
  storeLayoutParamsSchema,
  type CheckoutLane,
  type Department,
  type FixtureKind,
  type LayoutObject,
  type Rect,
  type ShelfFixture,
  type StoreLayout,
  type StoreLayoutParams,
  type Vec2,
} from '@realmarket/shared';
import { createGrid, floodFill, isReachable } from '@realmarket/navigation';
import { DEPARTMENTS, GONDOLA_DEPARTMENT_ORDER } from './departments';

/** Sabit ölçüler (metre) — gerçek market ekipmanlarına yakın değerler. */
export const DIMENSIONS = {
  gondolaFaceDepth: 0.5,
  gondolaBack: 0.1,
  gondolaHeight: 1.95,
  gondolaLevels: [0.12, 0.5, 0.88, 1.26, 1.64],
  coolerWidth: 2.5,
  coolerDepth: 0.85,
  coolerHeight: 2.1,
  coolerLevels: [0.18, 0.56, 0.94, 1.32, 1.7],
  chillerLevels: [0.22, 0.62, 0.98, 1.34, 1.66],
  produceWidth: 2.4,
  produceDepth: 1.2,
  promoWidth: 1.2,
  promoDepth: 0.6,
  promoHeight: 1.5,
  promoLevels: [0.3, 0.75, 1.15],
  checkoutLength: 3.0,
  checkoutWidth: 0.8,
  checkoutLane: 1.4,
  doorWidth: 2.4,
  /** Alışveriş arabası genişliği (0.56 m) + omuz payı. */
  minAisleForCart: 1.5,
} as const;

/** Tekrarlanabilir sözde rastgele sayı üreteci (aynı seed => aynı mağaza). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function rectOf(center: Vec2, sizeX: number, sizeZ: number, rotationY: number): Rect {
  // Yalnızca 90° katı dönüşler kullanıldığı için eksen hizalı dikdörtgen yeterli.
  const swap = Math.abs(Math.sin(rotationY)) > 0.5;
  const hx = (swap ? sizeZ : sizeX) / 2;
  const hz = (swap ? sizeX : sizeZ) / 2;
  return { minX: round(center.x - hx), maxX: round(center.x + hx), minZ: round(center.z - hz), maxZ: round(center.z + hz) };
}

/** Yerel fixture koordinatını (x sağa, z öne) dünya koordinatına çevirir. */
export function fixtureLocalToWorld(f: Pick<ShelfFixture, 'position' | 'rotationY'>, lx: number, lz: number): Vec2 {
  const c = Math.cos(f.rotationY);
  const s = Math.sin(f.rotationY);
  return { x: f.position.x + lx * c + lz * s, z: f.position.z - lx * s + lz * c };
}

function levelsFor(heights: readonly number[], top: number, depth: number, topClearance = 0.32) {
  return heights.map((h, i) => ({
    index: i,
    heightM: h,
    clearanceM: round(i + 1 < heights.length ? heights[i + 1] - h - 0.03 : Math.min(topClearance, top - h + 0.3)),
    depthM: depth,
    zOffsetM: 0,
  }));
}

/**
 * Parametrelerden deterministik mağaza yerleşimi üretir.
 * Koordinatlar: x ∈ [0, genişlik] (soldan sağa), z ∈ [0, uzunluk] (ön duvardan arkaya), y yukarı.
 */
export function generateStoreLayout(input: Partial<StoreLayoutParams> = {}): StoreLayout {
  const params = storeLayoutParamsSchema.parse(input);
  const rand = mulberry32(params.seed);
  const issues: StoreLayout['issues'] = [];
  const objects: LayoutObject[] = [];
  const shelves: ShelfFixture[] = [];
  const obstacles: Rect[] = [];
  const W = params.widthM;
  const L = params.lengthM;
  const D = DIMENSIONS;

  if (params.aisleWidthM < D.minAisleForCart) {
    issues.push({
      severity: 'error',
      message: `Koridor genişliği ${params.aisleWidthM} m: alışveriş arabası için en az ${D.minAisleForCart} m gerekli.`,
    });
  }

  // --- Duvarlar ve kapılar -------------------------------------------------
  const checkoutBlock = params.checkoutCount * (D.checkoutWidth + D.checkoutLane);
  const entranceX = round(params.entranceX ?? W - 4.5);
  const exitX = round(params.exitX ?? Math.min(W / 2, 1.5 + checkoutBlock + 1.6));
  if (Math.abs(entranceX - exitX) < D.doorWidth + 0.4) {
    issues.push({ severity: 'error', message: 'Giriş ve çıkış kapıları çakışıyor.' });
  }
  const wallT = 0.2;
  const H = params.ceilingHeightM;
  const openings = [
    { x: Math.min(entranceX, exitX), w: D.doorWidth },
    { x: Math.max(entranceX, exitX), w: D.doorWidth },
  ];
  let cursor = 0;
  openings.forEach((o, i) => {
    const start = o.x - o.w / 2;
    if (start > cursor + 0.01) {
      objects.push({
        id: `wall-front-${i}`,
        type: 'wall',
        position: { x: round((cursor + start) / 2), z: -wallT / 2 },
        rotationY: 0,
        size: { x: round(start - cursor), y: H, z: wallT },
      });
    }
    cursor = o.x + o.w / 2;
  });
  objects.push({
    id: 'wall-front-end',
    type: 'wall',
    position: { x: round((cursor + W) / 2), z: -wallT / 2 },
    rotationY: 0,
    size: { x: round(W - cursor), y: H, z: wallT },
  });
  objects.push(
    { id: 'wall-back', type: 'wall', position: { x: W / 2, z: L + wallT / 2 }, rotationY: 0, size: { x: W + 2 * wallT, y: H, z: wallT } },
    { id: 'wall-left', type: 'wall', position: { x: -wallT / 2, z: L / 2 }, rotationY: 0, size: { x: wallT, y: H, z: L } },
    { id: 'wall-right', type: 'wall', position: { x: W + wallT / 2, z: L / 2 }, rotationY: 0, size: { x: wallT, y: H, z: L } },
    {
      id: 'door-entrance',
      type: 'door',
      position: { x: entranceX, z: 0 },
      rotationY: 0,
      size: { x: D.doorWidth, y: 2.4, z: 0.1 },
      meta: { kind: 'entrance', label: 'GİRİŞ' },
    },
    {
      id: 'door-exit',
      type: 'door',
      position: { x: exitX, z: 0 },
      rotationY: 0,
      size: { x: D.doorWidth, y: 2.4, z: 0.1 },
      meta: { kind: 'exit', label: 'ÇIKIŞ' },
    },
  );

  // --- Arka duvar soğutucuları --------------------------------------------
  const coolerCount = Math.floor((W - 2) / D.coolerWidth);
  const coolerStart = (W - coolerCount * D.coolerWidth) / 2;
  for (let i = 0; i < coolerCount; i++) {
    const dairy = i < Math.ceil(coolerCount / 2);
    const kind: FixtureKind = dairy ? 'open_chiller' : 'cooler';
    const departmentCode = dairy ? 'SUT_URUNLERI' : 'ICECEK';
    const position = { x: round(coolerStart + (i + 0.5) * D.coolerWidth), z: round(L - 0.05 - D.coolerDepth / 2) };
    const id = `C${String(i + 1).padStart(2, '0')}`;
    const rotationY = Math.PI;
    objects.push({
      id,
      type: kind,
      position,
      rotationY,
      size: { x: D.coolerWidth, y: D.coolerHeight, z: D.coolerDepth },
      departmentCode,
    });
    obstacles.push(rectOf(position, D.coolerWidth, D.coolerDepth, rotationY));
    shelves.push({
      id,
      kind,
      departmentCode,
      parentId: id,
      position,
      rotationY,
      widthM: D.coolerWidth,
      depthM: round(D.coolerDepth - 0.2),
      heightM: D.coolerHeight,
      levels: levelsFor(dairy ? D.chillerLevels : D.coolerLevels, D.coolerHeight, round(D.coolerDepth - 0.25), 0.3),
      accessPoint: { x: position.x, z: round(position.z - D.coolerDepth / 2 - 0.8) },
    });
  }

  // --- Gondol sıraları ------------------------------------------------------
  const gondolaDepth = D.gondolaFaceDepth * 2 + D.gondolaBack;
  let gondolaCount = params.gondolaCount;
  while (gondolaCount > 1 && gondolaCount * gondolaDepth + (gondolaCount + 1) * params.aisleWidthM > W - 1) {
    gondolaCount--;
  }
  if (gondolaCount !== params.gondolaCount) {
    issues.push({
      severity: 'warning',
      message: `Mağaza genişliği ${params.gondolaCount} gondole yetmiyor; ${gondolaCount} gondol yerleştirildi.`,
    });
  }
  const backAisle = Math.max(params.aisleWidthM, 2.6);
  const gz1 = L - 0.05 - D.coolerDepth - backAisle;
  const minFront = 12.5;
  let bayCount = params.bayCount;
  while (bayCount > 2 && gz1 - bayCount * params.bayWidthM < minFront) bayCount--;
  if (bayCount !== params.bayCount) {
    issues.push({
      severity: 'warning',
      message: `Mağaza uzunluğu ${params.bayCount} raf bölmesine yetmiyor; gondol başına ${bayCount} bölme kullanıldı.`,
    });
  }
  const gondolaLength = bayCount * params.bayWidthM;
  const gz0 = gz1 - gondolaLength;
  if (gz0 < minFront - 0.01) issues.push({ severity: 'error', message: 'Mağaza uzunluğu gondol yerleşimi için yetersiz.' });
  const totalSpan = gondolaCount * gondolaDepth + (gondolaCount - 1) * params.aisleWidthM;
  const gx0 = (W - totalSpan) / 2;

  for (let g = 0; g < gondolaCount; g++) {
    const cx = round(gx0 + gondolaDepth / 2 + g * (gondolaDepth + params.aisleWidthM));
    const dept = GONDOLA_DEPARTMENT_ORDER[Math.floor((g * GONDOLA_DEPARTMENT_ORDER.length) / gondolaCount)];
    const gid = `G${g + 1}`;
    const center = { x: cx, z: round((gz0 + gz1) / 2) };
    objects.push({
      id: gid,
      type: 'gondola',
      position: center,
      rotationY: 0,
      size: { x: gondolaDepth, y: D.gondolaHeight, z: round(gondolaLength) },
      departmentCode: dept,
      meta: { bays: bayCount, bayWidthM: params.bayWidthM },
    });
    obstacles.push(rectOf(center, gondolaDepth, gondolaLength, 0));
    objects.push({
      id: `sign-${gid}`,
      type: 'sign',
      position: center,
      rotationY: Math.PI / 2,
      size: { x: 2.4, y: 0.6, z: 0.05 },
      departmentCode: dept,
      meta: { text: DEPARTMENTS[dept].name, height: 3.2, color: DEPARTMENTS[dept].color, doubleSided: true },
    });
    for (const side of ['A', 'B'] as const) {
      const dir = side === 'A' ? -1 : 1;
      const rotationY = (dir * Math.PI) / 2;
      for (let b = 0; b < bayCount; b++) {
        // A yüzünde yerel +x dünya +z'ye, B yüzünde dünya -z'ye bakar; bölme numarası soldan sağa artar.
        const bz = side === 'A' ? gz0 + (b + 0.5) * params.bayWidthM : gz1 - (b + 0.5) * params.bayWidthM;
        const position = { x: round(cx + dir * (D.gondolaBack / 2 + D.gondolaFaceDepth / 2)), z: round(bz) };
        shelves.push({
          id: `${gid}-${side}-${String(b + 1).padStart(2, '0')}`,
          kind: 'gondola',
          departmentCode: dept,
          parentId: gid,
          position,
          rotationY,
          widthM: params.bayWidthM,
          depthM: D.gondolaFaceDepth,
          heightM: D.gondolaHeight,
          levels: levelsFor(D.gondolaLevels, D.gondolaHeight, round(D.gondolaFaceDepth - 0.04)),
          accessPoint: { x: round(cx + dir * (gondolaDepth / 2 + 0.8)), z: round(bz) },
        });
      }
    }
  }

  // --- Meyve-sebze masaları ----------------------------------------------
  const frontCross = 2.6;
  const pz1 = gz0 - frontCross;
  const pzMid = pz1 - D.produceDepth;
  const produceX0 = W / 2 + 0.5;
  const produceGap = 1.8;
  const produceCount = Math.max(1, Math.floor((W - 1.5 - produceX0 + produceGap) / (D.produceWidth + produceGap)));
  for (let i = 0; i < produceCount; i++) {
    const x = round(produceX0 + D.produceWidth / 2 + i * (D.produceWidth + produceGap));
    for (const [row, rotationY, z] of [
      // sırt sırta iki masa: öndeki girişe (-z), arkadaki gondollara (+z) bakar
      [0, Math.PI, pzMid - D.produceDepth / 2],
      [1, 0, pzMid + D.produceDepth / 2],
    ] as const) {
      const id = `P${i + 1}${row === 0 ? 'A' : 'B'}`;
      const position = { x, z: round(z) };
      objects.push({
        id,
        type: 'produce_table',
        position,
        rotationY,
        size: { x: D.produceWidth, y: 0.95, z: D.produceDepth },
        departmentCode: 'MEYVE_SEBZE',
      });
      obstacles.push(rectOf(position, D.produceWidth, D.produceDepth, rotationY));
      const front = fixtureLocalToWorld({ position, rotationY }, 0, D.produceDepth / 2 + 0.8);
      shelves.push({
        id,
        kind: 'produce_table',
        departmentCode: 'MEYVE_SEBZE',
        parentId: id,
        position,
        rotationY,
        widthM: D.produceWidth,
        depthM: D.produceDepth,
        heightM: 0.95,
        levels: [
          { index: 0, heightM: 0.74, clearanceM: 0.3, depthM: 0.58, zOffsetM: 0 },
          { index: 1, heightM: 0.86, clearanceM: 0.3, depthM: 0.58, zOffsetM: 0.6 },
        ],
        accessPoint: { x: round(front.x), z: round(front.z) },
      });
    }
  }
  objects.push({
    id: 'sign-produce',
    type: 'sign',
    position: { x: round(produceX0 + (produceCount * (D.produceWidth + produceGap) - produceGap) / 2), z: round(pzMid) },
    rotationY: 0,
    size: { x: 3, y: 0.7, z: 0.05 },
    departmentCode: 'MEYVE_SEBZE',
    meta: { text: DEPARTMENTS.MEYVE_SEBZE.name, height: 3.0, color: DEPARTMENTS.MEYVE_SEBZE.color, doubleSided: true },
  });

  // --- Kasalar -----------------------------------------------------------
  const checkouts: CheckoutLane[] = [];
  for (let i = 0; i < params.checkoutCount; i++) {
    const cx = round(1.5 + D.checkoutWidth / 2 + i * (D.checkoutWidth + D.checkoutLane));
    const center = { x: cx, z: 4.0 };
    const id = `K${i + 1}`;
    objects.push({
      id,
      type: 'checkout',
      position: center,
      rotationY: 0,
      size: { x: D.checkoutWidth, y: 0.9, z: D.checkoutLength },
      meta: { number: i + 1 },
    });
    obstacles.push(rectOf(center, D.checkoutWidth, D.checkoutLength, 0));
    const laneMinX = cx + D.checkoutWidth / 2;
    checkouts.push({
      id: `lane-${i + 1}`,
      counterId: id,
      zone: { minX: round(laneMinX), maxX: round(laneMinX + D.checkoutLane), minZ: 2.3, maxZ: 6.2 },
      scannerPosition: { x: round(cx + 0.15), z: 3.4 },
    });
  }
  for (const door of [entranceX, exitX]) {
    if (door + D.doorWidth / 2 > 1.5 && door - D.doorWidth / 2 < 1.5 + checkoutBlock) {
      issues.push({ severity: 'warning', message: `Kapı (x=${door}) kasa bloğunun önüne denk geliyor.` });
    }
  }
  objects.push({
    id: 'sign-checkout',
    type: 'sign',
    position: { x: round(1.5 + checkoutBlock / 2), z: 6.6 },
    rotationY: 0,
    size: { x: 2.6, y: 0.6, z: 0.05 },
    meta: { text: 'KASALAR', height: 3.0, color: '#1b1b1b', doubleSided: true },
  });

  // --- Araba alanı ve kampanya standları -----------------------------------
  const corral = { x: round(W - 1.2), z: 3.2 };
  objects.push({ id: 'cart-corral', type: 'cart_corral', position: corral, rotationY: 0, size: { x: 1.0, y: 1.0, z: 3.4 } });
  obstacles.push(rectOf(corral, 1.0, 3.4, 0));

  const promoCandidates = [round(1.5 + checkoutBlock + 2.0), round(W / 2 - 2.5), round(W / 2 + 4.5)];
  // seed ile kampanya standı sırası belirlenir (tekrarlanabilir).
  const promoOrder = promoCandidates.map((x) => ({ x, k: rand() })).sort((a, b) => a.k - b.k);
  promoOrder.slice(0, 2).forEach((p, i) => {
    const id = `PR${i + 1}`;
    const position = { x: p.x, z: 7.6 };
    if (Math.abs(position.x - entranceX) < 2.2) return;
    objects.push({
      id,
      type: 'promo_stand',
      position,
      rotationY: Math.PI,
      size: { x: D.promoWidth, y: D.promoHeight, z: D.promoDepth },
      departmentCode: 'PROMOSYON',
    });
    obstacles.push(rectOf(position, D.promoWidth, D.promoDepth, Math.PI));
    shelves.push({
      id,
      kind: 'promo_stand',
      departmentCode: 'PROMOSYON',
      parentId: id,
      position,
      rotationY: Math.PI,
      widthM: D.promoWidth,
      depthM: D.promoDepth,
      heightM: D.promoHeight,
      levels: levelsFor(D.promoLevels, D.promoHeight, round(D.promoDepth - 0.05)),
      accessPoint: { x: position.x, z: round(position.z - D.promoDepth / 2 - 0.8) },
    });
  });

  // --- Reyon alanları --------------------------------------------------------
  const deptMap = new Map<string, Rect>();
  for (const s of shelves) {
    const r = rectOf(s.position, s.widthM, s.depthM, s.rotationY);
    const cur = deptMap.get(s.departmentCode);
    deptMap.set(
      s.departmentCode,
      cur
        ? { minX: Math.min(cur.minX, r.minX), minZ: Math.min(cur.minZ, r.minZ), maxX: Math.max(cur.maxX, r.maxX), maxZ: Math.max(cur.maxZ, r.maxZ) }
        : r,
    );
  }
  const departments: Department[] = [...deptMap.entries()].map(([code, area]) => ({
    code,
    name: DEPARTMENTS[code]?.name ?? code,
    color: DEPARTMENTS[code]?.color ?? '#888888',
    area,
  }));
  for (const d of departments) {
    if (d.code === 'SUT_URUNLERI' || (d.code === 'ICECEK' && !objects.some((o) => o.id === 'sign-cooler-ICECEK'))) {
      objects.push({
        id: `sign-cooler-${d.code}`,
        type: 'sign',
        position: { x: round((d.area.minX + d.area.maxX) / 2), z: round(L - 0.12) },
        rotationY: Math.PI,
        size: { x: 3, y: 0.6, z: 0.05 },
        departmentCode: d.code,
        meta: { text: d.name, height: 2.75, color: d.color, doubleSided: false, wallMounted: true },
      });
    }
  }

  const spawn = { position: { x: entranceX, z: 1.6 }, rotationY: 0 };
  const cartSpawn = { position: { x: entranceX, z: 2.55 }, rotationY: 0 };

  // --- Erişilebilirlik doğrulaması (araba genişliği ile) -------------------
  const grid = createGrid({ minX: 0, minZ: 0, maxX: W, maxZ: L }, obstacles, { cellSize: 0.25, inflate: 0.4 });
  const reach = floodFill(grid, spawn.position);
  const unreachable = shelves.filter((s) => !isReachable(grid, reach, s.accessPoint));
  if (unreachable.length) {
    issues.push({
      severity: 'error',
      message: `Arabayla ulaşılamayan raflar: ${unreachable
        .slice(0, 8)
        .map((s) => s.id)
        .join(', ')}${unreachable.length > 8 ? '…' : ''}`,
    });
  }
  for (const lane of checkouts) {
    const center = { x: (lane.zone.minX + lane.zone.maxX) / 2, z: (lane.zone.minZ + lane.zone.maxZ) / 2 };
    if (!isReachable(grid, reach, center)) issues.push({ severity: 'error', message: `Kasa ${lane.counterId} erişilemez.` });
  }

  return { version: 1, params, objects, shelves, departments, checkouts, obstacles, spawn, cartSpawn, issues };
}
