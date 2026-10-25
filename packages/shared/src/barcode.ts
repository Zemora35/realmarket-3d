/**
 * GTIN (EAN-8, UPC-A/GTIN-12, EAN-13, GTIN-14) kontrol basamağı doğrulaması.
 * GS1 algoritması: sağdan itibaren (kontrol basamağı hariç) tek konumlar ×3.
 */
export function computeGtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error('GTIN yalnızca rakam içermelidir');
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

export type GtinKind = 'GTIN-8' | 'GTIN-12' | 'GTIN-13' | 'GTIN-14';

export interface GtinValidation {
  valid: boolean;
  normalized?: string;
  kind?: GtinKind;
  error?: string;
}

const KINDS: Record<number, GtinKind> = { 8: 'GTIN-8', 12: 'GTIN-12', 13: 'GTIN-13', 14: 'GTIN-14' };

export function validateGtin(raw: string): GtinValidation {
  const value = String(raw ?? '').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(value)) return { valid: false, error: 'Barkod yalnızca rakamlardan oluşmalı' };
  const kind = KINDS[value.length];
  if (!kind) return { valid: false, error: `Geçersiz barkod uzunluğu (${value.length})` };
  const expected = computeGtinCheckDigit(value.slice(0, -1));
  const actual = Number(value[value.length - 1]);
  if (expected !== actual) {
    return { valid: false, error: `Kontrol basamağı hatalı (beklenen ${expected}, gelen ${actual})` };
  }
  return { valid: true, normalized: value, kind };
}

/** GS1 "200-299" önekleri mağaza içi / kısıtlı kullanım içindir; demo barkodlar bu aralıktan üretilir. */
export function isRestrictedCirculationGtin(gtin: string): boolean {
  return gtin.length === 13 && /^2\d/.test(gtin);
}

/** Demo ürünler için gerçek ürünlerle çakışmayan (GS1 2xx önekli) geçerli EAN-13 üretir. */
export function makeDemoGtin(sequence: number): string {
  const body = `29${String(sequence).padStart(10, '0')}`;
  return body + computeGtinCheckDigit(body);
}
