# Geliştirme ilerlemesi

Son güncelleme: 2026-10-25 · Ortam: Windows 11, Node 24.19, pnpm 12.15 (Docker ve Blender kurulu değil)

## İlk sürüm kabul kriterleri

| # | Kriter | Durum | Kanıt |
| --- | --- | --- | --- |
| 1 | İçinde yürünebilen 3D market | ✅ | e2e `shopping.spec.ts` (W ile yürüme, araba itme) |
| 2 | Gerçekçi raf ve koridor sistemi | ✅ | 6 gondol × 2 yüz × 8 bölme, 12 soğutucu, 6 tezgâh, 2 kampanya standı; 2,4 m koridor |
| 3 | En az 5 reyon | ✅ | 9 reyon (`generate.test.ts`) |
| 4 | En az 10 raf | ✅ | 116 raf birimi |
| 5 | En az 20 ayrı 3D ürün | ✅ | 42 ürün, 18 ambalaj geometrisi + 6 meyve/sebze şekli (`builders.test.ts`) |
| 6 | Ürün seçme ve 360° inceleme | ✅ | e2e: nişangâh seçimi, F, sürükleyerek döndürme |
| 7 | Gerçekçi alışveriş arabası | ✅ | Tel sepet, 4 dönen tekerlek, Rapier çarpışması, içinde 3D ürünler |
| 8 | Raflardan ürün alma | ✅ | e2e (E) |
| 9 | Ürünleri arabaya koyma | ✅ | e2e (G, animasyonlu, sunucuda stok ayırma) |
| 10 | Arabadan ürün çıkarma | ✅ | e2e sepet paneli “Çıkar (rafa)”. 3D yol (arabadaki ürüne bakıp E) uygulandı ama otomatik testte yok |
| 11 | Sepet toplamı | ✅ | Sunucuda; kampanyalar (%, X al Y öde) — API testleri |
| 12 | Birinci şahıs kamera | ✅ | Fare kilidi ile bakış |
| 13 | Mobil dokunmatik kontroller | ✅ | e2e `mobile.spec.ts` (Pixel 7 öykünmesi) |
| 14 | Sanal kasa | ✅ | 3 kasa, kasa bölgesi algılama, barkod okutma simülasyonu |
| 15 | Demo ödeme | ✅ | e2e fiş + sipariş no |
| 16 | Veritabanı bağlantısı | ✅ | PostgreSQL (PGlite gömülü; `DATABASE_URL` ile node-postgres) |
| 17 | Temel admin paneli | ✅ | e2e `admin.spec.ts` |
| 18 | JSON planogramdan raf üretimi | ✅ | Seed + PUT planogram + import |
| 19 | Çalışan geliştirme sunucusu | ✅ | `pnpm dev` |
| 20 | Otomatik temel testler | ✅ | 73 Vitest + 3 Playwright |

## Fazlar

| Faz | Durum | Not |
| --- | --- | --- |
| 1 Kurulum | ✅ | pnpm monorepo, 3 uygulama, 9 paket |
| 2 3D market | ✅ | Zemin, cam vitrin, otomatik kapılar, LED tavan, ortam yansımaları, gölgeler |
| 3 Ürünler ve raflar | ✅ | Instancing + LOD + örtme; ışın seçimi |
| 4 Araba | ✅ | |
| 5 Planogram | ✅ (PLN hariç) | JSON + CSV; Excel “CSV olarak kaydet” ile. Doğrudan .xlsx okuma yok. PLN: belgelenmiş yöntem yok → desteklenmiyor olarak bildiriliyor |
| 6 Otomatik 3D üretim | 🟡 Kısmi | Parametrik üretim + doğrulama işi (sunucu) hazır. Blender/GLB/KTX2/Meshopt pipeline **yok** (Blender kurulu değil) |
| 7 Gerçek veri | 🟡 Kısmi | OFF API adaptörü (canlı doğrulandı) + döküm aracı. Migros/GS1 adaptörü yok (izin/erişim yok) |
| 8 Yönetim paneli | ✅ | Ürün, fiyat/stok/kampanya, görsel yükleme, model üretimi, planogram editörü (sürükle-bırak + canlı 3D), mağaza yerleşimi, siparişler, kalite, içe aktarma |
| 9 Kasa ve sipariş | ✅ | |
| 10 Optimizasyon/test | 🟡 | Otomatik testler ✅. Gerçek cihaz FPS ölçümü yapılmadı (bkz. TEST_RESULTS.md) |

## Sonraki görev

TASKS.md → “Öncelikli”. İlk iş: gerçek donanımda (masaüstü GPU + orta seviye telefon) FPS ölçümü ve gerekirse LOD/gölge ayarı.
