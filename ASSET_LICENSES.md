# Varlık lisansları

## Projede bulunan varlıklar

| Varlık | Kaynak | Lisans |
| --- | --- | --- |
| Ürün 3D modelleri | `packages/product-modeler` parametrik üretim (kod) | Projenin kendi çıktısı (`DEMO_GENERATED`) |
| Ürün etiketleri, EAN-13 çizimleri, fiyat etiketleri | `packages/engine-3d/src/textures.ts` canvas ile çalışma anında | Projenin kendi çıktısı |
| Zemin, tavan, tabela dokuları | Prosedürel (canvas) | Projenin kendi çıktısı |
| Market rafları, soğutucular, kasa, araba | Kodla üretilen geometri | Projenin kendi çıktısı |
| Ses efektleri | WebAudio ile sentezlenir | Projenin kendi çıktısı |

Harici görsel, model, font veya ses dosyası **paketlenmemiştir**. Fontlar sistem yazı tipleridir (Segoe UI/Arial).

## Kullanılan açık kaynak yazılımlar (çalışma zamanı)

| Paket | Lisans |
| --- | --- |
| three.js | MIT |
| @react-three/fiber, @react-three/drei, @react-three/rapier | MIT |
| Rapier (dimforge) | Apache-2.0 |
| React, Zustand, TanStack Query | MIT |
| Fastify, @fastify/* | MIT |
| Zod, Drizzle ORM | MIT / Apache-2.0 |
| PGlite (ElectricSQL) | Apache-2.0 / PostgreSQL |
| node-postgres | MIT |
| Tailwind CSS | MIT |

## Kullanıcı tarafından yüklenen varlıklar

Yönetim panelinden yüklenen her görsel için `product_asset_licenses` kaydı zorunludur (lisans türü, atıf, kaynak URL,
ticari kullanım izni). `UNVERIFIED` lisanslı varlıklar kalite kontrolde uyarı üretir ve ticari yayından önce
doğrulanmalıdır. Gerçek marka ambalaj görselleri için marka sahibinin/perakendecinin yazılı izni (`OWNER_PERMISSION`) gerekir.
Open Food Facts görselleri CC BY-SA 3.0'dır: atıf ve aynı lisansla paylaşım koşulu vardır.
