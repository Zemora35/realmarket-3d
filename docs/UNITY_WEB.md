# RealMarket — Unity Web sürümü

Bu belge Unity 6 LTS (URP) tabanlı web istemcisini, web sitesiyle entegrasyonunu ve bulutta derleme
hattını anlatır. Three.js istemcisi (`apps/web`) **yedek** olarak korunur: Unity derlemesi yayımlanmamışsa
site `/market` sayfasında Three.js sürümünü açar.

## Durum özeti (dürüst tablo)

| Bileşen | Durum | Nasıl doğrulandı |
| --- | --- | --- |
| `RealMarket.Core` (saf C#: DTO/JSON, planogram açılımı, birim dizini + ışın seçimi, durum makinesi, araba yerleşimi, hareket/LOD matematiği, kalite profilleri, para biçimi, köprü zarfı) | Tamam | `dotnet test unity/RealMarket.Core.Tests` — 29/29 geçti; gerçek API sahnesiyle (`Fixtures/scene.json`) |
| Unity runtime modülleri (15 yönetici + köprü + arayüz) | Kod yazıldı | **Unity derleyicisiyle henüz derlenmedi.** Yerelde Unity Editor yok (istenmedi); ilk derleme GameCI'da lisans secret'ları eklenince olur |
| Editor `BuildScript` (URP varlıkları, malzeme şablonları, son işleme, sahne, WebGL Brotli) | Kod yazıldı | Aynı: GameCI'da çalışacak |
| EditMode testleri (mesh sarımı, köprü, yapılandırma, yedek modeller) | Kod yazıldı | GameCI `unity-test-runner` ile çalışacak |
| Ürün GLB varlık hattı | Tamam | 42 ürün × 4 LOD, 5,9 MB; API `/api/models/*` ile `model/gltf-binary` olarak sunuluyor (API testi + gerçek dışa aktarım) |
| API: CORS izin listesi + model uçları | Tamam | `apps/api/src/unity-web.test.ts` — 5/5 |
| Web sitesi (`/`, `/market`, `/products`, `/cart`, `/checkout`, `/account`, `/admin`) | Tamam | Playwright, masaüstü + mobil (Pixel 7): 10/10 |
| Sayfa ↔ Unity köprüsü (site tarafı) | Tamam | Unity'yi taklit eden **test dublörüyle** sözleşme testi. Gerçek Unity derlemesiyle uçtan uca test **yapılmadı** |
| CI/CD (GitHub Actions) | Yazıldı | İlk push ile çalışır; sonuçları Actions sekmesinde |
| Üretim yığını (Docker, Caddy HTTPS, PostgreSQL, yedek) | Yazıldı | İmaj CI'da derlenip duman testinden geçer; **gerçek sunucuya dağıtım yapılmadı** (sunucu/alan adı bilgisi yok) |
| Yük testi 100/500/1000 kullanıcı | Betik hazır | Yerelde 10 kullanıcılık duman testi; asıl ölçüm GitHub Actions'ta PostgreSQL ile (`load-test.yml`) |

## Mimari

```
apps/site (statik, çerçevesiz ES modülleri)      unity/RealMarket3D (Unity 6.3 LTS, URP)
  ├─ oturumun sahibi: localStorage                 ├─ RealMarket.Core      saf C#, .NET'te test edilir
  ├─ /market → Unity loader (Brotli)  ── köprü ──► ├─ RealMarket.Runtime   15 yönetici + UI + köprü
  │            yoksa → Three.js (/3d/)             ├─ RealMarket.Editor    BuildScript (CI'da proje kurar)
  └─ ürün/sepet/ödeme sayfaları                    └─ Plugins/WebGL/RealMarketBridge.jslib
              │                                               │
              └────────────── REST (x-session-token) ─────────┘
                                   apps/api (Fastify + PostgreSQL)
                                   └─ /api/models/* ← tools/model-export (GLB, LOD0–3)
```

### Unity modülleri (`Assets/RealMarket/Runtime`)

| Modül | Görev |
| --- | --- |
| `GameManager` | Giriş noktası; yükleme sırası, sepet işlemlerinin tek merkezi, köprü komutları |
| `SceneManager` | Oyun akışı durumları (yükleme, alışveriş, inceleme, sepet, kasa, fiş, hata) ve işaretçi kilidi |
| `MarketGenerator` | Yerleşimden bina + demirbaş üretimi (gondol, açık dolap, kapılı soğutucu, manav tezgâhı, kasa, tabela, ışık panelleri); 8 m hücrelerde mesh birleştirme; çarpışma kutuları |
| `ShelfManager` | Birim dizini (Core `UnitIndex`), nişangâh ışın seçimi (collider'sız), fiyat etiketleri (yakınlık ile) |
| `PlanogramManager` | Yuva ↔ ürün eşlemesi, ön/arka sıra seçim kuralları |
| `ProductManager` | Ürün kataloğu; `Graphics.RenderMeshInstanced` ile binlerce birim, görüş konisi + mesafe ayıklama, raf başına LOD (histerezisli), GLB yoksa kodla üretilen yedek geometri |
| `ProductInteractionController` | Al → incele (döndür/yakınlaştır) → arabaya koy / rafa bırak; Core `ItemStateMachine` ile geçiş denetimi; sunucu reddederse rafa uçuş |
| `ShoppingCartController` | Kinematik Rigidbody + `SweepTest` (PhysX) ile itme, yuvarlanma sürtünmesi, döner tekerlek, sepet içi çakışmasız yerleşim |
| `FirstPersonController` | CharacterController, sınırlı ivme, baş salınımı (kapatılabilir), fare (işaretçi kilidi) + dokunmatik bakış |
| `InventoryManager` | Raf ↔ sepet tutarlılığı: sunucu sepeti tek doğruluk kaynağı (başka sekme/site değişiklikleri rafa yansır) |
| `CheckoutManager` | Kasa şeridi algılama, teklif, `expectedTotalKurus` korumalı demo ödeme, fiş, yeni oturum |
| `APIClient` | `UnityWebRequest`; yalnızca GET yeniden denenir (sepet yazmaları asla tekrarlanmaz) |
| `GraphicsQualityManager` | Düşük/Orta/Yüksek/Ultra: render ölçeği, MSAA, gölge mesafesi, son işleme, SSAO, LOD mesafeleri; kare hızı düşerse otomatik bir kademe iner |
| `AssetStreamingManager` | `manifest.json` + glTFast ile LOD GLB akışı; mesafe öncelikli kuyruk, en fazla 3 eşzamanlı indirme; URP Lit malzeme üreticisi |
| `UserSessionManager` | Oturum: sayfadan (`SET_SESSION`) veya PlayerPrefs/IndexedDB; geçersizse yenisi + `SESSION_READY` |
| `WebBridge` + jslib | Sayfa ↔ Unity olayları (aşağıda) |
| `UIManager` | Kodla kurulan UGUI: yükleme, nişangâh, ürün kartı, inceleme, sepet, kasa, fiş, mobil joystick/düğmeler |

**El yönü:** API koordinatları (Three.js) sağ elli, Unity sol ellidir. Unity aynı x/z sayılarını kullanır, bu
nedenle mağaza planı ayna görüntüsüdür (geçerli bir mağaza). Raf önündeki müşterinin gördüğü soldan sağa
planogram sırası korunmalıdır; bunun için raf-yerel x çevrilir (`PlanogramMath.LocalToWorld`, testli).
GLB ürünler glTFast tarafından doğru dönüştürüldüğünden etiket yazıları aynalanmaz.

## Köprü protokolü

Zarf: `{ "version": 1, "type": "...", "payload": { ... } }`

| Yön | Tür | Yük |
| --- | --- | --- |
| Unity → sayfa | `SESSION_READY` | `sessionId, token, storeId, isNew` (sayfa localStorage'a yazar) |
| Unity → sayfa | `SCENE_LOADED` | `storeId, products, units, quality, models` |
| Unity → sayfa | `PRODUCT_SELECTED` | `productId, storeProductId, name, gtin, priceKurus` |
| Unity → sayfa | `ADD_TO_CART` / `REMOVE_FROM_CART` | `productId, storeProductId, quantity` |
| Unity → sayfa | `CART_UPDATED` | sunucu sepeti (`CartDto`) |
| Unity → sayfa | `CHECKOUT_STARTED` | `totalKurus, itemCount` |
| Unity → sayfa | `ORDER_COMPLETED` | `orderId, orderNumber, totalKurus` |
| Unity → sayfa | `ERROR` | `message, stage` |
| Sayfa → Unity | `SET_SESSION` | `sessionId, token, storeId` |
| Sayfa → Unity | `CART_UPDATED` | (Unity sepeti sunucudan yeniden okur) |
| Sayfa → Unity | `ADD_TO_CART` / `REMOVE_FROM_CART` | `storeProductId` |
| Sayfa → Unity | `SET_QUALITY` | `tier: Low/Medium/High/Ultra` |
| Sayfa → Unity | `NAVIGATE_TO` | `productId` (ürünün rafına ışınlar) |

Unity olayları `window` üzerinde `realmarket:event` olarak yayılır; iframe içindeyse yalnızca
`window.RealMarketBridgeConfig.parentOrigin` kökenine `postMessage` gönderilir (joker yok).
Sayfadan gelen mesajlar 64 KB ile sınırlı, bilinmeyen türler yok sayılır.

## Bulutta derleme (yerel bilgisayar kullanılmaz)

`.github/workflows/unity.yml` — GameCI (`unity-test-runner` + `unity-builder`, imaj
`unityci/editor:ubuntu-6000.3.26f1-webgl-3`). Derleme yöntemi `RealMarket.EditorTools.BuildScript.BuildWebGL`:

1. Oyuncu ayarları: Linear renk, WebGL **Brotli**, açma yedeği kapalı (sunucu doğru başlıkları gönderir;
   `-rmDecompressionFallback` ile açılabilir), IL2CPP boyut optimizasyonu, düşük kod kırpma + `link.xml`.
2. URP renderer + asset (gölgeler, SRP Batcher, SSAO özelliği), global ayarlar.
3. Malzeme şablonları (`Lit`, `Lit (instancing)`, `şeffaf`, `ışıyan`, `Unlit`) → gölgelendirici varyantları kırpılmaz.
4. Son işleme profili (Neutral ton eşleme, bloom, renk ayarı, vinyet), sahne (`GameManager` + global Volume).
5. `BuildPipeline.BuildPlayer` → `build/WebGL/RealMarket3D` (+ `build-report.txt`).

Deneysel WebGPU: iş akışını elle çalıştırırken `webgpu` seçeneği (`-rmWebGPU`; WebGL2 yedekli).

### Lisans etkinleştirme (bir kez, sizin yapmanız gerekir)

Unity kişisel lisansı ücretsizdir ancak hesabınıza bağlıdır; kimlik bilgilerini ben giremem.

1. Unity Hub'ı güncelleyin (yerelde 2.4.4 kurulu; güncel Hub gerekli) ve Unity hesabınızla giriş yapın.
2. Hub → *Preferences / Settings → Licenses → Add → Get a free personal license*.
3. Oluşan dosyayı açın: `C:\ProgramData\Unity\Unity_lic.ulf` (içeriğin tamamı XML'dir).
4. GitHub → depo → *Settings → Secrets and variables → Actions → New repository secret*:
   - `UNITY_LICENSE` = `.ulf` dosyasının tüm içeriği
   - `UNITY_EMAIL` = Unity hesap e-postası
   - `UNITY_PASSWORD` = Unity hesap parolası
5. *Actions → Unity WebGL → Run workflow*. İlk derleme önbelleksiz ~30–60 dk sürebilir.

Unity Editor'ü yerelde kurmanız gerekmez; Hub yalnızca lisans dosyasını üretmek için kullanılır.

## Test matrisi

| Ortam | Kapsam | Durum |
| --- | --- | --- |
| .NET 10 (Windows, yerel) | Core mantığı 29 test | ✅ geçti |
| Vitest (Node 24) | API CORS + model uçları | ✅ 5/5 |
| Chromium masaüstü 1280×720 | site + köprü sözleşmesi | ✅ 5/5 |
| Chromium mobil (Pixel 7 öykünmesi) | site + köprü sözleşmesi | ✅ 5/5 |
| Unity EditMode (GameCI) | mesh, köprü, yedek modeller | ⏳ lisans secret'larından sonra |
| Unity WebGL — Chrome/Edge masaüstü | oynanış, 60 fps hedefi | ⏳ derleme yok |
| Unity WebGL — Firefox / Safari 17+ | WebGL2 uyumluluğu | ⏳ derleme yok |
| Gerçek Android / iOS cihaz | dokunmatik, bellek, ısı | ⏳ cihaz testi yapılmadı |

Unity derlemesi çıktıktan sonra önerilen kabul kontrolleri: ilk yükleme süresi (Brotli + önbellek),
Build klasörü boyutu (hedef < 25 MB sıkıştırılmış), masaüstü Yüksek profilde ≥ 55 fps, orta seviye
Android'de Düşük profilde ≥ 30 fps, bellek < 1 GB.

## Unity Render Streaming değerlendirmesi

Render Streaming, sahneyi sunucuda GPU ile çizip WebRTC ile video olarak gönderir.

| | WebGL (seçilen) | Render Streaming |
| --- | --- | --- |
| Sunucu maliyeti | Statik dosya + küçük API | Eşzamanlı kullanıcı başına GPU örneği (bulut GPU saatlik ücretli) |
| 1000 eşzamanlı kullanıcı | CDN/statik sunucu yeterli | Yüzlerce GPU örneği — ücretsiz değil |
| Gecikme | Yerel (giriş anında) | Ağ gidiş-dönüşü (genelde 50–150 ms) |
| Zayıf cihaz | Düşük profil gerekir | İyi (yalnızca video çözme) |
| Çevrimdışı/önbellek | Var | Yok |

Sonuç: Ücretsiz/düşük maliyet koşulu ve 1000 kullanıcı hedefiyle WebGL birincil kalır. Render
Streaming yalnızca çok zayıf cihazlar için ücretli, isteğe bağlı bir "bulut modu" olarak düşünülebilir.

## Uzaktan geliştirme seçenekleri

| Seçenek | Ne sağlar | Maliyet notu |
| --- | --- | --- |
| **GitHub Actions + GameCI (kurulu)** | Her push'ta test + WebGL derlemesi, yerel CPU/GPU kullanılmaz | Özel depoda aylık ücretsiz dakika kotası var; açık depoda sınırsız |
| Unity Build Automation | Unity'nin barındırılan derleme hizmeti | Ücretli/kotalı — birincil bağımlılık yapılmadı |
| Bulut GPU sanal makinesi + uzak masaüstü | Unity Editor'ü uzaktan açıp sahne düzenleme | Saatlik ücretli; yalnızca görsel düzenleme gerektiğinde |

Proje, Editor açmadan geliştirilebilecek şekilde kuruldu: sahne ve varlıklar kodla üretilir, mantık
.NET'te test edilir, derleme bulutta yapılır.
