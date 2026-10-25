import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage, getToken, jsonBody, setToken } from './api';
import { LayoutPage } from './pages/Layout';
import { ImportsPage, OrdersPage, QualityPage } from './pages/Misc';
import { PlanogramsPage } from './pages/Planograms';
import { ProductsPage } from './pages/Products';

const PAGES = [
  { id: 'dashboard', label: 'Genel bakış' },
  { id: 'products', label: 'Ürünler' },
  { id: 'planograms', label: 'Planogramlar' },
  { id: 'layout', label: 'Mağaza yerleşimi' },
  { id: 'orders', label: 'Siparişler' },
  { id: 'quality', label: 'Kalite kontrol' },
  { id: 'imports', label: 'İçe aktarma & işler' },
] as const;
type PageId = (typeof PAGES)[number]['id'];

function useHashPage(): [PageId, (p: PageId) => void] {
  const read = () => (PAGES.some((p) => p.id === location.hash.slice(2)) ? (location.hash.slice(2) as PageId) : 'dashboard');
  const [page, setPage] = useState<PageId>(read);
  useEffect(() => {
    const on = () => setPage(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [page, (p) => (location.hash = `/${p}`)];
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => api<{ token: string }>('/api/auth/login', { method: 'POST', body: jsonBody({ email, password }) }),
    onSuccess: (r) => {
      setToken(r.token);
      onLogin();
    },
  });
  return (
    <div className="grid min-h-screen place-items-center bg-slate-900 p-4">
      <form
        className="card w-full max-w-sm space-y-3 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <h1 className="text-xl font-bold">RealMarket Yönetim</h1>
        <p className="text-xs text-slate-500">Geliştirme hesabı `.env` dosyasındaki SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD değerleridir.</p>
        <label className="block">
          <span className="label">E-posta</span>
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" />
        </label>
        <label className="block">
          <span className="label">Parola</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" />
        </label>
        {login.error && <p className="text-sm text-rose-600">{errorMessage(login.error)}</p>}
        <button className="btn-primary w-full" disabled={login.isPending} data-testid="login-submit">
          Giriş yap
        </button>
      </form>
    </div>
  );
}

interface Store {
  id: string;
  name: string;
  isDemo: boolean;
}

function Dashboard({ storeId, go }: { storeId: string; go: (p: PageId) => void }) {
  const products = useQuery({ queryKey: ['products', storeId], queryFn: () => api<{ available: number; modelQuality: string }[]>(`/api/admin/stores/${storeId}/products`) });
  const planograms = useQuery({ queryKey: ['planograms', storeId], queryFn: () => api<{ errorCount: number; fillRatio: number }[]>(`/api/admin/stores/${storeId}/planograms`) });
  const orders = useQuery({ queryKey: ['orders', storeId], queryFn: () => api<{ totalKurus: number }[]>(`/api/admin/stores/${storeId}/orders`) });
  const quality = useQuery({ queryKey: ['quality', storeId], queryFn: () => api<{ issues: { severity: string }[] }>(`/api/admin/quality?storeId=${storeId}`) });
  const lowStock = products.data?.filter((p) => p.available < 20).length ?? 0;
  const fill = planograms.data?.length ? planograms.data.reduce((s, p) => s + p.fillRatio, 0) / planograms.data.length : 0;
  const revenue = orders.data?.reduce((s, o) => s + o.totalKurus, 0) ?? 0;
  const tiles: { label: string; value: string; page: PageId; tone?: string }[] = [
    { label: 'Ürün', value: String(products.data?.length ?? '…'), page: 'products' },
    { label: 'Düşük stok (<20)', value: String(lowStock), page: 'products', tone: lowStock ? 'text-amber-600' : undefined },
    { label: 'Raf / planogram', value: String(planograms.data?.length ?? '…'), page: 'planograms' },
    { label: 'Ortalama raf doluluğu', value: `%${Math.round(fill * 100)}`, page: 'planograms' },
    { label: 'Sipariş (demo)', value: String(orders.data?.length ?? '…'), page: 'orders' },
    { label: 'Ciro (demo)', value: new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(revenue / 100), page: 'orders' },
    {
      label: 'Kalite hatası',
      value: String(quality.data?.issues.filter((i) => i.severity === 'error').length ?? '…'),
      page: 'quality',
      tone: quality.data?.issues.some((i) => i.severity === 'error') ? 'text-rose-600' : undefined,
    },
    { label: 'Kalite uyarısı', value: String(quality.data?.issues.filter((i) => i.severity === 'warning').length ?? '…'), page: 'quality' },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <button key={t.label} className="card p-4 text-left hover:border-blue-300" onClick={() => go(t.page)}>
            <div className="text-xs text-slate-500">{t.label}</div>
            <div className={`text-2xl font-bold ${t.tone ?? ''}`}>{t.value}</div>
          </button>
        ))}
      </div>
      <div className="card p-4 text-sm text-slate-600">
        <b>Örnek içerik uyarısı:</b> Demo mağazadaki ürünler kurgusal markalardır ve gerçek bir perakendecinin kataloğu değildir. Gerçek ürünler için
        “İçe aktarma” sayfasında Open Food Facts (ODbL) veya lisanslı CSV kaynakları kullanın; marka görselleri için lisans kaydı zorunludur.
      </div>
    </div>
  );
}

export function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [page, go] = useHashPage();
  useEffect(() => {
    const out = () => setAuthed(false);
    window.addEventListener('rm3d:logout', out);
    return () => window.removeEventListener('rm3d:logout', out);
  }, []);
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ email: string; role: string; displayName: string }>('/api/admin/me'), enabled: authed });
  const stores = useQuery({ queryKey: ['stores'], queryFn: () => api<Store[]>('/api/admin/stores'), enabled: authed });
  const [storeId, setStoreId] = useState<string | null>(null);
  useEffect(() => {
    if (!storeId && stores.data?.[0]) setStoreId(stores.data[0].id);
  }, [stores.data, storeId]);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-slate-900 p-3 text-slate-200">
        <div className="mb-4 px-2 text-lg font-bold">RealMarket</div>
        <nav className="space-y-0.5">
          {PAGES.map((p) => (
            <button key={p.id} className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${page === p.id ? 'bg-blue-600 text-white' : 'hover:bg-white/10'}`} onClick={() => go(p.id)}>
              {p.label}
            </button>
          ))}
        </nav>
        <div className="mt-6 border-t border-white/10 px-2 pt-3 text-xs text-slate-400">
          {me.data?.displayName}
          <br />
          {me.data?.email} · {me.data?.role}
          <button
            className="mt-2 block text-slate-300 underline"
            onClick={() => {
              setToken(null);
              setAuthed(false);
            }}
          >
            Çıkış
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4">
        <header className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-bold">{PAGES.find((p) => p.id === page)?.label}</h1>
          <select className="input ml-auto w-64" value={storeId ?? ''} onChange={(e) => setStoreId(e.target.value)}>
            {stores.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isDemo ? ' (demo)' : ''}
              </option>
            ))}
          </select>
        </header>
        {storeId && page === 'dashboard' && <Dashboard storeId={storeId} go={go} />}
        {storeId && page === 'products' && <ProductsPage storeId={storeId} />}
        {storeId && page === 'planograms' && <PlanogramsPage storeId={storeId} />}
        {storeId && page === 'layout' && <LayoutPage storeId={storeId} />}
        {storeId && page === 'orders' && <OrdersPage storeId={storeId} />}
        {storeId && page === 'quality' && <QualityPage storeId={storeId} />}
        {storeId && page === 'imports' && <ImportsPage storeId={storeId} />}
      </main>
    </div>
  );
}
