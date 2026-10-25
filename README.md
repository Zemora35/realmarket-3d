# RealMarket 3D

Tarayıcıda çalışan, içinde birinci şahıs yürüyüp alışveriş yapılabilen 3D süpermarket platformu.
Raflar planogramlardan, mağaza yerleşimi parametrelerden, ürün modelleri gerçek ölçülerden otomatik üretilir.

> **Örnek içerik:** Demo mağazadaki markalar, ürünler, barkodlar (GS1 mağaza içi `29` önekli) ve fiyatlar
> kurgusaldır; gerçek bir perakendecinin (Migros dahil) kataloğunu temsil etmez. Ödeme demo amaçlıdır.

## Hızlı başlangıç (Windows / PowerShell)

Gereksinimler: Node.js ≥ 22 (24 önerilir), pnpm (`npm i -g pnpm`). Docker **gerekmez**.

```powershell
pnpm install
Copy-Item .env.example .env      # geliştirme admin bilgilerini burada değiştirin
pnpm dev                          # API + 3D mağaza + yönetim paneli
```

| Uygulama | Adres |
| --- | --- |
| 3D mağaza | http://localhost:5173 (aynı ağdaki telefondan `http://<bilgisayar-ip>:5173`) |
| Yönetim paneli | http://localhost:5174 (giriş: `.env` → `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`) |
| API + OpenAPI | http://localhost:3001/api/docs |

İlk açılışta API, gömülü PostgreSQL'i (PGlite, `apps/api/.data/pglite`) oluşturur, migration'ları uygular ve
demo verisini yükler (42 ürün, 116 raf, 9 reyon, 3 kasa). Sıfırlamak için: `pnpm db:reset`.

Gerçek PostgreSQL için `infrastructure/docker/docker-compose.yml` ile bir sunucu başlatıp `.env` içinde
`DATABASE_URL` tanımlayın; aynı migration'lar node-postgres ile uygulanır.

## Kontroller

| Masaüstü | Mobil / tablet |
| --- | --- |
| `W A S D` yürü, `Shift` hızlı, fare bak | Sol joystick yürü, sağ yarıda sürükle bak |
| `E` ürün al / kasada öde · `F` 360° incele · `G` arabaya koy · `R` rafa bırak | “Al”, “Arabaya koy”, “İncele”, “Rafa bırak” düğmeleri |
| `C` arabayı tut/bırak · `Q` ara · `L` liste · `Tab` sepet · `Esc` menü | Üst çubukta Ara / Liste / Sepet |

## Komutlar

```powershell
pnpm dev          # tüm servisler
pnpm test         # birim + API entegrasyon testleri (Vitest, bellek içi PGlite)
pnpm test:e2e     # Playwright: masaüstü alışveriş, mobil kontroller, yönetim paneli
pnpm typecheck    # tüm paketler
pnpm lint
pnpm build        # web + admin üretim derlemesi
pnpm db:generate  # şema değişince yeni migration
pnpm import:off -- --input openfoodfacts-products.jsonl.gz --output tr.jsonl --country en:turkey
```

## Belgeler

- [ARCHITECTURE.md](ARCHITECTURE.md) — mimari, modüller, veri akışı, performans yaklaşımı
- [DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md) — faz durumu, kabul kriterleri
- [TASKS.md](TASKS.md) — kalan işler
- [DATA_SOURCES.md](DATA_SOURCES.md) — veri kaynakları ve kullanım koşulları
- [ASSET_LICENSES.md](ASSET_LICENSES.md) — varlık lisansları
- [PLANOGRAM_FORMAT.md](PLANOGRAM_FORMAT.md) — açık JSON/CSV planogram standardı
- [TEST_RESULTS.md](TEST_RESULTS.md) — son test sonuçları
