import type { Promotion } from '@realmarket/shared';

export interface PriceInputLine {
  storeProductId: string;
  quantity: number;
  unitPriceKurus: number;
  promotion?: Promotion | null;
}

export interface PricedLine extends PriceInputLine {
  lineSubtotalKurus: number;
  discountKurus: number;
  lineTotalKurus: number;
  promotionLabel: string | null;
}

export interface PricedCart {
  lines: PricedLine[];
  itemCount: number;
  subtotalKurus: number;
  discountKurus: number;
  totalKurus: number;
}

export function promotionLabel(p: Promotion | null | undefined): string | null {
  if (!p) return null;
  if (p.label) return p.label;
  return p.type === 'percent' ? `%${p.percent} indirim` : `${p.buy} al ${p.pay} öde`;
}

/** Tek satır indirimi (kuruş, tamsayı). Yuvarlama müşteri lehine aşağı doğru. */
export function lineDiscount(line: PriceInputLine): number {
  const p = line.promotion;
  if (!p || line.quantity <= 0) return 0;
  if (p.type === 'percent') return Math.floor((line.unitPriceKurus * line.quantity * p.percent) / 100);
  if (p.pay >= p.buy) return 0;
  const groups = Math.floor(line.quantity / p.buy);
  return groups * (p.buy - p.pay) * line.unitPriceKurus;
}

/**
 * Sepeti fiyatlandırır. Bu fonksiyon sunucuda yetkili toplamı üretir; istemci
 * yalnızca önizleme için kullanır ve istemci toplamına asla güvenilmez.
 */
export function priceCart(lines: PriceInputLine[]): PricedCart {
  const priced = lines
    .filter((l) => l.quantity > 0)
    .map((l) => {
      if (!Number.isInteger(l.quantity) || !Number.isInteger(l.unitPriceKurus) || l.unitPriceKurus < 0) {
        throw new Error('Geçersiz fiyat veya miktar');
      }
      const lineSubtotalKurus = l.unitPriceKurus * l.quantity;
      const discountKurus = Math.min(lineDiscount(l), lineSubtotalKurus);
      return {
        ...l,
        lineSubtotalKurus,
        discountKurus,
        lineTotalKurus: lineSubtotalKurus - discountKurus,
        promotionLabel: promotionLabel(l.promotion),
      };
    });
  const subtotalKurus = priced.reduce((s, l) => s + l.lineSubtotalKurus, 0);
  const discountKurus = priced.reduce((s, l) => s + l.discountKurus, 0);
  return {
    lines: priced,
    itemCount: priced.reduce((s, l) => s + l.quantity, 0),
    subtotalKurus,
    discountKurus,
    totalKurus: subtotalKurus - discountKurus,
  };
}
