import { useGame } from '../state/game';
import { requestLock } from './pointer';

export function LoadingScreen() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-950 text-slate-200">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        <p className="text-lg font-semibold">Market hazırlanıyor…</p>
        <p className="text-sm text-slate-400">Raflar diziliyor, ürünler yerleştiriliyor</p>
      </div>
    </div>
  );
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-slate-950 p-6 text-slate-200">
      <div className="panel max-w-md p-6 text-center">
        <p className="mb-2 text-lg font-bold text-rose-400">Market yüklenemedi</p>
        <p className="mb-4 text-sm text-slate-300">{message}</p>
        <p className="mb-4 text-xs text-slate-400">API sunucusunun çalıştığından emin olun: <code>pnpm dev</code></p>
        <button className="btn-primary" onClick={() => location.reload()}>
          Tekrar dene
        </button>
      </div>
    </div>
  );
}

export function StartScreen() {
  const scene = useGame((s) => s.scene);
  const isTouch = useGame((s) => s.isTouch);
  const start = () => {
    useGame.getState().startPlaying();
    requestAnimationFrame(requestLock);
  };
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-gradient-to-b from-slate-950/70 to-slate-900/90 p-4">
      <div className="panel w-full max-w-2xl overflow-y-auto p-6 sm:p-8" style={{ maxHeight: '92vh' }}>
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold">3D</span>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">RealMarket 3D</h1>
        </div>
        <p className="mb-4 text-slate-300">
          {scene?.store.name} — {scene?.products.length} ürün, {scene?.layout.shelves.length} raf, {new Set(scene?.layout.shelves.map((s) => s.departmentCode)).size} reyon
        </p>
        <div className="mb-5 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          <b>Örnek içerik:</b> Bu sürümdeki markalar, ürünler, barkodlar (GS1 mağaza içi “29” önekli) ve fiyatlar kurgusaldır; gerçek bir
          marketin kataloğunu temsil etmez. 3D modeller ölçülerden üretilen yaklaşık parametrik modellerdir. Ödeme demo amaçlıdır, gerçek ödeme alınmaz.
        </div>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {isTouch ? (
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li>Sol joystick: yürü</li>
              <li>Ekranın sağında sürükle: etrafa bak</li>
              <li>
                <b>Al</b> / <b>Arabaya</b> / <b>İncele</b> düğmeleri
              </li>
              <li>Üstteki düğmeler: ara, liste, sepet</li>
            </ul>
          ) : (
            <ul className="space-y-1.5 text-sm text-slate-300">
              <li>
                <span className="kbd">W</span> <span className="kbd">A</span> <span className="kbd">S</span> <span className="kbd">D</span> yürü,{' '}
                <span className="kbd">Shift</span> hızlı
              </li>
              <li>Fare: etrafa bak</li>
              <li>
                <span className="kbd">E</span> ürün al · <span className="kbd">F</span> incele · <span className="kbd">G</span> arabaya koy
              </li>
              <li>
                <span className="kbd">R</span> rafa bırak · <span className="kbd">C</span> arabayı tut/bırak
              </li>
              <li>
                <span className="kbd">Q</span> ürün ara · <span className="kbd">L</span> liste · <span className="kbd">Tab</span> sepet ·{' '}
                <span className="kbd">Esc</span> menü
              </li>
            </ul>
          )}
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Arabanızla koridorlarda dolaşın.</li>
            <li>Nişangâhı ürüne çevirip alın, 360° inceleyin.</li>
            <li>Ürünü arabaya koyun; sepet toplamı sunucuda hesaplanır.</li>
            <li>Kasaya gidip demo ödeme ile alışverişi tamamlayın.</li>
          </ol>
        </div>
        <button className="btn-primary w-full py-3 text-base" onClick={start} data-testid="enter-store">
          Markete gir
        </button>
      </div>
    </div>
  );
}
