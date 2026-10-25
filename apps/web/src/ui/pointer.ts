import { useGame } from '../state/game';

/** Masaüstünde fare kilidini ister (kullanıcı hareketi içinden çağrılmalı). */
export function requestLock() {
  const st = useGame.getState();
  if (st.isTouch || st.phase !== 'playing') return;
  const c = document.querySelector('canvas');
  if (!c || document.pointerLockElement === c) return;
  try {
    const r = c.requestPointerLock?.() as unknown as Promise<void> | undefined;
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    /* tarayıcı reddetti (ör. ESC sonrası kısa bekleme) */
  }
}

export function exitLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
