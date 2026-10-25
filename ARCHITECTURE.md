# Mimari

## Genel bakış

```
apps/web (React 19 + R3F + Rapier)  ──/api──►  apps/api (Fastify + Zod + OpenAPI)  ──►  PostgreSQL (PGlite | pg)
apps/admin (React + TanStack Query) ──/api──►          │
                                                      ├── packages/database        Drizzle şema (27 tablo) + migration
                                                      ├── packages/store-generator  parametrik mağaza yerleşimi
                                                      ├── packages/planogram        planogram doğrulama/yerleşim/CSV/adaptörler
                                                      ├── packages/product-catalog  demo katalog, içe aktarma, Open Food Facts
                                                      ├── packages/product-modeler  parametrik ambalaj geometrisi (three.js, Node'da da çalışır)
                                                      └── packages/shopping         fiyatlandırma/kampanya + araba paketleme
packages/engine-3d   prosedürel dokular (etiket, EAN-13, fiyat etiketi, zemin), malzemeler, araba modeli
packages/navigation  ızgara + A* + yol sadeleştirme + durak sıralama (en yakın komşu + 2-opt)
packages/shared      tipler, Zod şemaları, GTIN doğrulama, Türkçe metin/para yardımcıları
```

Paketler TypeScript kaynağı olarak dışa aktarılır (`main: src/index.ts`); Vite, Vitest ve tsx doğrudan derler.
Aynı kod hem tarayıcıda hem sunucuda çalışır (ör. model doğrulaması sunucuda `product-modeler` ile yapılır,
istemci aynı geometriyi çizer; fiyat hesabı sunucuda yetkilidir, istemci yalnızca gösterir).

## Ölçü sistemi

3D sahnede **1 birim = 1 metre**. Veritabanında ürün/raf ölçüleri milimetre, fiyatlar kuruş (tamsayı).
Mağaza koordinatları: x ∈ [0, genişlik] soldan sağa, z ∈ [0, uzunluk] ön duvardan arkaya, y yukarı.
Raf yerel ekseni: +x soldan sağa (müşterinin bakışıyla), +z ön yüz (koridor).

## Veri akışı

1. **Mağaza üretimi** (`generateStoreLayout`): parametreler → duvarlar, kapılar, gondollar (bölmelere ayrılmış raf birimleri),
   soğutucular, meyve-sebze tezgâhları, kampanya standları, kasalar, araba alanı, engeller. Seed tabanlı PRNG ile
   deterministik. Doğrulama: koridor ≥ 1,5 m, tüm raf erişim noktaları ve kasalar araba genişliğiyle ulaşılabilir (flood fill).
2. **Planogram** (RMPF v1): her raf birimi bir planogram. `computePlacements` facing/derinlik/istif → yuvalar; taşma,
   yükseklik, çakışma, bilinmeyen ürün, doğrulanmamış ölçü sorunlarını raporlar. Hatalı planogram kaydedilmez.
3. **Sahne API'si** (`GET /api/stores/:id/scene`): yerleşim + raf katları + ürünler + yuvalar. Kullanılabilir stok
   (eldeki − sepetlerde ayrılmış) yuvalara kapasiteyle orantılı dağıtılır.
4. **İstemci**: `UnitRegistry` her yuvadaki birimleri dünya koordinatına açar (derinlikte ön 2 sıra çizilir, gerisi sanal stok),
   uzamsal ızgara ile ışın–AABB seçimi yapar.
5. **Alışveriş**: rafdan alınan birim gizlenir; arabaya koyma `POST cart/add` → stok atomik koşullu UPDATE ile ayrılır.
   Kasada sepet sunucuda yeniden fiyatlandırılır; istemcinin beklediği toplam farklıysa 409. Ödeme + stok düşümü + sipariş tek işlemde.

## 3D motoru ve performans

| Teknik | Uygulama |
| --- | --- |
| GPU instancing | Ürün başına tek geometri + malzeme seti; (ürün × reyon) başına `InstancedMesh`. Raf parçaları malzeme başına tek `InstancedMesh`. |
| LOD | Her ürün için yüksek/düşük detay geometri; kameraya uzaklığa göre birimler iki mesh arasında dağıtılır (kalite ayarına göre 3,5–11 m). |
| Frustum culling | Reyon parçalı mesh'ler için sabit sınır küreleri. |
| Örtme (occlusion) yaklaşımı | Arka paneli olan raflarda (gondol, soğutucu) kamera rafın arkasındaysa o birimler çizilmez. |
| Derinlik kısıtı | Rafın yalnızca ön iki sırası çizilir. |
| Doku paylaşımı | Etiket/fiyat dokuları ürün başına bir kez üretilir ve önbelleğe alınır. |
| Adaptif kalite | Düşük/Orta/Yüksek ön ayar (DPR, gölge, LOD), `PerformanceMonitor` ile otomatik DPR düşürme. |
| Fizik | Rapier kinematik karakter denetleyicisi; oyuncu ve araba ayrı çarpışma gövdeleri, statik raflar tek sabit gövde. |

Ölçülen değerler için bkz. TEST_RESULTS.md (yazılım GPU'sunda ölçülen FPS gerçek donanımı temsil etmez).

## Güvenlik

- Fiyat/indirim/toplam yalnızca sunucuda hesaplanır; ödeme tutarı istemciye güvenilmeden doğrulanır.
- Stok: koşullu atomik UPDATE (`on_hand - reserved >= q`), DB CHECK kısıtları (`reserved <= on_hand`). Eşzamanlılık testi mevcut.
- Alışveriş oturumu: rastgele 256-bit anahtar, veritabanında yalnızca SHA-256 özeti; başka oturumun sepetine erişim 401.
- Admin: scrypt parola özeti, HMAC imzalı süreli token, rol (admin / store_manager) ve mağaza kapsamı kontrolü, giriş hız sınırı.
- Yüklemeler: 5 MB sınır, dosya türü içerik imzasından (PNG/JPEG/WebP), güvenli depolama anahtarı, `nosniff`.
- Gizli bilgiler `.env`'de (git'e girmez); üretimde `AUTH_SECRET` zorunlu.
- Terk edilmiş oturumların stok ayırmaları 2 saat sonra serbest bırakılır.

## VR genişlemesi

Kamera/girdi katmanı (`world/input.ts`, `scene/Player.tsx`) sahneden ayrıdır. WebXR için `@react-three/xr` ile
`XR` sarmalayıcısı ve denetleyici girdisinin `input` nesnesine eşlenmesi yeterlidir (henüz uygulanmadı).
