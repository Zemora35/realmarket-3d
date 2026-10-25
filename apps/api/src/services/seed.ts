import { randomBytes } from 'node:crypto';
import { count, eq, sql, sum } from 'drizzle-orm';
import { inventory, productAssetLicenses, shelfSlots, storeBranches, stores, users, type Db } from '@realmarket/database';
import { DEMO_CATALOG } from '@realmarket/product-catalog';
import { hashPassword } from './auth';
import { saveLayout } from './layout';
import { addProductToStore, insertProduct, runParametricModelJob } from './products';

export const DEMO_STORE_ID = 'demo-market';

/**
 * Boş veritabanına demo verisi yükler: 1 mağaza, admin kullanıcısı, örnek katalog,
 * parametrik mağaza yerleşimi ve otomatik planogramlar. Veri varsa hiçbir şey yapmaz.
 */
export async function seedDemo(db: Db, opts: { adminEmail: string; adminPassword?: string; log?: (msg: string) => void }) {
  const log = opts.log ?? (() => {});
  const [{ n }] = await db.select({ n: count() }).from(stores);
  if (n > 0) return { seeded: false as const };

  await db.insert(stores).values({ id: DEMO_STORE_ID, name: 'RealMarket Demo Mağaza', chain: 'DEMO', isDemo: true });
  await db.insert(storeBranches).values({ storeId: DEMO_STORE_ID, name: 'Demo Şube', city: 'İstanbul', address: 'Sanal adres — örnek veri' });

  let generatedPassword: string | undefined;
  const password = opts.adminPassword ?? (generatedPassword = randomBytes(9).toString('base64url'));
  await db.insert(users).values({ email: opts.adminEmail.toLowerCase(), passwordHash: hashPassword(password), displayName: 'Sistem Yöneticisi', role: 'admin' });

  const productIds: string[] = [];
  await db.transaction(async (tx) => {
    for (const d of DEMO_CATALOG) {
      const productId = await insertProduct(tx, {
        gtin: d.gtin,
        name: d.name,
        brand: d.brand,
        category: d.category,
        subcategory: d.subcategory,
        netWeightG: d.netWeightG,
        volumeMl: d.volumeMl,
        packagingType: d.packagingType,
        dimensions: { widthMm: d.dims[0], heightMm: d.dims[1], depthMm: d.dims[2], verified: false, source: 'DEMO_ESTIMATE' },
        appearance: d.appearance,
        dataSource: 'DEMO_SAMPLE',
        sourceRef: `demo:${d.key}`,
        dataLicense: 'DEMO_GENERATED',
        verification: 'DEMO_SAMPLE',
        modelQuality: 'PLACEHOLDER',
        isDemo: true,
      });
      await tx.insert(productAssetLicenses).values({
        productId,
        assetType: 'model',
        license: 'DEMO_GENERATED',
        attribution: 'RealMarket 3D parametrik model + prosedürel etiket',
        commercialUseAllowed: true,
        notes: 'Kurgusal marka; gerçek ambalaj görseli içermez.',
      });
      await addProductToStore(tx, {
        storeId: DEMO_STORE_ID,
        productId,
        priceKurus: d.priceKurus,
        listPriceKurus: d.listPriceKurus,
        promotion: d.promotion,
        stock: d.stock,
        storeSku: `DEMO-${d.key.toUpperCase()}`,
      });
      productIds.push(productId);
    }
  });
  log(`${productIds.length} demo ürün eklendi`);

  for (const id of productIds) await runParametricModelJob(db, id);
  log('parametrik model işleri tamamlandı');

  const result = await saveLayout(db, DEMO_STORE_ID, {});
  log(`mağaza yerleşimi v${result.version}: ${result.layout.shelves.length} raf`);

  // Demo stoğu: raf kapasitesi + %30 depo stoğu (raflar açılışta dolu görünür).
  const caps = await db
    .select({ storeProductId: shelfSlots.storeProductId, capacity: sum(shelfSlots.capacity) })
    .from(shelfSlots)
    .groupBy(shelfSlots.storeProductId);
  for (const c of caps) {
    const target = Math.ceil(Number(c.capacity ?? 0) * 1.3);
    await db
      .update(inventory)
      .set({ onHand: sql`greatest(${inventory.onHand}, ${target})` })
      .where(eq(inventory.storeProductId, c.storeProductId));
  }

  const [admin] = await db.select().from(users).where(eq(users.email, opts.adminEmail.toLowerCase()));
  return { seeded: true as const, adminId: admin.id, generatedPassword };
}
