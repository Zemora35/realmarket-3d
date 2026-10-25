import { expect, test } from '@playwright/test';
import { cartCount, enterStore, SHOTS, standAtShelf, waitForServerCart } from './helpers';

test('market içinde yürüyüp alışveriş yapılır ve demo ödeme tamamlanır', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await enterStore(page, 'medium');
  await page.screenshot({ path: `${SHOTS}/01-giris.png` });

  // 1) W ile yürü: oyuncu ve araba ilerler (yazılım GPU'sunda kare hızı düşük olduğundan sonuca göre beklenir)
  const before = await page.evaluate(() => (window as any).__rm3d.runtime.playerPos.z);
  const cartBefore = await page.evaluate(() => (window as any).__rm3d.runtime.cartPos.z);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => (window as any).__rm3d.runtime.playerPos.z), { timeout: 30_000 }).toBeGreaterThan(before + 0.4);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => (window as any).__rm3d.runtime.cartPos.z)).toBeGreaterThan(cartBefore + 0.3);

  // 2) içecek reyonundaki bir rafın önüne geç
  const shelfId = await page.evaluate(() => {
    const st = (window as any).__rm3d.state();
    const cola = st.scene.products.find((p: any) => p.name.includes('Kola'));
    return st.scene.slots.find((s: any) => s.productId === cola.id && s.shelfId.startsWith('G')).shelfId as string;
  });
  await standAtShelf(page, shelfId);
  await page.screenshot({ path: `${SHOTS}/02-koridor.png` });

  // nişangâh rafta bir ürüne denk gelmeli (ışın seçimi)
  await expect.poll(() => page.evaluate(() => (window as any).__rm3d.state().hoveredProductId)).not.toBeNull();
  await expect(page.getByTestId('hover-info')).toBeVisible();

  // 3) nişangâhtaki ürünü E ile al, F ile 360° incele
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('held-info')).toBeVisible();
  await page.keyboard.press('KeyF');
  await expect(page.getByTestId('inspect-panel')).toBeVisible();
  // sürükleyerek döndür
  await page.mouse.move(500, 360);
  await page.mouse.down();
  await page.mouse.move(650, 300, { steps: 6 });
  await page.mouse.up();
  const spin = await page.evaluate(() => (window as any).__rm3d.runtime.held.spinY);
  expect(Math.abs(spin)).toBeGreaterThan(0.5);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/03-inceleme.png` });

  // 4) arabaya koy (araba yakında)
  await page.getByTestId('inspect-to-cart').click();
  await waitForServerCart(page, 1);

  // 5) kola ve 3 cips daha al
  for (const name of ['Kola', 'Klasik Patates', 'Klasik Patates', 'Klasik Patates']) {
    expect(await page.evaluate((n) => (window as any).__rm3d.pickProduct(n), name)).toBe(true);
    await page.waitForTimeout(350);
    await page.keyboard.press('KeyG');
  }
  await waitForServerCart(page, 5);
  expect(await cartCount(page)).toBe(5);
  // arabaya bak
  await page.evaluate(() => {
    const r = (window as any).__rm3d.runtime;
    r.yaw = Math.atan2(-(r.cartPos.x - r.playerPos.x), -(r.cartPos.z - r.playerPos.z));
    r.pitch = -0.75;
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/04-araba.png` });

  // 6) sepet paneli: toplam ve arabadan çıkarma (rafa geri)
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('cart-panel')).toBeVisible();
  await expect(page.getByTestId('cart-total')).toContainText('₺');
  const shelfBefore = await page.evaluate(() => {
    const h = (window as any).__rm3d;
    const p = [...h.registry.products.values()].find((x: any) => x.name.includes('Klasik Patates'));
    return h.registry.shelfCount(p.id);
  });
  await page.getByTestId('remove-one').last().click();
  await waitForServerCart(page, 4);
  const shelfAfter = await page.evaluate(() => {
    const h = (window as any).__rm3d;
    const p = [...h.registry.products.values()].find((x: any) => x.name.includes('Klasik Patates'));
    return h.registry.shelfCount(p.id);
  });
  expect(shelfAfter).toBe(shelfBefore + 1);
  await page.screenshot({ path: `${SHOTS}/05-sepet.png` });
  await page.keyboard.press('Escape');

  // 7) ürün arama ve A* rota
  await page.keyboard.press('KeyQ');
  await page.getByTestId('search-input').fill('süt');
  await page.getByTestId('navigate-to').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__rm3d.state().nav.path?.length ?? 0)).toBeGreaterThan(1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/06-rota.png` });

  // 8) kasaya git, araba ile birlikte
  await page.evaluate(() => {
    const h = (window as any).__rm3d;
    const st = h.state();
    st.clearNav();
    const lane = st.scene.layout.checkouts[0];
    const x = (lane.zone.minX + lane.zone.maxX) / 2;
    const z = (lane.zone.minZ + lane.zone.maxZ) / 2;
    h.runtime.playerPos.set(x, 0, z);
    h.runtime.cartPos.set(x, 0, z + 1.2);
    h.runtime.yaw = 0;
    h.runtime.pitch = -0.2;
  });
  await expect(page.getByTestId('checkout-prompt')).toBeVisible();
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('checkout-modal')).toBeVisible();
  await expect(page.getByTestId('pay-button')).toBeVisible({ timeout: 20_000 });
  const total = await page.getByTestId('checkout-total').textContent();
  expect(total).toContain('₺');
  await page.getByTestId('pay-button').click();
  await expect(page.getByTestId('receipt')).toBeVisible();
  await expect(page.getByTestId('order-number')).toHaveText(/^RM-\d{8}-[0-9A-F]{6}$/);
  await page.screenshot({ path: `${SHOTS}/07-fis.png` });
  await page.getByTestId('new-shopping').click();
  await expect.poll(() => cartCount(page)).toBe(0);

  expect(errors).toEqual([]);
});
