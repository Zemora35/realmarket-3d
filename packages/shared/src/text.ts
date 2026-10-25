const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Türkçe karakter duyarsız arama için metni normalize eder. */
export function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]|i̇/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const priceFormatter = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });

/** Kuruş cinsinden tamsayıyı "₺12,50" biçiminde gösterir. */
export function formatPrice(kurus: number): string {
  return priceFormatter.format(kurus / 100);
}

export function formatQuantity(netWeightG?: number | null, volumeMl?: number | null): string {
  if (volumeMl) return volumeMl >= 1000 ? `${(volumeMl / 1000).toLocaleString('tr-TR')} L` : `${volumeMl} ml`;
  if (netWeightG) return netWeightG >= 1000 ? `${(netWeightG / 1000).toLocaleString('tr-TR')} kg` : `${netWeightG} g`;
  return '';
}

/** "500 g", "1,5 L", "330ml", "2 x 1 kg" gibi miktar ifadelerini ayrıştırır. */
export function parseQuantity(text: string | undefined | null): { netWeightG?: number; volumeMl?: number } {
  if (!text) return {};
  const t = text.toLowerCase().replace(',', '.');
  const multi = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|gr|l|lt|ml|cl)\b/);
  const single = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|gr|l|lt|ml|cl)\b/);
  const m = multi ?? single;
  if (!m) return {};
  const count = multi ? Number(multi[1]) : 1;
  const amount = Number(multi ? multi[2] : m[1]) * count;
  const unit = multi ? multi[3] : m[2];
  switch (unit) {
    case 'kg':
      return { netWeightG: Math.round(amount * 1000) };
    case 'g':
    case 'gr':
      return { netWeightG: Math.round(amount) };
    case 'l':
    case 'lt':
      return { volumeMl: Math.round(amount * 1000) };
    case 'cl':
      return { volumeMl: Math.round(amount * 10) };
    case 'ml':
      return { volumeMl: Math.round(amount) };
  }
  return {};
}
