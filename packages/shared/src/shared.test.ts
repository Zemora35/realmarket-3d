import { describe, expect, it } from 'vitest';
import { computeGtinCheckDigit, makeDemoGtin, validateGtin } from './barcode';
import { formatPrice, normalizeTr, parseQuantity } from './text';

describe('GTIN doğrulama', () => {
  it('geçerli EAN-13 kabul eder', () => {
    expect(validateGtin('4006381333931')).toMatchObject({ valid: true, kind: 'GTIN-13' });
    expect(validateGtin('8690504012345').valid).toBe(computeGtinCheckDigit('869050401234') === 5);
  });
  it('hatalı kontrol basamağını reddeder', () => {
    const r = validateGtin('4006381333932');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Kontrol basamağı');
  });
  it('uzunluk ve karakter hatalarını yakalar', () => {
    expect(validateGtin('12345').valid).toBe(false);
    expect(validateGtin('abc').valid).toBe(false);
  });
  it('EAN-8 ve GTIN-14 destekler', () => {
    expect(validateGtin('96385074').valid).toBe(true);
    expect(validateGtin('10012345678902').valid).toBe(true);
  });
  it('demo barkodlar geçerli ve 29 önekli', () => {
    const g = makeDemoGtin(1001);
    expect(g).toHaveLength(13);
    expect(g.startsWith('29')).toBe(true);
    expect(validateGtin(g).valid).toBe(true);
  });
});

describe('metin yardımcıları', () => {
  it('Türkçe karakterleri normalize eder', () => {
    expect(normalizeTr('Şampuan ÇİLEK Gazlı İçecek')).toBe('sampuan cilek gazli icecek');
  });
  it('fiyatı TL olarak biçimlendirir', () => {
    expect(formatPrice(3450)).toMatch(/34,50/);
  });
  it('miktar ifadelerini ayrıştırır', () => {
    expect(parseQuantity('500 g')).toEqual({ netWeightG: 500 });
    expect(parseQuantity('1,5 L')).toEqual({ volumeMl: 1500 });
    expect(parseQuantity('33cl')).toEqual({ volumeMl: 330 });
    expect(parseQuantity('4 x 125 g')).toEqual({ netWeightG: 500 });
    expect(parseQuantity('')).toEqual({});
  });
});
