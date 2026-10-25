import { randomBytes } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import {
  cartItems,
  inventory,
  orderItems,
  orders,
  productBarcodes,
  products,
  shoppingSessions,
  storePrices,
  storeProducts,
  type Db,
} from '@realmarket/database';
import { priceCart } from '@realmarket/shopping';
import type { CartDto, OrderDto } from '@realmarket/shared';
import { HttpError, notFound, unauthorized } from '../errors';
import { createSessionToken, hashSessionToken, safeEqualHex } from './auth';
import type { PaymentProvider } from './payment';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export const MAX_LINE_QUANTITY = 50;

export async function createShoppingSession(db: Db, storeId: string) {
  const { token, hash } = createSessionToken();
  const [row] = await db.insert(shoppingSessions).values({ storeId, tokenHash: hash }).returning();
  return { sessionId: row.id, token, storeId };
}

/** Oturum anahtarını doğrular (oturum izolasyonu): başka birinin sepetine erişilemez. */
export async function authorizeSession(db: Db, sessionId: string, token: string | undefined, opts: { requireActive?: boolean } = {}) {
  if (!token) throw unauthorized('Oturum anahtarı eksik');
  const [session] = await db.select().from(shoppingSessions).where(eq(shoppingSessions.id, sessionId));
  if (!session || !safeEqualHex(session.tokenHash, hashSessionToken(token))) throw unauthorized();
  if (opts.requireActive && session.status !== 'active') {
    throw new HttpError(409, 'SESSION_CLOSED', 'Bu alışveriş oturumu kapanmış');
  }
  await db.update(shoppingSessions).set({ lastSeenAt: new Date() }).where(eq(shoppingSessions.id, sessionId));
  return session;
}

async function loadCartLines(db: Executor, sessionId: string) {
  return db
    .select({
      storeProductId: cartItems.storeProductId,
      quantity: cartItems.quantity,
      productId: products.id,
      name: products.name,
      gtin: productBarcodes.gtin,
      priceKurus: storePrices.priceKurus,
      promotion: storePrices.promotion,
    })
    .from(cartItems)
    .innerJoin(storeProducts, eq(storeProducts.id, cartItems.storeProductId))
    .innerJoin(products, eq(products.id, storeProducts.productId))
    .innerJoin(productBarcodes, and(eq(productBarcodes.productId, products.id), eq(productBarcodes.isPrimary, true)))
    .innerJoin(storePrices, and(eq(storePrices.storeProductId, storeProducts.id), eq(storePrices.isCurrent, true)))
    .where(eq(cartItems.sessionId, sessionId))
    .orderBy(cartItems.addedAt);
}

/** Sepeti yalnızca sunucudaki güncel fiyatlarla hesaplar. */
export async function getCart(db: Executor, sessionId: string, status: CartDto['status'] = 'active'): Promise<CartDto> {
  const lines = await loadCartLines(db, sessionId);
  const priced = priceCart(
    lines.map((l) => ({ storeProductId: l.storeProductId, quantity: l.quantity, unitPriceKurus: l.priceKurus, promotion: l.promotion })),
  );
  return {
    sessionId,
    status,
    lines: priced.lines.map((pl, i) => ({
      storeProductId: pl.storeProductId,
      productId: lines[i].productId,
      name: lines[i].name,
      gtin: lines[i].gtin,
      quantity: pl.quantity,
      unitPriceKurus: pl.unitPriceKurus,
      lineSubtotalKurus: pl.lineSubtotalKurus,
      discountKurus: pl.discountKurus,
      lineTotalKurus: pl.lineTotalKurus,
      promotionLabel: pl.promotionLabel,
    })),
    itemCount: priced.itemCount,
    subtotalKurus: priced.subtotalKurus,
    discountKurus: priced.discountKurus,
    totalKurus: priced.totalKurus,
  };
}

/** Sepete ekler ve stoğu atomik olarak ayırır (eşzamanlı müşterilerde aşırı satış olmaz). */
export async function addToCart(db: Db, session: { id: string; storeId: string }, storeProductId: string, quantity: number) {
  return db.transaction(async (tx) => {
    const [sp] = await tx.select().from(storeProducts).where(eq(storeProducts.id, storeProductId));
    if (!sp || sp.storeId !== session.storeId || !sp.isActive) throw notFound('Ürün');
    const [existing] = await tx
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.sessionId, session.id), eq(cartItems.storeProductId, storeProductId)));
    if ((existing?.quantity ?? 0) + quantity > MAX_LINE_QUANTITY) {
      throw new HttpError(422, 'QUANTITY_LIMIT', `Bir üründen en fazla ${MAX_LINE_QUANTITY} adet alınabilir`);
    }
    const reserved = await tx
      .update(inventory)
      .set({ reserved: sql`${inventory.reserved} + ${quantity}`, updatedAt: new Date() })
      .where(and(eq(inventory.storeProductId, storeProductId), sql`${inventory.onHand} - ${inventory.reserved} >= ${quantity}`))
      .returning({ storeProductId: inventory.storeProductId });
    if (!reserved.length) throw new HttpError(409, 'OUT_OF_STOCK', 'Bu üründen yeterli stok yok');
    if (existing) {
      await tx.update(cartItems).set({ quantity: existing.quantity + quantity }).where(eq(cartItems.id, existing.id));
    } else {
      await tx.insert(cartItems).values({ sessionId: session.id, storeProductId, quantity });
    }
    return getCart(tx, session.id);
  });
}

export async function removeFromCart(db: Db, sessionId: string, storeProductId: string, quantity: number) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.sessionId, sessionId), eq(cartItems.storeProductId, storeProductId)));
    if (!item) throw notFound('Sepetteki ürün');
    const q = Math.min(quantity, item.quantity);
    if (item.quantity - q <= 0) await tx.delete(cartItems).where(eq(cartItems.id, item.id));
    else await tx.update(cartItems).set({ quantity: item.quantity - q }).where(eq(cartItems.id, item.id));
    await tx
      .update(inventory)
      .set({ reserved: sql`greatest(${inventory.reserved} - ${q}, 0)`, updatedAt: new Date() })
      .where(eq(inventory.storeProductId, storeProductId));
    return getCart(tx, sessionId);
  });
}

function makeOrderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `RM-${ymd}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Ödeme: tutar sunucuda yeniden hesaplanır; istemcinin beklediği toplam farklıysa
 * (fiyat değişmiş) 409 ile güncel teklif döner. Stok düşümü ve sipariş tek işlemde yapılır.
 */
export async function checkout(
  db: Db,
  session: { id: string; storeId: string },
  expectedTotalKurus: number,
  provider: PaymentProvider,
): Promise<OrderDto> {
  return db.transaction(async (tx) => {
    const cart = await getCart(tx, session.id);
    if (!cart.lines.length) throw new HttpError(400, 'CART_EMPTY', 'Sepet boş');
    if (cart.totalKurus !== expectedTotalKurus) {
      throw new HttpError(409, 'PRICE_CHANGED', 'Sepet tutarı değişti, lütfen tekrar onaylayın', cart);
    }
    const orderNumber = makeOrderNumber();
    // DEMO sağlayıcı anlıktır. Gerçek sağlayıcıda ödeme işlem dışında başlatılıp webhook ile tamamlanmalı.
    const charge = await provider.charge({ orderNumber, amountKurus: cart.totalKurus, currency: 'TRY' });
    if (!charge.ok) throw new HttpError(402, 'PAYMENT_FAILED', charge.message ?? 'Ödeme başarısız');

    for (const line of cart.lines) {
      const updated = await tx
        .update(inventory)
        .set({
          onHand: sql`${inventory.onHand} - ${line.quantity}`,
          reserved: sql`${inventory.reserved} - ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(and(eq(inventory.storeProductId, line.storeProductId), sql`${inventory.reserved} >= ${line.quantity}`))
        .returning({ id: inventory.storeProductId });
      if (!updated.length) throw new HttpError(409, 'RESERVATION_LOST', `${line.name} için stok ayırması bulunamadı`);
    }
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        sessionId: session.id,
        storeId: session.storeId,
        status: 'paid',
        subtotalKurus: cart.subtotalKurus,
        discountKurus: cart.discountKurus,
        totalKurus: cart.totalKurus,
        paymentProvider: provider.id,
        paymentRef: charge.reference,
      })
      .returning();
    await tx.insert(orderItems).values(
      cart.lines.map((l) => ({
        orderId: order.id,
        storeProductId: l.storeProductId,
        productId: l.productId,
        name: l.name,
        gtin: l.gtin,
        quantity: l.quantity,
        unitPriceKurus: l.unitPriceKurus,
        discountKurus: l.discountKurus,
        lineTotalKurus: l.lineTotalKurus,
      })),
    );
    await tx.delete(cartItems).where(eq(cartItems.sessionId, session.id));
    await tx.update(shoppingSessions).set({ status: 'checked_out' }).where(eq(shoppingSessions.id, session.id));
    return {
      id: order.id,
      orderNumber,
      storeId: order.storeId,
      status: order.status,
      subtotalKurus: order.subtotalKurus,
      discountKurus: order.discountKurus,
      totalKurus: order.totalKurus,
      paymentProvider: order.paymentProvider,
      paymentRef: order.paymentRef,
      createdAt: order.createdAt.toISOString(),
      items: cart.lines.map((l) => ({
        name: l.name,
        gtin: l.gtin,
        quantity: l.quantity,
        unitPriceKurus: l.unitPriceKurus,
        discountKurus: l.discountKurus,
        lineTotalKurus: l.lineTotalKurus,
      })),
    };
  });
}

/** Terk edilmiş oturumların stok ayırmalarını serbest bırakır. */
export async function releaseStaleSessions(db: Db, maxIdleMinutes = 120): Promise<number> {
  const cutoff = new Date(Date.now() - maxIdleMinutes * 60_000);
  const stale = await db
    .select({ id: shoppingSessions.id })
    .from(shoppingSessions)
    .where(and(eq(shoppingSessions.status, 'active'), lt(shoppingSessions.lastSeenAt, cutoff)));
  for (const s of stale) {
    await db.transaction(async (tx) => {
      const items = await tx.select().from(cartItems).where(eq(cartItems.sessionId, s.id));
      for (const it of items) {
        await tx
          .update(inventory)
          .set({ reserved: sql`greatest(${inventory.reserved} - ${it.quantity}, 0)` })
          .where(eq(inventory.storeProductId, it.storeProductId));
      }
      await tx.delete(cartItems).where(eq(cartItems.sessionId, s.id));
      await tx.update(shoppingSessions).set({ status: 'abandoned' }).where(eq(shoppingSessions.id, s.id));
    });
  }
  return stale.length;
}
