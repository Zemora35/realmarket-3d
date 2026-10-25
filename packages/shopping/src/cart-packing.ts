/** Alışveriş arabası sepetinin iç ölçüleri (metre). */
export const CART_BASKET = { width: 0.5, length: 0.78, height: 0.42 } as const;

export interface PackItem {
  key: string;
  /** metre */
  w: number;
  h: number;
  d: number;
}

export interface PackedItem {
  key: string;
  /** Sepet-yerel konum: x genişlik, z uzunluk (araba yönü), y taban üstü; birimin taban merkezi. */
  x: number;
  y: number;
  z: number;
  /** Uzun ürünler yatırılır (z ekseni etrafında 90°). */
  lying: boolean;
  /** Sepetten taşan ürünler (üst üste yığılmış). */
  overflow: boolean;
}

export interface PackResult {
  items: PackedItem[];
  /** Ürün hacimlerinin sepet hacmine oranı. */
  volumeRatio: number;
}

/**
 * Basit katmanlı raf-paketleme: ürünler ekleme sırasıyla yerleşir (eklenen ürün
 * diğerlerini yerinden oynatmaz), sıra dolunca yeni sıra, katman dolunca üst katman.
 */
export function packCart(items: PackItem[], basket: { width: number; length: number; height: number } = CART_BASKET): PackResult {
  const out: PackedItem[] = [];
  let x = 0;
  let z = 0;
  let y = 0;
  let rowDepth = 0;
  let layerHeight = 0;
  let volume = 0;
  for (const it of items) {
    volume += it.w * it.h * it.d;
    let w = it.w;
    let h = it.h;
    let lying = false;
    if (h > basket.height * 0.85 && h <= basket.length) {
      // uzun şişeyi yatır: yükseklik genişliğe geçer
      lying = true;
      [w, h] = [it.h, it.w];
    }
    const d = it.d;
    if (x + w > basket.width + 1e-6) {
      x = 0;
      z += rowDepth;
      rowDepth = 0;
    }
    if (z + d > basket.length + 1e-6) {
      x = 0;
      z = 0;
      y += layerHeight;
      layerHeight = 0;
      rowDepth = 0;
    }
    out.push({
      key: it.key,
      x: -basket.width / 2 + x + w / 2,
      y,
      z: -basket.length / 2 + z + d / 2,
      lying,
      overflow: y + h > basket.height + 0.05,
    });
    x += w;
    rowDepth = Math.max(rowDepth, d);
    layerHeight = Math.max(layerHeight, h);
  }
  return { items: out, volumeRatio: volume / (basket.width * basket.length * basket.height) };
}
