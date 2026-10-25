import { z } from 'zod';
import type { FixtureKind } from './enums.js';

/** Parametrik mağaza üretimi girdileri (metre). */
export const storeLayoutParamsSchema = z.object({
  widthM: z.number().min(18).max(120).default(32),
  lengthM: z.number().min(18).max(120).default(30),
  ceilingHeightM: z.number().min(3).max(10).default(4.6),
  gondolaCount: z.number().int().min(1).max(30).default(6),
  bayCount: z.number().int().min(2).max(20).default(8),
  bayWidthM: z.number().min(0.6).max(2).default(1.25),
  aisleWidthM: z.number().min(1).max(6).default(2.4),
  checkoutCount: z.number().int().min(1).max(12).default(3),
  /** Giriş kapısının ön duvardaki merkez konumu (x, metre). Boşsa sağ taraf. */
  entranceX: z.number().optional(),
  /** Çıkış kapısının ön duvardaki merkez konumu (x, metre). Boşsa kasaların yanı. */
  exitX: z.number().optional(),
  seed: z.number().int().default(42),
});
export type StoreLayoutParams = z.infer<typeof storeLayoutParamsSchema>;

export interface Vec2 {
  x: number;
  z: number;
}

export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export type LayoutObjectType =
  | 'gondola'
  | 'cooler'
  | 'open_chiller'
  | 'produce_table'
  | 'promo_stand'
  | 'checkout'
  | 'cart_corral'
  | 'door'
  | 'wall'
  | 'sign';

/** Mağazadaki statik nesne. position = taban merkezi; rotationY radyan. */
export interface LayoutObject {
  id: string;
  type: LayoutObjectType;
  position: Vec2;
  rotationY: number;
  size: { x: number; y: number; z: number };
  departmentCode?: string;
  meta?: Record<string, unknown>;
}

/**
 * Raf birimi (planogram birimi). Yerel koordinat: +x genişlik (soldan sağa),
 * +z ön yüz (koridora bakan), y yukarı. position = taban izdüşümünün merkezi.
 */
export interface ShelfFixture {
  id: string;
  kind: FixtureKind;
  departmentCode: string;
  parentId: string;
  position: Vec2;
  rotationY: number;
  widthM: number;
  depthM: number;
  heightM: number;
  levels: { index: number; heightM: number; clearanceM: number; depthM: number; zOffsetM: number }[];
  /** Müşterinin rafa erişim noktası (navigasyon hedefi). */
  accessPoint: Vec2;
}

export interface Department {
  code: string;
  name: string;
  color: string;
  area: Rect;
}

export interface CheckoutLane {
  id: string;
  counterId: string;
  /** Kasa bölgesi: oyuncu burada iken ödeme başlatılabilir. */
  zone: Rect;
  scannerPosition: Vec2;
}

export interface StoreLayout {
  version: 1;
  params: StoreLayoutParams;
  objects: LayoutObject[];
  shelves: ShelfFixture[];
  departments: Department[];
  checkouts: CheckoutLane[];
  /** Yürünemez alanlar (navigasyon ve çarpışma). */
  obstacles: Rect[];
  spawn: { position: Vec2; rotationY: number };
  cartSpawn: { position: Vec2; rotationY: number };
  issues: { severity: 'error' | 'warning'; message: string }[];
}
