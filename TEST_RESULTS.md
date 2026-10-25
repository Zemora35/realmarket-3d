# Test sonuçları

Tarih: 2026-10-25 · Windows 11 · Node 24.19 · Chromium (Playwright headless shell 156, SwiftShader yazılım GPU)

## Birim + entegrasyon (Vitest) — `pnpm test`

**8 dosya, 73 test, tümü geçti** (~12 sn).

| Alan | Kapsam |
| --- | --- |
| shared | GTIN-8/12/13/14 kontrol basamağı, demo barkodlar, Türkçe normalize, miktar ayrıştırma |
| navigation | A* (engel çevresinden dolaşma, ulaşılamaz hedef), görüş hattı, durak sıralama |
| store-generator | ≥10 raf, ≥5 reyon, deterministiklik, dar koridor reddi, çakışmasız ve sınır içi engeller, raf yönleri, küçük mağaza uyarısı |
| planogram | facing/derinlik/kapasite, taşma/yükseklik/çakışma/bilinmeyen ürün/geçersiz kat, birim konumları, JSON/CSV/BOM, PLN desteklenmiyor |
| shopping | kuruş hassasiyeti, % indirim, X al Y öde, geçersiz miktar, araba paketleme (kararlı sıra, yatırma) |
| product-modeler | 18 ambalaj tipi + 6 meyve/sebze varyantı × 2 LOD: ölçek sapması < %0,5, UV aralığı, malzeme grupları; LOD üçgen azalması |
| product-catalog | demo katalog geçerliliği, ambalaj sınıflandırma, CSV içe aktarma (doğrulama, birleştirme, eksik işaretleme, imleçle devam), OFF adaptörü (sahte fetch) |
| API (bellek içi PGlite) | seed + sahne; Türkçe arama; sepet ekle/çıkar + stok ayırma; yanlış tutarla ödeme 409; sipariş + stok düşümü; kapalı oturum; oturum izolasyonu (401); **5 eşzamanlı müşteri / 3 stok → 3 başarılı, 2 reddedildi**; yetkisiz erişim; planogram hatalı → 422, geçerli → uygulanır; kalite raporu; model işi; CSV + OFF içe aktarma; görsel yüklemede içerik doğrulama (sahte PNG → 415) |

## Uçtan uca (Playwright) — `pnpm test:e2e`

**Son koşu: 3 test, tümü geçti (4,8 dk).** Ekran görüntüleri: `tests/e2e/screenshots/`.

| Test | Doğrulanan |
| --- | --- |
| `shopping.spec.ts` (masaüstü 1280×720) | Markete giriş; W ile yürüyüş ve arabanın birlikte ilerlemesi; rafa yaklaşınca nişangâh ışın seçimi; E ile alma; F ile 360° inceleme ve fareyle döndürme; arabaya koyma (sunucu sepeti 1); 4 ürün daha (sunucu 5); sepet panelinde toplam; “Çıkar (rafa)” ile ürünün rafa dönmesi (raf adedi +1, sunucu 4); ürün arama + A* rota; kasa bölgesi algılama; okutma simülasyonu; demo ödeme; `RM-YYYYMMDD-XXXXXX` sipariş no ve fiş; yeni alışveriş; sayfa hatası yok |
| `mobile.spec.ts` (Pixel 7 öykünmesi) | Dokunmatik algılama, joystick ile ileri yürüme, “Al” ve “Arabaya koy” düğmeleri, sunucu sepeti |
| `admin.spec.ts` (1440×900) | `.env` bilgileriyle giriş; ürün seçimi ve 3D önizleme; fiyat güncelleme; model yeniden üretimi ve doğrulaması; planogram facing azaltma + kaydet/uygula; 2D yerleşim planı ve dar koridor (1,2 m) hatası; kalite raporu |

Not: Bir önceki tam koşuda `admin.spec.ts` bir kez yerleşim sayfasında “Yükleniyor…” durumunda kalarak başarısız oldu;
API uç noktası ayrıca ölçüldüğünde 10 ms'de yanıt verdi, test tek başına ve sonraki tam koşuda geçti. Kök neden
kesinleşmedi (olası tutarsızlık). Sayfaya sorgu hatası durumunda mesaj + “Tekrar dene” eklendi; tekrar ederse neden görünür olacak.

Ayrıca bu sırada bulunup düzeltilen hatalar: StrictMode çift mount'unda serbest bırakılmış Rapier karakter denetleyicisi;
stokun yuvalara “ilk gelen alır” dağıtılması nedeniyle boş görünen raflar; sepet paneli açıkken fare kilidinin bırakılmaması
(düğmelere tıklanamıyordu); mobilde klavye tuşundan bahseden bildirim ve kontrollerle çakışan alt bilgi.

## Diğer

- `pnpm typecheck`: 11 paket/uygulama hatasız.
- `pnpm lint`: hatasız.
- `pnpm build`: web ve admin üretim derlemesi başarılı.
- Open Food Facts API canlı sorgu (tek barkod, salt okunur): ürün bulundu, ambalaj sezgisel tahmin edildi ve işaretlendi, eksik ölçü raporlandı.
- OFF döküm aracı: örnek gzip JSONL ile ülke filtresi, geçersiz barkod ve bozuk satır ayıklama doğrulandı.

## Performans — doğrulanmadı

Gerçek GPU'da ölçüm yapılmadı. Gözlenenler (temsil edici değildir):

- Uygulama içi tarayıcı (donanım GPU'su, 1280×720, ilk sürümde ~6.750 birim): ~39 FPS.
- Başsız Chromium + SwiftShader (yazılım rendering, 17.840 birim): 1–26 FPS. Yazılım GPU'su olduğu için performans hedefi açısından anlamlı değildir.
- Sahne: ~84 ürün InstancedMesh, raf parçaları malzeme başına tek mesh, ~300 çizim çağrısı (orta kalite, LOD + örtme öncesi ölçüm).

60 FPS (masaüstü) / 30+ FPS (mobil) hedefleri **gerçek cihazlarda ölçülene kadar karşılandı sayılmamalıdır** (TASKS.md).
