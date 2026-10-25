import { useEffect } from 'react';
import { Experience } from './scene/Experience';
import { useGame } from './state/game';
import { input, isTypingTarget } from './world/input';
import { runtime } from './world/runtime';
import { registry } from './world/units';
import { CheckoutModal } from './ui/Checkout';
import { Hud } from './ui/Hud';
import { MobileControls } from './ui/MobileControls';
import { CartPanel, InspectPanel, ListPanel, MenuPanel, SearchPanel } from './ui/Panels';
import { exitLock, requestLock } from './ui/pointer';
import { ErrorScreen, LoadingScreen, StartScreen } from './ui/Screens';

/** Klavye kısayolları (yazı alanlarında devre dışı). */
function useKeyboard() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const st = useGame.getState();
      if (e.code === 'Escape') {
        if (st.checkout) st.closeCheckout();
        else if (st.held?.mode === 'inspect') st.toggleInspect();
        else if (st.panel) useGame.setState({ panel: null });
        return;
      }
      if (isTypingTarget(e.target) || st.phase !== 'playing') return;
      input.keys.add(e.code);
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyE':
          st.pick();
          break;
        case 'KeyF':
          st.toggleInspect();
          if (useGame.getState().held?.mode !== 'inspect') requestLock();
          break;
        case 'KeyG':
          st.putInCart();
          requestLock();
          break;
        case 'KeyR':
          st.returnToShelf();
          requestLock();
          break;
        case 'KeyC':
          st.toggleCartAttach();
          break;
        case 'Tab':
          e.preventDefault();
          st.setPanel('cart');
          break;
        case 'KeyQ':
          e.preventDefault();
          st.setPanel('search');
          break;
        case 'KeyL':
          st.setPanel('list');
          break;
        case 'KeyM':
          st.setPanel('menu');
          break;
      }
    };
    const up = (e: KeyboardEvent) => input.keys.delete(e.code);
    const blur = () => input.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
}

/** Fare kilidi: ESC ile kilit bırakılınca menü açılır (tarayıcı ESC'yi sayfaya iletmez). */
function usePointerLock() {
  useEffect(() => {
    const onChange = () => {
      const locked = !!document.pointerLockElement;
      input.pointerLocked = locked;
      const st = useGame.getState();
      st.setPointerLocked(locked);
      if (!locked && st.phase === 'playing' && !st.panel && !st.checkout && st.held?.mode !== 'inspect' && !st.isTouch) {
        useGame.setState({ panel: 'menu' });
      }
    };
    document.addEventListener('pointerlockchange', onChange);
    // panel/kasa/inceleme açılınca kilidi bırak: kilitliyken tıklamalar panel düğmelerine ulaşmaz
    const unsub = useGame.subscribe((s, prev) => {
      if ((s.panel && !prev.panel) || (s.checkout && !prev.checkout) || (s.held?.mode === 'inspect' && prev.held?.mode !== 'inspect')) exitLock();
    });
    return () => {
      document.removeEventListener('pointerlockchange', onChange);
      unsub();
    };
  }, []);
}

/** Otomatik uçtan uca testler için kontrollü test kancaları (yalnızca geliştirme). */
function useTestHooks() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__rm3d = {
      state: () => useGame.getState(),
      runtime,
      input,
      registry,
      /** Bir ürünün raftaki ilk birimini seçip ele alır. */
      pickProduct(nameIncludes: string) {
        const p = [...registry.products.values()].find((x) => x.name.includes(nameIncludes));
        if (!p) return false;
        const idx = (registry.byProduct.get(p.id) ?? []).find((i) => !registry.units[i].taken);
        if (idx === undefined) return false;
        runtime.forcedUnit = idx;
        useGame.getState().pick();
        return true;
      },
      /** Oyuncuyu (ve arabayı) bir noktaya taşır. */
      teleport(x: number, z: number) {
        runtime.playerPos.set(x, 0, z);
        const fx = -Math.sin(runtime.cartYaw);
        const fz = -Math.cos(runtime.cartYaw);
        runtime.cartPos.set(x + fx * 0.8, 0, z + fz * 0.8);
      },
    };
  }, []);
}

export function App() {
  const phase = useGame((s) => s.phase);
  const loadError = useGame((s) => s.loadError);
  const panel = useGame((s) => s.panel);
  const checkout = useGame((s) => s.checkout);
  const held = useGame((s) => s.held);
  const isTouch = useGame((s) => s.isTouch);
  useKeyboard();
  usePointerLock();
  useTestHooks();

  useEffect(() => {
    void useGame.getState().init();
  }, []);

  const inspectProduct = held?.mode === 'inspect' ? useGame.getState().productById(held.productId) : undefined;

  return (
    <div className="relative h-full w-full">
      {phase !== 'loading' && phase !== 'error' && <Experience />}
      {phase === 'loading' && <LoadingScreen />}
      {phase === 'error' && <ErrorScreen message={loadError ?? ''} />}
      {phase === 'ready' && <StartScreen />}
      {phase === 'playing' && (
        <>
          <Hud />
          {isTouch && !checkout && held?.mode !== 'inspect' && !panel && <MobileControls />}
          {panel === 'cart' && <CartPanel />}
          {panel === 'search' && <SearchPanel />}
          {panel === 'list' && <ListPanel />}
          {panel === 'menu' && <MenuPanel />}
          {inspectProduct && <InspectPanel product={inspectProduct} />}
          {checkout && <CheckoutModal />}
        </>
      )}
    </div>
  );
}
