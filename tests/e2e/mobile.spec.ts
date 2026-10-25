import { expect, test } from '@playwright/test';
import { enterStore, SHOTS, standAtShelf, waitForServerCart } from './helpers';

test('mobil dokunmatik kontroller: joystick, bakış, al ve arabaya koy', async ({ page }) => {
  await enterStore(page, 'low');
  expect(await page.evaluate(() => (window as any).__rm3d.state().isTouch)).toBe(true);
  const joystick = page.getByLabel("Hareket joystick'i");
  await expect(joystick).toBeVisible();

  // joystick'i yukarı it: oyuncu ilerler
  const box = (await joystick.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const z0 = await page.evaluate(() => (window as any).__rm3d.runtime.playerPos.z);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 60, { steps: 4 });
  await expect.poll(() => page.evaluate(() => (window as any).__rm3d.runtime.playerPos.z), { timeout: 30_000 }).toBeGreaterThan(z0 + 0.3);
  await page.mouse.up();

  // rafa yaklaş, "Al" ve "Arabaya koy" düğmeleri
  const shelfId = await page.evaluate(() => (window as any).__rm3d.state().scene.layout.shelves.find((s: any) => s.id.startsWith('G2-A')).id);
  await standAtShelf(page, shelfId);
  await expect(page.getByTestId('m-pick')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-mobil.png` });
  await page.getByTestId('m-pick').dispatchEvent('pointerdown');
  await page.getByRole('button', { name: 'Arabaya koy' }).dispatchEvent('pointerdown');
  await waitForServerCart(page, 1);
});
