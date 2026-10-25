# RealMarket Planogram Format (RMPF) v1

Açık, belgelenmiş JSON planogram standardı. Şema: `packages/shared/src/planogram.ts` (Zod). Tüm ölçüler **milimetre**.

```json
{
  "format": "realmarket-planogram",
  "version": 1,
  "storeId": "demo-market",
  "planogramId": "PG-G6-A-01",
  "aisleId": "ICECEK",
  "shelfId": "G6-A-01",
  "name": "İçecek bölmesi 1",
  "fixture": {
    "kind": "gondola",
    "widthMm": 1250,
    "depthMm": 500,
    "heightMm": 1950,
    "levels": [
      { "index": 0, "heightFromBaseMm": 120, "clearanceMm": 350, "depthMm": 460 },
      { "index": 1, "heightFromBaseMm": 500, "clearanceMm": 350 }
    ]
  },
  "items": [
    { "gtin": "2900000010092", "levelIndex": 0, "facings": 6, "positionXMm": 0, "depthCount": 5, "stackCount": 1, "orientation": "front" }
  ]
}
```

| Alan | Açıklama |
| --- | --- |
| `fixture.kind` | `gondola`, `cooler`, `open_chiller`, `produce_table`, `promo_stand` |
| `levels[].heightFromBaseMm` | Raf tablasının üst yüzü (ürünün oturduğu yükseklik) |
| `levels[].clearanceMm` | Ürün için dikey boşluk; aşılırsa `HEIGHT_COLLISION` |
| `levels[].zOffsetMm` | Basamaklı raflar için ön kenardan geriye ofset |
| `items[].facings` | Yan yana ön yüz sayısı |
| `items[].positionXMm` | Bloğun sol kenarı; yoksa aynı kattaki önceki bloktan sonra otomatik |
| `items[].depthCount` | Derinlikte sıra sayısı; yoksa `floor(katDerinliği / ürünDerinliği)` |
| `items[].orientation` | `front`, `side` (90° döndürülmüş), `top` (yatırılmış) |

## Doğrulama kodları

`UNKNOWN_PRODUCT`, `SHELF_OVERFLOW`, `HEIGHT_COLLISION`, `SLOT_OVERLAP`, `INVALID_LEVEL` (hata — kaydedilmez),
`DEPTH_OVERFLOW`, `UNVERIFIED_DIMENSIONS` (uyarı). Ayrıca planogram genişliği fiziksel raf genişliğinden farklıysa reddedilir.

## CSV (Excel → “CSV olarak kaydet”)

Ayraç `,` veya `;` (otomatik), UTF-8 (BOM desteklenir). Satır başına bir kalem; aynı `planogram_id` satırları gruplanır.

```
planogram_id;shelf_id;aisle_id;shelf_width_mm;shelf_depth_mm;shelf_height_mm;level_heights_mm;level_index;gtin;facings;position_x_mm;depth_count;stack_count;orientation;kind
P-G6-A-01;G6-A-01;ICECEK;1250;500;1950;120|500|880|1260|1640;0;2900000010092;6;;;;front;gondola
```

## Spaceman PLN

NielsenIQ Spaceman `.pln` kapalı/özel bir biçimdir; kamuya açık şartnamesi yoktur. İzinli bir okuma yöntemi
(resmî SDK, lisanslı belge veya Spaceman'ın kendi dışa aktarımı) olmadan PLN okuyucu **uygulanmamıştır** ve
`pln` adaptörü bunu açıkça bildirir. Önerilen yol: Spaceman'dan CSV/Excel dışa aktarımı → CSV adaptörü.
Gerçek bir PLN örneği ve kullanım izni sağlandığında `PlanogramAdapter` arayüzüne yeni bir adaptör eklenebilir.
