import { expect, test, type Page } from '@playwright/test';

const badge = (page: Page) => page.locator('#cart-badge');

test.describe('web sitesi', () => {
  test('sayfalar açılır ve sepet sayfalar arasında korunur', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rafların arasında');
    await page.getByRole('link', { name: 'Ürünler', exact: true }).first().click();
    await expect(page).toHaveURL(/\/products$/);
    await page.getByLabel('Ürün ara').fill('süt');
    const cards = page.locator('.product');
    await expect(cards.first()).toBeVisible();
    await cards.first().getByRole('button', { name: 'Sepete ekle' }).click();
    await expect(badge(page)).toHaveText('1');

    // yeniden ziyaret: localStorage'daki oturum doğrulanır, sepet geri gelir
    await page.reload();
    await expect(badge(page)).toHaveText('1');
    await page.goto('/cart');
    await expect(page.locator('.cart-lines li')).toHaveCount(1);
    await page.getByRole('button', { name: 'Artır' }).click();
    await expect(badge(page)).toHaveText('2');
    await page.getByRole('button', { name: 'Azalt' }).click();
    await expect(badge(page)).toHaveText('1');
  });

  test('demo ödeme tamamlanır, sipariş hesapta görünür, yeni boş sepet açılır', async ({ page }) => {
    await page.goto('/products');
    await page.locator('.product').nth(2).getByRole('button', { name: 'Sepete ekle' }).click();
    await expect(badge(page)).toHaveText('1');
    const before = await page.evaluate(() => localStorage.getItem('realmarket.session.demo-market'));
    await page.goto('/checkout');
    await page.getByRole('button', { name: /öde \(demo\)/ }).click();
    await expect(page.getByRole('heading', { name: 'Teşekkürler!' })).toBeVisible();
    await expect(badge(page)).toBeHidden();
    const after = await page.evaluate(() => localStorage.getItem('realmarket.session.demo-market'));
    expect(JSON.parse(after!).sessionId).not.toBe(JSON.parse(before!).sessionId);
    await page.goto('/account');
    await expect(page.locator('.cart-lines li')).toHaveCount(1);
  });

  test('bilinmeyen yol 404 sayfası, yönetim bağlantısı gösterir', async ({ page }) => {
    await page.goto('/yok-boyle-sayfa');
    await expect(page.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByRole('link', { name: 'Yönetim panelini aç' })).toHaveAttribute('href', '/admin/');
  });
});

test.describe('Unity köprüsü (test dublörü ile sözleşme testi)', () => {
  test('oturum Unity\'ye aktarılır, Unity\'deki sepet değişikliği siteye yansır', async ({ page }) => {
    await page.goto('/products');
    await page.locator('.product').first().getByRole('button', { name: 'Sepete ekle' }).click();
    await expect(badge(page)).toHaveText('1');
    const site = await page.evaluate(() => JSON.parse(localStorage.getItem('realmarket.session.demo-market')!));

    await page.goto('/market');
    await page.waitForFunction(() => (window as unknown as { __mockUnity?: { session: unknown } }).__mockUnity?.session != null);
    const unitySession = await page.evaluate(() => (window as unknown as { __mockUnity: { session: { sessionId: string } } }).__mockUnity.session);
    expect(unitySession.sessionId).toBe(site.sessionId);
    await expect(page.locator('#loader')).toHaveCount(0);
    await expect(page.locator('#mini-cart')).toContainText('Toplam');

    // Unity içinde raftan ürün alındı → CART_UPDATED → site rozeti ve mini sepet güncellenir
    const sp = await page.evaluate(async () => {
      const res = await fetch('/api/stores/demo-market/products');
      return (await res.json())[3].storeProductId as string;
    });
    await page.evaluate((id) => (window as unknown as { __mockUnity: { addFromShelf(id: string): Promise<unknown> } }).__mockUnity.addFromShelf(id), sp);
    await expect(badge(page)).toHaveText('2');

    // sitede sepet değişince Unity'ye CART_UPDATED gönderilir
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Azalt' }).first().click();
    await expect(badge(page)).toHaveText('1');
    await page.goto('/market');
    await page.waitForFunction(() => (window as unknown as { __mockUnity?: { log: string[] } }).__mockUnity?.log.includes('SET_SESSION'));
  });

  test('ürün sayfasından "Rafta gör" Unity\'ye NAVIGATE_TO gönderir', async ({ page }) => {
    await page.goto('/products');
    await page.locator('.product').first().getByRole('link', { name: 'Rafta gör' }).click();
    await page.waitForFunction(() => (window as unknown as { __mockUnity?: { log: string[] } }).__mockUnity?.log.includes('NAVIGATE_TO'));
  });
});
