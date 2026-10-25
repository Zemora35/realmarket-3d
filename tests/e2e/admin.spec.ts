import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SHOTS } from './helpers';

// Geliştirme admin bilgileri .env'den okunur (koda yazılmaz).
if (existsSync('.env')) process.loadEnvFile('.env');
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@realmarket.local';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? '';

test.use({ baseURL: 'http://localhost:5174', viewport: { width: 1440, height: 900 } });

test('yönetim paneli: giriş, ürün, planogram, yerleşim, kalite', async ({ page }) => {
  test.skip(!PASSWORD, 'SEED_ADMIN_PASSWORD tanımlı değil');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByTestId('login-email').fill(EMAIL);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByText('Ürün', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/10-admin-genel.png` });

  // Ürünler: seç, 3D önizleme, fiyat güncelle
  await page.getByRole('button', { name: 'Ürünler' }).click();
  await page.getByText('Tam Yağlı Süt 1 L').first().click();
  await expect(page.locator('canvas').first()).toBeVisible();
  const priceInput = page.getByLabel('Fiyat (₺)');
  await priceInput.fill('36,90');
  await page.getByRole('button', { name: 'Mağaza verisini kaydet' }).click();
  await expect(page.getByText('Mağaza fiyatı/stoğu güncellendi.')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/11-admin-urun.png` });

  // Model üretimi
  await page.getByRole('button', { name: 'Modeli yeniden üret' }).click();
  await expect(page.getByText(/Model üretildi ve doğrulandı/)).toBeVisible();

  // Planogram: raf seç, facing artır, kaydet
  await page.getByRole('button', { name: 'Planogramlar' }).click();
  await page.getByRole('button', { name: /^G1-A-01/ }).click();
  await expect(page.getByText('Canlı 3D önizleme')).toBeVisible();
  const block = page.locator('[draggable="true"]').first();
  await block.click();
  await page.getByRole('button', { name: '−' }).click();
  await page.getByRole('button', { name: 'Kaydet ve uygula' }).click();
  await expect(page.getByText(/Kaydedildi ve 3D mağazaya uygulandı/)).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/12-admin-planogram.png`, fullPage: true });

  // Yerleşim: 2D plan ve doğrulama
  await page.getByRole('button', { name: 'Mağaza yerleşimi' }).click();
  await expect(page.getByText(/raf birimi/)).toBeVisible();
  await page.getByLabel('Koridor genişliği (m)').fill('1.2');
  await expect(page.getByText(/alışveriş arabası için en az/)).toBeVisible();
  await page.getByLabel('Koridor genişliği (m)').fill('2.4');
  await page.screenshot({ path: `${SHOTS}/13-admin-yerlesim.png` });

  // Kalite kontrol
  await page.getByRole('button', { name: 'Kalite kontrol' }).click();
  await expect(page.getByText(/PLACEHOLDER_MODEL/).first()).toBeVisible();

  expect(errors).toEqual([]);
});
