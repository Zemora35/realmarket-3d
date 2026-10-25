# Veri kaynakları

| Kaynak | Durum | Lisans / koşul | Nasıl kullanılıyor |
| --- | --- | --- | --- |
| Demo katalog (`packages/product-catalog/src/demo-catalog.ts`) | Aktif | Projenin kendi ürettiği kurgusal içerik | 42 örnek ürün; kurgusal markalar, GS1 `29` önekli (mağaza içi) barkodlar, tahmini ölçüler. `DEMO_SAMPLE` olarak işaretli. |
| Open Food Facts API v2 | Aktif (yönetim → İçe aktarma) | Veri **ODbL 1.0**, görseller **CC BY-SA 3.0** | Barkod başına sorgu, ≈90 istek/dk sınırlayıcı, tanımlayıcı `User-Agent` (`OFF_USER_AGENT`). Kaynak URL ve lisans `product_data_sources` / `product_asset_licenses` tablolarına yazılır. 2026-10-25'te tek barkodla canlı doğrulandı. |
| Open Food Facts JSONL dökümü | Araç hazır (`pnpm import:off`) | ODbL 1.0 | Toplu veri için önerilen yol; akış olarak okunur, ülke filtresi uygulanır. Tam döküm (çok GB) bu oturumda indirilmedi. |
| Migros (migros.com.tr) | **Kullanılmıyor** | Kullanım koşulları/izin doğrulanmadı | İzinsiz scraping yapılmaz. Resmî iş ortaklığı/veri beslemesi sağlanırsa `RETAILER_FEED` kaynak türüyle CSV/JSON içe aktarma kullanılabilir. Demo ürünler Migros kataloğu olarak gösterilmez. |
| reefapi.com Migros API | **Kullanılmıyor** | Resmî Migros servisi olduğu doğrulanmadı | Resmî olmayan servis resmî gibi sunulmaz. |
| mcaitjv/infdatabase (GitHub) | **Kullanılmıyor** | Lisans/verinin kaynağı doğrulanmadı | İncelenmeden içe aktarılmaz. |
| GS1 Türkiye | Kullanılmıyor | Ücretli/üyelik gerektiren hizmetler | Barkod doğrulaması GS1 kontrol basamağı algoritmasıyla yerel yapılır; GS1 kayıt sorgusu için üyelik gerekir. |

## İçe aktarma kuralları

- Barkodlar GTIN-8/12/13/14 kontrol basamağıyla doğrulanır; hatalı satırlar raporlanır.
- Aynı barkod birleştirilir; doğrulanmış ölçülerin üzerine tahmini ölçü yazılmaz.
- Eksik ölçü → ambalaj tipine göre **tahmini** ölçü, `MISSING_DIMENSIONS` + `verified=false`, model `NEEDS_REVIEW`.
- Ambalaj tipi anahtar kelimeyle tahmin edilirse `HEURISTIC_PACKAGING` olarak işaretlenir.
- Uzak görseller indirilmez, yalnızca kaynak/lisans kaydı tutulur (yayın öncesi lisans/marka izni doğrulanmalı).
- İş her 200 satırda imleç kaydeder; kesintide “Devam ettir” ile kaldığı yerden sürer.
- Arama yerel katalogda yapılır; her tuş vuruşunda harici API çağrılmaz.
