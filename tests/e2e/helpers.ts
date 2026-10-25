import { expect, type Page } from '@playwright/test';

export const SHOTS = 'tests/e2e/screenshots';

/** Markete girer ve sahnenin yüklenmesini bekler. */
export async function enterStore(page: Page, quality: 'low' | 'medium' | 'high' = 'low') {
  await page.addInitScript((q) => {
    try {
      localStorage.setItem('rm3d.quality', q);
      sessionStorage.clear();
    } catch {
      /* yok */
    }
  }, quality);
  await page.goto('/');
  await page.getByTestId('enter-store').click({ timeout: 60_000 });
  await page.waitForFunction(() => {
    const h = (window as any).__rm3d;
    return h && h.state().phase === 'playing' && h.registry.units.length > 1000 && (window as any).__r3f;
  });
  // ilk kareler
  await page.waitForTimeout(1500);
}

/** Oyuncuyu bir rafın önüne, rafa bakacak şekilde taşır (araba arkada bırakılır). */
export async function standAtShelf(page: Page, shelfId: string) {
  await page.evaluate((id) => {
    const h = (window as any).__rm3d;
    const st = h.state();
    const shelf = st.scene.layout.shelves.find((s: any) => s.id === id);
    const r = h.runtime;
    st.toggleCartAttach(); // bırak
    r.playerPos.set(shelf.accessPoint.x, 0, shelf.accessPoint.z);
    // göz hizasına en yakın raf katındaki bir ürüne nişan al
    const units = h.registry.units.filter((u: any) => u.shelfId === id && !u.taken);
    const target = units.sort((a: any, b: any) => Math.abs(a.pos.y + a.half.y - 1.3) - Math.abs(b.pos.y + b.half.y - 1.3))[0];
    const dx = target.pos.x - r.playerPos.x;
    const dz = target.pos.z - r.playerPos.z;
    const dy = target.pos.y + target.half.y - 1.62;
    r.yaw = Math.atan2(-dx, -dz);
    r.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    // araba oyuncunun arkasında
    r.cartPos.set(shelf.accessPoint.x + Math.sin(shelf.rotationY) * 1.1, 0, shelf.accessPoint.z + Math.cos(shelf.rotationY) * 1.1);
  }, shelfId);
  await page.waitForTimeout(1200);
}

export async function cartCount(page: Page) {
  return page.evaluate(() => (window as any).__rm3d.state().cartUnits.length);
}

export async function waitForServerCart(page: Page, items: number) {
  await expect.poll(() => page.evaluate(() => (window as any).__rm3d.state().cart?.itemCount ?? 0)).toBe(items);
}
