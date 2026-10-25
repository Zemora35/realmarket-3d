/**
 * Open Food Facts toplu döküm dönüştürücü.
 *
 * OFF, API'yi toplu çekim için değil tekil sorgular için önerir; büyük hacimler için
 * resmi JSONL dökümü kullanılmalıdır: https://world.openfoodfacts.org/data
 * (openfoodfacts-products.jsonl.gz, birkaç GB). Veri ODbL, görseller CC BY-SA lisanslıdır.
 *
 * Bu araç dökümü satır satır akış olarak okur (belleğe yüklemez), ülke etiketine göre
 * filtreler ve yönetim panelindeki "Toplu katalog içe aktarma" (JSONL) için satırlar üretir.
 *
 * Kullanım:
 *   pnpm import:off -- --input openfoodfacts-products.jsonl.gz --output tr-urunler.jsonl --country en:turkey --limit 5000
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { parseArgs } from 'node:util';
import { offProductToRow, type OffProduct } from '@realmarket/product-catalog';
import { validateGtin } from '@realmarket/shared';

const { values } = parseArgs({
  // `pnpm import:off -- --input …` biçimindeki ayırıcı yok sayılır
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    input: { type: 'string' },
    output: { type: 'string', default: 'off-import.jsonl' },
    country: { type: 'string', default: 'en:turkey' },
    limit: { type: 'string', default: '0' },
  },
});

if (!values.input) {
  console.error('Kullanım: pnpm import:off -- --input <döküm.jsonl[.gz]> [--output çıktı.jsonl] [--country en:turkey] [--limit N]');
  process.exit(1);
}

const limit = Number(values.limit) || Infinity;
const source = createReadStream(values.input);
const lines = createInterface({ input: values.input.endsWith('.gz') ? source.pipe(createGunzip()) : source, crlfDelay: Infinity });
const out = createWriteStream(values.output!);
let read = 0;
let written = 0;
let invalid = 0;

for await (const line of lines) {
  if (!line.trim()) continue;
  read++;
  let p: OffProduct;
  try {
    p = JSON.parse(line) as OffProduct;
  } catch {
    invalid++;
    continue;
  }
  if (values.country && !(p.countries_tags ?? []).includes(values.country)) continue;
  if (!p.code || !validateGtin(p.code).valid || !(p.product_name_tr || p.product_name)) {
    invalid++;
    continue;
  }
  out.write(`${JSON.stringify(offProductToRow(p))}\n`);
  if (++written >= limit) break;
  if (read % 100_000 === 0) console.log(`${read.toLocaleString('tr-TR')} satır okundu, ${written} ürün yazıldı…`);
}
out.end();
console.log(`Bitti: ${read} satır okundu, ${written} ürün yazıldı (${invalid} geçersiz/eksik), çıktı: ${values.output}`);
console.log('Lisans: Open Food Facts verisi ODbL 1.0; görseller CC BY-SA 3.0. Atıf kaydı içe aktarmada otomatik tutulur.');
