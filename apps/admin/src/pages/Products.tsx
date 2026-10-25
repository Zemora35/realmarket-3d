import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ASSET_LICENSES,
  formatPrice,
  IMAGE_VIEWS,
  MODEL_QUALITY,
  PACKAGING_LABELS_TR,
  PACKAGING_TYPES,
  validateGtin,
  type ModelQuality,
  type PackagingType,
  type Promotion,
  type SceneProduct,
} from '@realmarket/shared';
import { DEPARTMENTS } from '@realmarket/store-generator';
import { api, errorMessage, jsonBody } from '../api';
import { ProductPreview } from '../components/Preview3D';

export const QUALITY_STYLE: Record<ModelQuality, string> = {
  VERIFIED_3D: 'bg-emerald-100 text-emerald-800',
  MULTIVIEW_GENERATED: 'bg-sky-100 text-sky-800',
  SINGLE_IMAGE_APPROXIMATION: 'bg-indigo-100 text-indigo-800',
  PLACEHOLDER: 'bg-slate-200 text-slate-700',
  NEEDS_REVIEW: 'bg-amber-100 text-amber-800',
};

export function ProductsPage({ storeId }: { storeId: string }) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const products = useQuery({
    queryKey: ['products', storeId],
    queryFn: () => api<SceneProduct[]>(`/api/admin/stores/${storeId}/products`),
  });
  const filtered = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr-TR');
    return (products.data ?? []).filter((p) => !t || `${p.name} ${p.brand} ${p.gtin}`.toLocaleLowerCase('tr-TR').includes(t));
  }, [products.data, q]);
  const current = products.data?.find((p) => p.id === selected) ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_520px]">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <input className="input max-w-xs" placeholder="Ad, marka veya barkod ara…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="text-xs text-slate-500">{filtered.length} ürün</span>
          <button className="btn-primary ml-auto" onClick={() => (setCreating(true), setSelected(null))}>
            + Yeni ürün
          </button>
        </div>
        <div className="max-h-[calc(100vh-180px)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="p-2">Ürün</th>
                <th className="p-2">Barkod</th>
                <th className="p-2">Reyon</th>
                <th className="p-2 text-right">Fiyat</th>
                <th className="p-2 text-right">Stok</th>
                <th className="p-2">3D model</th>
              </tr>
            </thead>
            <tbody>
              {products.isLoading && (
                <tr>
                  <td className="p-3 text-slate-400" colSpan={6}>
                    Yükleniyor…
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${selected === p.id ? 'bg-blue-50' : ''}`}
                  onClick={() => (setSelected(p.id), setCreating(false))}
                >
                  <td className="p-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.brand} · {PACKAGING_LABELS_TR[p.packagingType]}
                      {p.isDemo && <span className="badge ml-1 bg-amber-100 text-amber-800">ÖRNEK</span>}
                      {!p.isActive && <span className="badge ml-1 bg-rose-100 text-rose-700">pasif</span>}
                    </div>
                  </td>
                  <td className="p-2 font-mono text-xs">{p.gtin}</td>
                  <td className="p-2 text-xs">{DEPARTMENTS[p.category]?.name ?? p.category}</td>
                  <td className="p-2 text-right">{formatPrice(p.priceKurus)}</td>
                  <td className="p-2 text-right">{p.available}</td>
                  <td className="p-2">
                    <span className={`badge ${QUALITY_STYLE[p.modelQuality]}`}>{p.modelQuality}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        {creating && <CreateProduct storeId={storeId} onDone={(id) => (setCreating(false), setSelected(id))} />}
        {current && !creating && <ProductEditor key={current.id + current.images.length} storeId={storeId} product={current} />}
        {!current && !creating && <div className="card p-6 text-sm text-slate-500">Düzenlemek için listeden bir ürün seçin.</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function ProductEditor({ storeId, product }: { storeId: string; product: SceneProduct }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [cat, setCat] = useState({
    name: product.name,
    brand: product.brand,
    category: product.category,
    packagingType: product.packagingType,
    modelQuality: product.modelQuality,
    widthMm: product.dimensions?.widthMm ?? 100,
    heightMm: product.dimensions?.heightMm ?? 200,
    depthMm: product.dimensions?.depthMm ?? 100,
    verified: product.dimensions?.verified ?? false,
    primaryColor: product.appearance.primaryColor,
    secondaryColor: product.appearance.secondaryColor,
    accentColor: product.appearance.accentColor,
  });
  const [store, setStore] = useState({
    price: (product.priceKurus / 100).toFixed(2),
    onHand: '',
    isActive: product.isActive,
    promo: product.promotion?.type ?? 'none',
    percent: product.promotion?.type === 'percent' ? product.promotion.percent : 10,
    buy: product.promotion?.type === 'multibuy' ? product.promotion.buy : 3,
    pay: product.promotion?.type === 'multibuy' ? product.promotion.pay : 2,
  });
  const done = (text: string) => {
    setMsg({ tone: 'ok', text });
    void qc.invalidateQueries({ queryKey: ['products', storeId] });
    void qc.invalidateQueries({ queryKey: ['quality'] });
  };
  const fail = (e: unknown) => setMsg({ tone: 'err', text: errorMessage(e) });

  // önizleme: kaydetmeden önce düzenlenen ölçü/ambalaj ile
  const previewProduct = useMemo<SceneProduct>(
    () => ({
      ...product,
      packagingType: cat.packagingType,
      dimensions: { widthMm: cat.widthMm, heightMm: cat.heightMm, depthMm: cat.depthMm, verified: cat.verified, source: product.dimensions?.source ?? 'MANUAL' },
      appearance: { ...product.appearance, primaryColor: cat.primaryColor, secondaryColor: cat.secondaryColor, accentColor: cat.accentColor },
    }),
    [product, cat],
  );

  const saveCatalog = useMutation({
    mutationFn: () =>
      api<{ replannedShelves: number }>(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        body: jsonBody({
          name: cat.name,
          brand: cat.brand,
          category: cat.category,
          packagingType: cat.packagingType,
          modelQuality: cat.modelQuality,
          appearance: { ...product.appearance, primaryColor: cat.primaryColor, secondaryColor: cat.secondaryColor, accentColor: cat.accentColor },
          dimensions: { widthMm: cat.widthMm, heightMm: cat.heightMm, depthMm: cat.depthMm, verified: cat.verified, source: cat.verified ? 'MANUAL_MEASURED' : 'MANUAL' },
        }),
      }),
    onSuccess: (r) => done(`Katalog kaydedildi. Model yeniden üretildi; ${r.replannedShelves} raf yeniden yerleştirildi.`),
    onError: fail,
  });
  const saveStore = useMutation({
    mutationFn: () => {
      const promotion: Promotion | null =
        store.promo === 'percent' ? { type: 'percent', percent: Number(store.percent) } : store.promo === 'multibuy' ? { type: 'multibuy', buy: Number(store.buy), pay: Number(store.pay) } : null;
      return api(`/api/admin/stores/${storeId}/products/${product.id}`, {
        method: 'PUT',
        body: jsonBody({
          priceKurus: Math.round(Number(store.price.replace(',', '.')) * 100),
          promotion,
          isActive: store.isActive,
          ...(store.onHand !== '' ? { onHand: Number(store.onHand) } : {}),
        }),
      });
    },
    onSuccess: () => done('Mağaza fiyatı/stoğu güncellendi.'),
    onError: fail,
  });
  const regenerate = useMutation({
    mutationFn: () => api<{ status: string; output: { lods?: { detail: string; triangleCount: number }[]; issues?: string[] } }>(`/api/admin/products/${product.id}/model/regenerate`, { method: 'POST' }),
    onSuccess: (r) =>
      r.status === 'succeeded'
        ? done(`Model üretildi ve doğrulandı (${r.output.lods?.map((l) => `${l.detail}: ${l.triangleCount} üçgen`).join(', ')})`)
        : setMsg({ tone: 'err', text: `Model doğrulaması başarısız: ${r.output.issues?.join('; ')}` }),
    onError: fail,
  });
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState({ view: 'front', license: 'UNVERIFIED', attribution: '' });
  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('view', img.view);
      fd.append('license', img.license);
      fd.append('attribution', img.attribution);
      fd.append('file', file!);
      return api(`/api/admin/products/${product.id}/images`, { method: 'POST', body: fd });
    },
    onSuccess: () => done('Görsel yüklendi; ön görsel etikete uygulandı.'),
    onError: fail,
  });

  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">{product.name}</h2>
          <div className="font-mono text-xs text-slate-500">
            {product.gtin} · {validateGtin(product.gtin).valid ? '✓ geçerli barkod' : '✗ geçersiz barkod'} · kaynak: {product.dataSource}
          </div>
        </div>
        <span className={`badge ${QUALITY_STYLE[product.modelQuality]}`}>{product.modelQuality}</span>
      </div>
      <ProductPreview product={previewProduct} />
      {msg && <div className={`rounded-lg px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</div>}

      <section>
        <h3 className="mb-2 text-sm font-bold">Katalog bilgisi ve 3D model</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ad">
            <input className="input" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
          </Field>
          <Field label="Marka">
            <input className="input" value={cat.brand} onChange={(e) => setCat({ ...cat, brand: e.target.value })} />
          </Field>
          <Field label="Reyon">
            <select className="input" value={cat.category} onChange={(e) => setCat({ ...cat, category: e.target.value })}>
              {Object.values(DEPARTMENTS).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
              {!DEPARTMENTS[cat.category] && <option value={cat.category}>{cat.category}</option>}
            </select>
          </Field>
          <Field label="Ambalaj tipi (model şablonu)">
            <select className="input" value={cat.packagingType} onChange={(e) => setCat({ ...cat, packagingType: e.target.value as PackagingType })}>
              {PACKAGING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PACKAGING_LABELS_TR[t]}
                </option>
              ))}
            </select>
          </Field>
          {(['widthMm', 'heightMm', 'depthMm'] as const).map((k) => (
            <Field key={k} label={{ widthMm: 'Genişlik (mm)', heightMm: 'Yükseklik (mm)', depthMm: 'Derinlik (mm)' }[k]}>
              <input className="input" type="number" min={1} value={cat[k]} onChange={(e) => setCat({ ...cat, [k]: Number(e.target.value) })} />
            </Field>
          ))}
          <Field label="Model kalite durumu">
            <select className="input" value={cat.modelQuality} onChange={(e) => setCat({ ...cat, modelQuality: e.target.value as ModelQuality })}>
              {MODEL_QUALITY.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <div className="col-span-2 flex flex-wrap items-center gap-3">
            {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 text-xs text-slate-600">
                <input type="color" value={cat[k]} onChange={(e) => setCat({ ...cat, [k]: e.target.value })} />
                {{ primaryColor: 'Ana', secondaryColor: 'İkincil', accentColor: 'Vurgu' }[k]} renk
              </label>
            ))}
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={cat.verified} onChange={(e) => setCat({ ...cat, verified: e.target.checked })} />
              Ölçüler fiziksel olarak doğrulandı
            </label>
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <button className="btn-primary" disabled={saveCatalog.isPending} onClick={() => saveCatalog.mutate()}>
            Kataloğu kaydet
          </button>
          <button className="btn-secondary" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
            Modeli yeniden üret
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold">Mağaza fiyatı, kampanya ve stok</h3>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Fiyat (₺)">
            <input className="input" value={store.price} onChange={(e) => setStore({ ...store, price: e.target.value })} />
          </Field>
          <Field label={`Eldeki stok (şu an kullanılabilir: ${product.available})`}>
            <input className="input" type="number" min={0} placeholder="değiştirme" value={store.onHand} onChange={(e) => setStore({ ...store, onHand: e.target.value })} />
          </Field>
          <Field label="Kampanya">
            <select className="input" value={store.promo} onChange={(e) => setStore({ ...store, promo: e.target.value as typeof store.promo })}>
              <option value="none">Yok</option>
              <option value="percent">% indirim</option>
              <option value="multibuy">X al Y öde</option>
            </select>
          </Field>
          {store.promo === 'percent' && (
            <Field label="İndirim %">
              <input className="input" type="number" min={1} max={90} value={store.percent} onChange={(e) => setStore({ ...store, percent: Number(e.target.value) })} />
            </Field>
          )}
          {store.promo === 'multibuy' && (
            <>
              <Field label="Al">
                <input className="input" type="number" min={2} value={store.buy} onChange={(e) => setStore({ ...store, buy: Number(e.target.value) })} />
              </Field>
              <Field label="Öde">
                <input className="input" type="number" min={1} value={store.pay} onChange={(e) => setStore({ ...store, pay: Number(e.target.value) })} />
              </Field>
            </>
          )}
          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={store.isActive} onChange={(e) => setStore({ ...store, isActive: e.target.checked })} /> Satışta
          </label>
        </div>
        <button className="btn-primary mt-2" disabled={saveStore.isPending} onClick={() => saveStore.mutate()}>
          Mağaza verisini kaydet
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold">Ambalaj fotoğrafı</h3>
        <ul className="mb-2 space-y-1 text-xs">
          {product.images.map((i) => (
            <li key={i.id} className="flex items-center gap-2">
              <img src={i.url} alt="" className="h-8 w-8 rounded object-cover" />
              {i.view} · lisans: <span className={i.license === 'UNVERIFIED' ? 'text-amber-700' : ''}>{i.license}</span>
            </li>
          ))}
          {!product.images.length && <li className="text-slate-500">Görsel yok — prosedürel etiket kullanılıyor.</li>}
        </ul>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Görünüm">
            <select className="input" value={img.view} onChange={(e) => setImg({ ...img, view: e.target.value })}>
              {IMAGE_VIEWS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Lisans">
            <select className="input" value={img.license} onChange={(e) => setImg({ ...img, license: e.target.value })}>
              {ASSET_LICENSES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Atıf / kaynak">
            <input className="input" value={img.attribution} onChange={(e) => setImg({ ...img, attribution: e.target.value })} />
          </Field>
          <input className="col-span-2 text-xs" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="btn-secondary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
            Yükle
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">PNG/JPEG/WebP, en fazla 5 MB. Dosya türü içerikten doğrulanır. Marka görselleri için lisans/izin kaydı zorunludur.</p>
      </section>
    </div>
  );
}

function CreateProduct({ storeId, onDone }: { storeId: string; onDone: (id: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    gtin: '',
    name: '',
    brand: '',
    category: 'GIDA',
    packagingType: 'carton_box' as PackagingType,
    widthMm: 100,
    heightMm: 200,
    depthMm: 60,
    price: '19,90',
    stock: 50,
    color: '#2563eb',
  });
  const [err, setErr] = useState<string | null>(null);
  const v = f.gtin ? validateGtin(f.gtin) : null;
  const create = useMutation({
    mutationFn: () =>
      api<{ productId: string }>(`/api/admin/stores/${storeId}/products`, {
        method: 'POST',
        body: jsonBody({
          gtin: f.gtin,
          name: f.name,
          brand: f.brand,
          category: f.category,
          packagingType: f.packagingType,
          dimensions: { widthMm: f.widthMm, heightMm: f.heightMm, depthMm: f.depthMm, verified: false, source: 'MANUAL' },
          appearance: { primaryColor: f.color, secondaryColor: '#ffffff', accentColor: '#f59e0b' },
          priceKurus: Math.round(Number(f.price.replace(',', '.')) * 100),
          stock: f.stock,
        }),
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['products', storeId] });
      onDone(r.productId);
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-lg font-bold">Yeni ürün</h2>
      <p className="text-xs text-slate-500">Ürün kataloğa eklenir, parametrik 3D modeli üretilir ve mağazada satışa açılır. Rafa yerleştirmek için Planogram sayfasını kullanın.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Barkod (GTIN)">
          <input className="input font-mono" value={f.gtin} onChange={(e) => setF({ ...f, gtin: e.target.value })} />
          {v && <span className={`text-[11px] ${v.valid ? 'text-emerald-700' : 'text-rose-600'}`}>{v.valid ? `✓ ${v.kind}` : v.error}</span>}
        </Field>
        <Field label="Ad">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Marka">
          <input className="input" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
        </Field>
        <Field label="Reyon">
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.values(DEPARTMENTS).map((d) => (
              <option key={d.code} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ambalaj tipi">
          <select className="input" value={f.packagingType} onChange={(e) => setF({ ...f, packagingType: e.target.value as PackagingType })}>
            {PACKAGING_TYPES.map((t) => (
              <option key={t} value={t}>
                {PACKAGING_LABELS_TR[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Etiket rengi">
          <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} />
        </Field>
        {(['widthMm', 'heightMm', 'depthMm'] as const).map((k) => (
          <Field key={k} label={{ widthMm: 'Genişlik (mm)', heightMm: 'Yükseklik (mm)', depthMm: 'Derinlik (mm)' }[k]}>
            <input className="input" type="number" min={1} value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
          </Field>
        ))}
        <Field label="Fiyat (₺)">
          <input className="input" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
        </Field>
        <Field label="Başlangıç stoğu">
          <input className="input" type="number" min={0} value={f.stock} onChange={(e) => setF({ ...f, stock: Number(e.target.value) })} />
        </Field>
      </div>
      {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
      <button className="btn-primary" disabled={!v?.valid || !f.name || !f.brand || create.isPending} onClick={() => create.mutate()}>
        Ürünü oluştur
      </button>
    </div>
  );
}
