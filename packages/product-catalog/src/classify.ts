import { normalizeTr, type PackagingType } from '@realmarket/shared';

/**
 * Anahtar kelime → ambalaj tipi kuralları (TR + EN, Open Food Facts etiketleri dahil).
 * Türkçe ekler (cips-i, reçel-i, makarna-sı) için önek eşleşmesi: kelime başı \b, sonu serbest.
 * Sıra önemlidir: daha özgül kurallar önce gelir.
 */
const RULES: [PackagingType, RegExp][] = [
  ['beverage_can', /\b(kutu icecek|teneke kutu|cans?\b|en can\b)/],
  ['milk_carton', /\b(sut|milk)\b.*\b(karton|tetra|carton)|\bkarton sut/],
  ['chips_bag', /\b(cips|chips|crisps)/],
  ['biscuit_pack', /\b(biskuvi|biscuit|cookie|kurabiye)/],
  ['pasta_pack', /\b(makarna|pasta\b|spagetti|spaghetti|eriste|noodle)/],
  ['detergent_bottle', /\b(camasir|deterjan|detergent|yumusatici|softener|yuzey temizleyici|cleaner)/],
  ['shampoo_bottle', /\b(sampuan|shampoo|sac kremi|conditioner|dus jeli|shower gel|sivi sabun)/],
  ['spray', /\b(sprey|spray|deodorant|aerosol|oda kokusu)/],
  ['tube', /\b(dis macun|toothpaste|tup\b|tube\b)/],
  ['glass_bottle', /\b(cam sise|glass bottle|maden suy|mineral water|sarap|bira\b|beer)/],
  ['yogurt_cup', /\b(yogurt|yoghurt|puding|dessert)/],
  ['tin_can', /\b(konserve|canned|salca|tomato paste|ton balig|tuna\b)/],
  ['jar', /\b(kavanoz|jar\b|recel|jam\b|bal\b|honey|krema|spread|tursu|pickle)/],
  ['pet_bottle', /\b(pet\b|plastic bottle|plastik sise|su\b|suyu\b|water|kola|cola|soda|gazoz|ayran|yag\b|yagi\b|oil\b)/],
  ['pouch', /\b(pirinc|rice\b|bakliyat|mercimek|lentil|seker|sugar|un\b|flour|poset|bag\b)/],
  ['carton_box', /\b(kutu|box\b|gevrek|cereal|cikolata|chocolate|kraker|cracker|cay\b|tea\b|meyve suy|juice)/],
  ['fruit', /\b(elma|apple|portakal|orange|muz\b|banana|limon|lemon|armut|pear\b|uzum|grape|mandalina)/],
  ['vegetable', /\b(domates|tomato|salatalik|cucumber|biber|pepper|patates|potato|sogan|onion|patlican)/],
];

export interface PackagingGuess {
  packagingType: PackagingType;
  /** Heuristik sonuç — doğrulanmış veri gibi gösterilmemeli. */
  confidence: 'keyword' | 'fallback';
  matchedRule?: string;
}

export function classifyPackaging(text: string): PackagingGuess {
  const t = normalizeTr(text);
  for (const [type, rule] of RULES) {
    const m = t.match(rule);
    if (m) return { packagingType: type, confidence: 'keyword', matchedRule: m[0] };
  }
  return { packagingType: 'carton_box', confidence: 'fallback' };
}

/** Ölçüsü bilinmeyen ürünler için ambalaj tipine göre TAHMİNİ ölçüler (mm). Doğrulanmış sayılmaz. */
export const DEFAULT_DIMENSIONS_MM: Record<PackagingType, [number, number, number]> = {
  carton_box: [140, 200, 60],
  biscuit_pack: [200, 55, 55],
  chips_bag: [180, 260, 70],
  pet_bottle: [80, 280, 80],
  glass_bottle: [60, 200, 60],
  beverage_can: [66, 122, 66],
  yogurt_cup: [95, 75, 95],
  tin_can: [75, 110, 75],
  jar: [78, 120, 78],
  shampoo_bottle: [85, 220, 55],
  detergent_bottle: [150, 280, 100],
  milk_carton: [70, 245, 70],
  pasta_pack: [140, 230, 50],
  spray: [60, 190, 60],
  tube: [180, 40, 45],
  pouch: [150, 230, 70],
  fruit: [80, 75, 80],
  vegetable: [80, 70, 80],
  custom: [100, 150, 100],
};
