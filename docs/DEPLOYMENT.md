# RealMarket — üretim ortamına yayın

Yığın sağlayıcıdan bağımsızdır: Docker çalıştırabilen herhangi bir Linux sunucusunda çalışır.

```
İnternet ──HTTPS──► Caddy ──► /            web sitesi (statik)
                          ├─► /unity/*     Unity WebGL (Brotli, application/wasm)
                          ├─► /3d/*        Three.js yedek istemci
                          ├─► /admin/*     yönetim paneli
                          └─► /api/*  ───► API (Fastify) ───► PostgreSQL ──► günlük pg_dump (7 gün)
```

Dosyalar: `infrastructure/docker/docker-compose.prod.yml`, `infrastructure/caddy/Caddyfile`,
`infrastructure/docker/api.Dockerfile`, `.env.production.example`.

## Akış

1. **CI** (`ci.yml`, her push): lint, tür denetimi, birim/API testleri, site testleri (masaüstü + mobil),
   Core .NET testleri, GLB model üretimi.
2. **Unity** (`unity.yml`, `unity/**` değişince): GameCI test + WebGL derlemesi → `unity-webgl` artefaktı.
3. **Yayın** (`deploy.yml`, elle veya `v*` etiketi):
   - API imajı → `ghcr.io/<sahip>/realmarket-3d-api:{latest,sha}` (açılış duman testiyle).
   - `realmarket-release.tar.gz`: compose + Caddyfile + `public/{site,unity,three,admin,models}`.
   - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (isteğe bağlı `DEPLOY_KNOWN_HOSTS`) secret'ları varsa
     SSH ile sunucuya kopyalar ve `docker compose up -d` çalıştırır. Yoksa adım atlanır.

> Bu depoda henüz gerçek bir sunucuya dağıtım **yapılmadı**: sunucu, alan adı ve SSH bilgileri verilmedi.

## İlk kurulum (sunucuda bir kez)

```bash
# Ubuntu 24.04 örneği
curl -fsSL https://get.docker.com | sh
sudo mkdir -p /opt/realmarket && sudo chown $USER /opt/realmarket
# deploy iş akışını bir kez çalıştırın (veya artefaktı elle kopyalayıp açın), sonra:
cd /opt/realmarket && cp .env.example .env && nano .env   # tüm gizli değerleri doldurun
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

- DNS: alan adının A/AAAA kaydı sunucuyu göstermeli; Caddy sertifikayı otomatik alır.
- Güvenlik duvarı: yalnızca 22, 80, 443 (TCP) ve 443/UDP (HTTP/3). PostgreSQL dışarı açılmaz.
- GHCR imajı özel depoda özel paket olur: sunucuda `docker login ghcr.io` (yalnızca `read:packages`
  izinli kişisel erişim belirteciyle) gerekir ya da paket görünürlüğünü herkese açık yapın.
- Yedekten dönüş: `gunzip -c realmarket-YYYYMMDD-HHMM.sql.gz | docker compose exec -T postgres psql -U realmarket realmarket`

## Unity WebGL için sunucu başlıkları

Brotli ile sıkıştırılmış Unity dosyaları için (Caddyfile'da tanımlı):

| Dosya | Content-Encoding | Content-Type |
| --- | --- | --- |
| `*.wasm.br` | `br` | `application/wasm` |
| `*.framework.js.br` | `br` | `application/javascript` |
| `*.data.br` | `br` | `application/octet-stream` |

Bu başlıkları ayarlayamayan barındırmalarda (ör. GitHub Pages) Unity'yi `-rmDecompressionFallback`
ile derleyin (tarayıcıda JS ile açılır, ilk yükleme yavaşlar).

## Barındırma seçenekleri ve yaklaşık maliyet

Fiyatlar sağlayıcıların herkese açık liste fiyatlarına dayalı **yaklaşık** değerlerdir; değişebilir,
satın almadan önce sağlayıcı sayfasından doğrulayın.

| Seçenek | Ne çalışır | Aylık yaklaşık | Not |
| --- | --- | --- | --- |
| Oracle Cloud "Always Free" ARM VM | Tüm yığın (Caddy + API + PostgreSQL) | 0 | Kapasite her bölgede bulunmayabilir; hesap doğrulaması kart ister |
| Küçük VPS (2 vCPU / 4 GB; Hetzner, Contabo, DigitalOcean vb.) | Tüm yığın | ~4–25 USD | En basit ve öngörülebilir seçenek |
| Statik dosyalar CDN'de (Cloudflare Pages/R2) + API VPS'te | Site/Unity CDN'den, API ayrı | 0 + VPS | Pages tek dosya sınırına dikkat (Unity `.data` büyükse R2 kullanın); farklı köken → `CORS_ORIGINS` |
| Yönetilen PostgreSQL ücretsiz katman (Neon, Supabase) | Yalnızca veritabanı | 0 | Depolama/işlem sınırları var; `DATABASE_URL` ile bağlanır |

Ücretli hizmetler birincil bağımlılık değildir: yığın tek bir ücretsiz/ucuz sunucuda bütünüyle çalışır.

## Ölçeklenme

- Statik içerik (Unity derlemesi, GLB modeller) CDN önbelleğine uygundur; API trafiği küçüktür
  (sahne verisi bellekte önbelleklenir, sepet işlemleri küçük JSON).
- API durumsuzdur: birden fazla `api` kopyası Caddy `reverse_proxy` arkasında çalıştırılabilir.
- Yük testi: `.github/workflows/load-test.yml` (100 / 500 / 1000 sanal kullanıcı, PostgreSQL ile).
  Sonuçlar iş akışı özetinde ve `load-report` artefaktında.
