import { useEffect } from 'react';
import { formatPrice } from '@realmarket/shared';
import { useGame } from '../state/game';
import { exitLock, requestLock } from './pointer';

/** Sanal kasa: barkod okutma simülasyonu, sunucu toplamı, demo ödeme ve fiş. */
export function CheckoutModal() {
  const c = useGame((s) => s.checkout);
  const lane = useGame((s) => s.nearCheckout);
  useEffect(() => exitLock(), []);
  if (!c) return null;
  const lines = c.quote?.lines ?? [];
  const close = () => {
    useGame.getState().closeCheckout();
    requestLock();
  };
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/50 p-3" data-testid="checkout-modal">
      <div className="panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="font-bold">Kasa {lane?.replace('K', '') ?? ''} · Demo ödeme</h2>
          {c.stage !== 'paying' && c.stage !== 'done' && (
            <button className="btn-ghost px-2 py-1" onClick={close} aria-label="Kapat">
              ✕
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {c.stage === 'loading' && <p className="text-sm text-slate-300">Sepet sunucuda doğrulanıyor…</p>}
          {c.stage === 'error' && <p className="text-sm text-rose-300">{c.error}</p>}
          {(c.stage === 'scanning' || c.stage === 'review' || c.stage === 'paying') && (
            <>
              <p className="mb-3 text-xs text-slate-400">{c.stage === 'scanning' ? 'Ürünler okutuluyor… (barkod simülasyonu)' : 'Tüm ürünler okutuldu.'}</p>
              <ul className="space-y-1.5 font-mono text-xs">
                {lines.slice(0, c.stage === 'scanning' ? c.scanned : lines.length).map((l) => (
                  <li key={l.storeProductId} className="rounded-lg bg-white/5 px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{l.name}</span>
                      <span>{formatPrice(l.lineSubtotalKurus)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>
                        {l.gtin} · {l.quantity} × {formatPrice(l.unitPriceKurus)}
                      </span>
                      {l.discountKurus > 0 && (
                        <span className="text-emerald-300">
                          {l.promotionLabel} −{formatPrice(l.discountKurus)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {c.stage !== 'scanning' && c.quote && (
                <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm">
                  <div className="flex justify-between text-slate-300">
                    <span>Ara toplam</span>
                    <span>{formatPrice(c.quote.subtotalKurus)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-300">
                    <span>İndirimler</span>
                    <span>−{formatPrice(c.quote.discountKurus)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-extrabold">
                    <span>Ödenecek</span>
                    <span data-testid="checkout-total">{formatPrice(c.quote.totalKurus)}</span>
                  </div>
                  {c.error && <p className="text-xs text-amber-300">{c.error}</p>}
                  <p className="text-[11px] text-slate-500">Bu bir demo ödemedir; kart bilgisi istenmez ve gerçek tahsilat yapılmaz.</p>
                </div>
              )}
            </>
          )}
          {c.stage === 'done' && c.order && (
            <div className="text-center" data-testid="receipt">
              <div className="mb-2 text-4xl">✓</div>
              <p className="mb-1 text-lg font-bold text-emerald-300">Ödeme tamamlandı (demo)</p>
              <p className="mb-4 text-sm text-slate-300">
                Sipariş no: <b data-testid="order-number">{c.order.orderNumber}</b>
              </p>
              <div className="mx-auto max-w-xs rounded-xl bg-white p-4 text-left font-mono text-xs text-slate-900">
                <div className="mb-2 text-center font-bold">REALMARKET DEMO FİŞ</div>
                {c.order.items.map((i) => (
                  <div key={i.gtin} className="flex justify-between">
                    <span className="truncate pr-2">
                      {i.quantity}× {i.name}
                    </span>
                    <span>{formatPrice(i.lineTotalKurus)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-dashed border-slate-400 pt-1 font-bold">
                  <span>TOPLAM</span>
                  <span>{formatPrice(c.order.totalKurus)}</span>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">Ref: {c.order.paymentRef}</div>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-white/10 p-4">
          {c.stage === 'review' && (
            <button className="btn-primary w-full py-3" onClick={() => void useGame.getState().pay()} data-testid="pay-button">
              Demo ödeme ile öde
            </button>
          )}
          {c.stage === 'paying' && (
            <button className="btn-primary w-full py-3" disabled>
              Ödeme işleniyor…
            </button>
          )}
          {c.stage === 'done' && (
            <button
              className="btn-primary w-full py-3"
              onClick={() => {
                void useGame.getState().finishCheckout();
                requestLock();
              }}
              data-testid="new-shopping"
            >
              Yeni alışverişe başla
            </button>
          )}
          {c.stage === 'error' && (
            <button className="btn-ghost w-full" onClick={close}>
              Kapat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
