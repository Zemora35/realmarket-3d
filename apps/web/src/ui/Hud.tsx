import { useEffect, useRef } from 'react';
import { formatPrice } from '@realmarket/shared';
import { promotionLabel } from '@realmarket/shopping';
import { useGame } from '../state/game';
import { runtime } from '../world/runtime';
import { requestLock } from './pointer';

function Kbd({ k, touch }: { k: string; touch: boolean }) {
  return touch ? null : <span className="kbd mr-1">{k}</span>;
}

export function Hud() {
  const s = useGame();
  const hovered = s.hoveredProductId ? s.productById(s.hoveredProductId) : undefined;
  const held = s.held ? s.productById(s.held.productId) : undefined;
  const fpsRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (fpsRef.current) fpsRef.current.textContent = `${runtime.fps} FPS`;
    }, 500);
    return () => clearInterval(id);
  }, []);
  const navProduct = s.nav.targets[0] ? s.productById(s.nav.targets[0].productId) : undefined;
  const needsClick = !s.isTouch && !s.pointerLocked && !s.panel && !s.checkout && s.held?.mode !== 'inspect';

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none" data-testid="hud">
      {/* üst çubuk */}
      <div className="flex items-start justify-between gap-2 p-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="panel pointer-events-auto hidden px-3 py-2 sm:block">
          <div className="flex items-center gap-2 text-sm font-bold">
            RealMarket 3D <span className="rounded bg-amber-500 px-1.5 text-[10px] text-black">DEMO</span>
          </div>
          <div className="text-xs text-slate-400">{s.scene?.store.name}</div>
        </div>
        <div className="pointer-events-auto ml-auto flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={() => s.setPanel('search')} data-testid="open-search">
            <Kbd k="Q" touch={s.isTouch} />
            Ara
          </button>
          <button className="btn-ghost" onClick={() => s.setPanel('list')}>
            <Kbd k="L" touch={s.isTouch} />
            Liste{s.shoppingList.length ? ` (${s.shoppingList.length})` : ''}
          </button>
          <button className="btn-primary" onClick={() => s.setPanel('cart')} data-testid="open-cart">
            <Kbd k="Tab" touch={s.isTouch} />
            Sepet · {s.cartUnits.length} · {formatPrice(s.cart?.totalKurus ?? 0)}
          </button>
          <button className="btn-ghost" onClick={() => s.setPanel('menu')} aria-label="Menü">
            ☰
          </button>
        </div>
      </div>

      {/* nişangâh + hedef bilgisi */}
      {!s.held && !s.checkout && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`h-2 w-2 rounded-full ${hovered ? 'scale-150 bg-emerald-400' : 'bg-white/80'} shadow transition`} />
        </div>
      )}
      {hovered && !s.held && (
        <div className="absolute top-1/2 left-1/2 mt-6 -translate-x-1/2 text-center" data-testid="hover-info">
          <div className="panel px-4 py-2">
            <div className="text-sm font-semibold">{hovered.name}</div>
            <div className="text-xs text-slate-300">
              {formatPrice(hovered.priceKurus)}
              {hovered.promotion && <span className="ml-2 rounded bg-rose-600 px-1.5 text-[10px] font-bold">{promotionLabel(hovered.promotion)}</span>}
            </div>
            {!s.isTouch && (
              <div className="mt-1 text-[11px] text-slate-400">
                {s.hoveringCart ? (
                  <>
                    <span className="kbd">E</span> arabadan al
                  </>
                ) : (
                  <>
                    <span className="kbd">E</span> al · <span className="kbd">F</span> incele · <span className="kbd">G</span> arabaya
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* alt bilgi */}
      {/* dokunmatikte joystick ve eylem düğmelerinin üstünde kalır */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3"
        style={{ paddingBottom: s.isTouch ? 'calc(11rem + env(safe-area-inset-bottom))' : 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {held && s.held?.mode === 'hold' && (
          <div className="panel pointer-events-auto px-4 py-2 text-center text-sm" data-testid="held-info">
            Elinizde: <b>{held.name}</b> — {formatPrice(held.priceKurus)}
            {!s.isTouch && (
              <div className="mt-1 text-xs text-slate-400">
                <span className="kbd">G</span> arabaya koy · <span className="kbd">R</span> rafa bırak · <span className="kbd">F</span> 360° incele
              </div>
            )}
          </div>
        )}
        {s.nearCheckout && !s.held && !s.checkout && (
          <button className="btn-primary pointer-events-auto animate-pulse px-6 py-3 text-base" onClick={() => void s.openCheckout()} data-testid="checkout-prompt">
            <Kbd k="E" touch={s.isTouch} />
            Kasa {s.nearCheckout.replace('K', '')}: ödemeye geç
          </button>
        )}
        {!s.cartAttached && (
          <div className="panel px-3 py-1.5 text-xs text-amber-200">
            {s.isTouch ? (
              'Araba bırakıldı — yanına gidip “Arabayı tut” düğmesine basın'
            ) : (
              <>
                Araba bırakıldı — yanına gidip <Kbd k="C" touch={false} /> tutun
              </>
            )}
          </div>
        )}
        {navProduct && (
          <div className="panel pointer-events-auto flex items-center gap-3 px-3 py-1.5 text-xs">
            <span className="text-cyan-300">➜ Rota:</span> {navProduct.name}
            {s.nav.targets.length > 1 && <span className="text-slate-400">+{s.nav.targets.length - 1} durak</span>}
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={s.clearNav}>
              İptal
            </button>
          </div>
        )}
      </div>

      {needsClick && s.phase === 'playing' && (
        <button className="pointer-events-auto absolute inset-0 grid place-items-center bg-black/30" onClick={requestLock} data-testid="resume-overlay">
          <span className="panel px-5 py-3 text-sm">Devam etmek için tıklayın (fare ile etrafa bakılır)</span>
        </button>
      )}

      {!s.isTouch && (
        <div className="absolute bottom-2 left-3 hidden text-[11px] text-white/60 md:block">
          <span ref={fpsRef} /> · WASD yürü · E al · F incele · G arabaya · R rafa · C araba · Esc menü
        </div>
      )}

      {/* bildirimler */}
      <div className="absolute top-16 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
        {s.toasts.map((t) => (
          <div
            key={t.id}
            className={`panel px-4 py-2 text-sm ${t.tone === 'error' ? 'border-rose-500/50 text-rose-100' : t.tone === 'success' ? 'border-emerald-500/50 text-emerald-100' : ''}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
