# Görevler

## Öncelikli

- [ ] Gerçek donanımda performans ölçümü (masaüstü GPU, orta seviye Android, iPhone). `window.__rm3d.runtime.fps` ve
      `__r3f.gl.info.render` ile; hedef masaüstü 60, mobil 30+ FPS. Gerekirse: düşük kalitede LOD mesafesi, gölgesiz mod, uzak reyon gizleme.
- [ ] iOS Safari'de dokunmatik kontrol ve WebGL testi (Playwright WebKit veya gerçek cihaz).
- [ ] Blender pipeline (Faz 6): Blender kurulumu (`winget install BlenderFoundation.Blender` — kullanıcı onayı gerekir),
      `tools/blender/` altında parametrik şablon → GLB dışa aktarma, glTF Transform ile Meshopt + KTX2, LOD üretimi, önizleme görseli.
- [ ] İstemcide GLB model desteği (`product_models.format = 'glb'` olan ürünler `useGLTF` ile yüklensin, instancing için birleşik geometri).
- [ ] Doğrudan `.xlsx` içe aktarma (ör. `exceljs`), şu an Excel → CSV dışa aktarımı gerekiyor.

## Veri

- [ ] Gerçek ürünler için ölçüm iş akışı (ölçü doğrulama ekranı, fotoğraf + cetvel).
- [ ] Çok açılı fotoğraftan doku (MULTIVIEW_GENERATED): yan/arka görselleri etiket atlasına yerleştirme.
- [ ] Perakendeci veri beslemesi adaptörü (izin alındığında; `RETAILER_FEED`).
- [ ] S3/MinIO depolama adaptörü (`ObjectStorage` arayüzü hazır, `LocalStorage` kullanılıyor).

## Ürün özellikleri

- [ ] Raftan alınan ön ürünün yerine arka sıradaki sanal stoğun öne kayması (otomatik “yüzleme”).
- [ ] Çoklu mağaza: yönetimden yeni mağaza oluşturma (API'de mağaza oluşturma uç noktası yok; seed ile tek demo mağaza).
- [ ] Mağaza yöneticisi kullanıcı yönetimi arayüzü (rol ve mağaza kapsamı API'de hazır).
- [ ] Gerçek ödeme sağlayıcısı (barındırılan ödeme sayfası + webhook; `PaymentProvider` arayüzü hazır).
- [ ] WebXR/VR modu.
- [ ] 3D mağaza editörü (yerleşim önizlemesi şu an 2D plan + 3D mağaza bağlantısı).

## Teknik borç

- [ ] API'nin üretim derlemesi (şu an `tsx` ile çalışıyor; esbuild/tsup paketleme).
- [ ] Görsel regresyon testleri (ekran görüntüsü karşılaştırma).
- [ ] Proje OneDrive klasöründe: `node_modules` senkronize edilmesin diye projeyi OneDrive dışına taşımak önerilir.
