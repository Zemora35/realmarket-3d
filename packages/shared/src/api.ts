import type { SceneProduct } from './product.js';
import type { SlotPlacement } from './planogram.js';
import type { StoreLayout } from './layout.js';

/** Sahnede gösterilen raf yuvası (+ stok dağıtımına göre görünen adet). */
export interface SceneSlot extends SlotPlacement {
  productId: string;
  storeProductId: string;
  visibleUnits: number;
}

export interface SceneData {
  store: { id: string; name: string; isDemo: boolean };
  layoutVersion: number;
  layout: StoreLayout;
  products: SceneProduct[];
  slots: SceneSlot[];
  generatedAt: string;
}

export interface CartLineDto {
  storeProductId: string;
  productId: string;
  name: string;
  gtin: string;
  quantity: number;
  unitPriceKurus: number;
  lineSubtotalKurus: number;
  discountKurus: number;
  lineTotalKurus: number;
  promotionLabel?: string | null;
}

export interface CartDto {
  sessionId: string;
  status: 'active' | 'checked_out' | 'abandoned';
  lines: CartLineDto[];
  itemCount: number;
  subtotalKurus: number;
  discountKurus: number;
  totalKurus: number;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  storeId: string;
  status: string;
  subtotalKurus: number;
  discountKurus: number;
  totalKurus: number;
  paymentProvider: string;
  paymentRef: string | null;
  createdAt: string;
  items: {
    name: string;
    gtin: string;
    quantity: number;
    unitPriceKurus: number;
    discountKurus: number;
    lineTotalKurus: number;
  }[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}
