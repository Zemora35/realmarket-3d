import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPrice, formatQuantity, PACKAGING_LABELS_TR, type SceneProduct } from '@realmarket/shared';
import { promotionLabel } from '@realmarket/shopping';
import { DEPARTMENTS } from '@realmarket/store-generator';
import { searchProducts, useGame, type Quality } from '../state/game';
import { registry } from '../world/units';
import { exitLock, requestLock } from './pointer';

function Drawer({ title, onClose, children, testId }: { title: string; onClose: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <div
      className="panel pointer-events-auto absolute top-16 right-3 bottom-3 z-20 flex w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden"
      data-testid={testId}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-bold">{title}</h2>
        <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="Kapat">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

const closePanel = () => {
  useGame.setState({ panel: null });
  requestLock();
};

export function CartPanel() {
  const cart = useGame((s) => s.cart);
  const cartUnits = useGame((s) => s.cartUnits);
  const nearCheckout = useGame((s) => s.nearCheckout);
  const removeFromCart = useGame((s) => s.removeFromCart);
  const openCheckout = useGame((s) => s.openCheckout);
  const pending = cartUnits.length !== (cart?.itemCount ?? 0);
  const goCheckout = () => {
    // en yakın kasaya rota: kasa bölgesinin merkezine sanal hedef
    const st = useGame.getState();
    const lane = st.scene?.layout.checkouts[0];
    if (!lane) return;
    const point = { x: (lane.zone.minX + lane.zone.maxX) / 2, z: (lane.zone.minZ + lane.zone.maxZ) / 2 + 0.8 };
    useGame.setState({ nav: { targets: [{ productId: '', point, unitIdx: -1 }], path: null }, panel: null });
    st.refreshRoute();
    st.toast('Kasaya rota gösteriliyor', 'success');
    requestLock();
  };
  return (
    <Drawer title={`Sepetim (${cartUnits.length} ürün)`} onClose={closePanel} testId="cart-panel">
      {!cart?.lines.length && <p className="text-sm text-slate-400">Sepetiniz boş. Raflardan ürün alıp arabaya koyun.</p>}
      <ul className="space-y-2">
        {cart?.lines.map((l) => (
          <li key={l.storeProductId} className="rounded-xl bg-white/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{l.name}</div>
                <div className="text-xs text-slate-400">
                  {l.quantity} × {formatPrice(l.unitPriceKurus)}
                  {l.promotionLabel && <span className="ml-2 rounded bg-rose-600 px-1.5 text-[10px] font-bold text-white">{l.promotionLabel}</span>}
                </div>
                {l.discountKurus > 0 && <div className="text-xs text-emerald-300">İndirim −{formatPrice(l.discountKurus)}</div>}
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{formatPrice(l.lineTotalKurus)}</div>
                <button className="btn-ghost mt-1 px-2 py-0.5 text-xs" onClick={() => void removeFromCart(l.storeProductId)} data-testid="remove-one">
                  − Çıkar (rafa)
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {cart && cart.lines.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm">
          <div className="flex justify-between text-slate-300">
            <span>Ara toplam</span>
            <span>{formatPrice(cart.subtotalKurus)}</span>
          </div>
          {cart.discountKurus > 0 && (
            <div className="flex justify-between text-emerald-300">
              <span>Kampanya indirimi</span>
              <span>−{formatPrice(cart.discountKurus)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold">
            <span>Toplam</span>
            <span data-testid="cart-total">{formatPrice(cart.totalKurus)}</span>
          </div>
          <p className="text-[11px] text-slate-500">Fiyatlar sunucuda hesaplanır · KDV dahil{pending ? ' · güncelleniyor…' : ''}</p>
        </div>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {nearCheckout ? (
          <button className="btn-primary" disabled={!cartUnits.length} onClick={() => void openCheckout()}>
            Ödemeye geç
          </button>
        ) : (
          <button className="btn-ghost" disabled={!cartUnits.length} onClick={goCheckout}>
            Kasaya yol göster
          </button>
        )}
      </div>
    </Drawer>
  );
}

export function SearchPanel() {
  const scene = useGame((s) => s.scene);
  const list = useGame((s) => s.shoppingList);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    exitLock();
    input.current?.focus();
  }, []);
  const results = useMemo(() => (scene ? searchProducts(scene.products, q).slice(0, 40) : []), [scene, q]);
  return (
    <Drawer title="Ürün ara" onClose={closePanel} testId="search-panel">
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ör. kola, süt, cips, barkod…"
        className="mb-3 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-400"
        data-testid="search-input"
      />
      <p className="mb-2 text-[11px] text-slate-500">Arama yereldeki mağaza kataloğunda yapılır (dış servise istek gönderilmez).</p>
      <ul className="space-y-2">
        {results.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 p-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{p.name}</div>
              <div className="text-xs text-slate-400">
                {DEPARTMENTS[p.category]?.name ?? p.category} · {formatPrice(p.priceKurus)} · rafta {registry.shelfCount(p.id)}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => useGame.getState().navigateTo(p.id)} data-testid="navigate-to">
                Yol göster
              </button>
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => useGame.getState().toggleList(p.id)} aria-label="Listeye ekle/çıkar">
                {list.includes(p.id) ? '✓' : '+'}
              </button>
            </div>
          </li>
        ))}
        {!results.length && <li className="text-sm text-slate-400">Sonuç yok.</li>}
      </ul>
    </Drawer>
  );
}

export function ListPanel() {
  const list = useGame((s) => s.shoppingList);
  const cartUnits = useGame((s) => s.cartUnits);
  const inCart = new Set(cartUnits.map((c) => c.productId));
  useEffect(() => exitLock(), []);
  return (
    <Drawer title="Alışveriş listem" onClose={closePanel}>
      {!list.length && <p className="text-sm text-slate-400">Liste boş. “Ara” panelinden + ile ürün ekleyin.</p>}
      <ul className="space-y-2">
        {list.map((id) => {
          const p = useGame.getState().productById(id);
          if (!p) return null;
          return (
            <li key={id} className="flex items-center justify-between rounded-xl bg-white/5 p-2.5 text-sm">
              <span className={inCart.has(id) ? 'text-emerald-300 line-through' : ''}>
                {inCart.has(id) ? '✓ ' : ''}
                {p.name}
              </span>
              <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => useGame.getState().toggleList(id)}>
                Kaldır
              </button>
            </li>
          );
        })}
      </ul>
      {list.length > 0 && (
        <button className="btn-primary mt-4 w-full" onClick={() => useGame.getState().routeShoppingList()}>
          En kısa rotayı oluştur (A*)
        </button>
      )}
    </Drawer>
  );
}

export function MenuPanel() {
  const quality = useGame((s) => s.quality);
  const muted = useGame((s) => s.muted);
  const isTouch = useGame((s) => s.isTouch);
  useEffect(() => exitLock(), []);
  const adminUrl = `${location.protocol}//${location.hostname}:5174`;
  return (
    <Drawer title="Menü" onClose={closePanel} testId="menu-panel">
      <button className="btn-primary mb-4 w-full" onClick={closePanel}>
        Alışverişe devam et
      </button>
      <h3 className="mb-2 text-sm font-semibold">Grafik kalitesi</h3>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {(['low', 'medium', 'high'] as Quality[]).map((q) => (
          <button key={q} className={quality === q ? 'btn-primary' : 'btn-ghost'} onClick={() => useGame.getState().setQuality(q)}>
            {q === 'low' ? 'Düşük' : q === 'medium' ? 'Orta' : 'Yüksek'}
          </button>
        ))}
      </div>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!muted} onChange={(e) => useGame.getState().setMuted(!e.target.checked)} /> Ses efektleri
      </label>
      {!isTouch && (
        <>
          <h3 className="mb-2 text-sm font-semibold">Kontroller</h3>
          <table className="mb-4 w-full text-xs text-slate-300">
            <tbody>
              {[
                ['W A S D', 'Yürü (Shift: hızlı)'],
                ['Fare', 'Etrafa bak'],
                ['E', 'Ürün al / kasada öde'],
                ['F', 'Ürünü 360° incele (sürükle, tekerlek: yakınlaş)'],
                ['G', 'Arabaya koy'],
                ['R', 'Rafa geri bırak'],
                ['C', 'Arabayı tut / bırak'],
                ['Q · L · Tab', 'Ara · Liste · Sepet'],
                ['Esc', 'Menü'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-0.5 pr-3 font-mono">{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <a className="btn-ghost mb-3 w-full" href={adminUrl} target="_blank" rel="noreferrer">
        Yönetim paneli ↗
      </a>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Tüm ürün, marka ve fiyatlar örnek içeriktir. 3D modeller parametrik yaklaşımlardır (kalite durumu: PLACEHOLDER). Gerçek ürün verisi için yönetim
        panelindeki Open Food Facts içe aktarımını kullanın.
      </p>
    </Drawer>
  );
}

const QUALITY_TR: Record<string, string> = {
  VERIFIED_3D: 'Doğrulanmış 3D',
  MULTIVIEW_GENERATED: 'Çok açılı görüntüden',
  SINGLE_IMAGE_APPROXIMATION: 'Tek görüntüden yaklaşık',
  PLACEHOLDER: 'Yaklaşık parametrik model',
  NEEDS_REVIEW: 'İnceleme bekliyor',
};

export function InspectPanel({ product }: { product: SceneProduct }) {
  const d = product.dimensions;
  const s = useGame();
  useEffect(() => exitLock(), []);
  const rows: [string, string][] = [
    ['Marka', product.brand],
    ['Barkod (GTIN)', product.gtin],
    ['Miktar', formatQuantity(product.netWeightG, product.volumeMl) || '—'],
    ['Ambalaj', PACKAGING_LABELS_TR[product.packagingType]],
    ['Ölçüler', d ? `${d.widthMm} × ${d.heightMm} × ${d.depthMm} mm` : 'Bilinmiyor'],
    ['Reyon', DEPARTMENTS[product.category]?.name ?? product.category],
    ['Raftaki adet', String(registry.shelfCount(product.id))],
    ['Veri kaynağı', product.dataSource === 'DEMO_SAMPLE' ? 'Örnek (demo) veri' : product.dataSource],
    ['3D model', QUALITY_TR[product.modelQuality] ?? product.modelQuality],
  ];
  return (
    <div className="panel pointer-events-auto absolute top-16 right-3 z-20 w-[min(360px,calc(100vw-1.5rem))] p-4" data-testid="inspect-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="mb-1 text-xs tracking-wide text-slate-400 uppercase">360° inceleme</div>
      <h2 className="mb-1 text-lg font-bold">{product.name}</h2>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-2xl font-extrabold">{formatPrice(product.priceKurus)}</span>
        {product.promotion && <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold">{promotionLabel(product.promotion)}</span>}
      </div>
      <table className="mb-3 w-full text-xs">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-white/5">
              <td className="py-1 pr-2 text-slate-400">{k}</td>
              <td className="py-1">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mb-3 flex flex-wrap gap-1 text-[10px]">
        {product.isDemo && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-200">ÖRNEK ÜRÜN</span>}
        {d && !d.verified && <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-sky-200">Ölçüler doğrulanmamış</span>}
        <span className="rounded bg-white/10 px-1.5 py-0.5">Sürükle: döndür · Tekerlek: yakınlaş</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-primary px-2" onClick={() => { s.putInCart(); requestLock(); }} data-testid="inspect-to-cart">
          Arabaya
        </button>
        <button className="btn-ghost px-2" onClick={() => { s.returnToShelf(); requestLock(); }}>
          Rafa bırak
        </button>
        <button className="btn-ghost px-2" onClick={() => { s.toggleInspect(); requestLock(); }}>
          Elde tut
        </button>
      </div>
    </div>
  );
}
