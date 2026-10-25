import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPrice } from '@realmarket/shared';
import { api, errorMessage, jsonBody } from '../api';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  totalKurus: number;
  discountKurus: number;
  paymentProvider: string;
  paymentRef: string;
  createdAt: string;
  items: { id: number; name: string; quantity: number; lineTotalKurus: number }[];
}

export function OrdersPage({ storeId }: { storeId: string }) {
  const orders = useQuery({ queryKey: ['orders', storeId], queryFn: () => api<OrderRow[]>(`/api/admin/stores/${storeId}/orders`), refetchInterval: 10_000 });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="p-2">Sipariş no</th>
            <th className="p-2">Tarih</th>
            <th className="p-2">Durum</th>
            <th className="p-2">Ödeme</th>
            <th className="p-2 text-right">Ürün</th>
            <th className="p-2 text-right">İndirim</th>
            <th className="p-2 text-right">Toplam</th>
          </tr>
        </thead>
        <tbody>
          {orders.data?.map((o) => (
            <Fragment key={o.id}>
              <tr className="cursor-pointer border-t border-slate-100 hover:bg-blue-50" onClick={() => setOpen(open === o.id ? null : o.id)}>
                <td className="p-2 font-mono">{o.orderNumber}</td>
                <td className="p-2">{new Date(o.createdAt).toLocaleString('tr-TR')}</td>
                <td className="p-2">
                  <span className="badge bg-emerald-100 text-emerald-800">{o.status}</span>
                </td>
                <td className="p-2 text-xs">
                  {o.paymentProvider} · {o.paymentRef}
                </td>
                <td className="p-2 text-right">{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                <td className="p-2 text-right text-emerald-700">−{formatPrice(o.discountKurus)}</td>
                <td className="p-2 text-right font-semibold">{formatPrice(o.totalKurus)}</td>
              </tr>
              {open === o.id && (
                <tr key={`${o.id}-d`} className="bg-slate-50">
                  <td colSpan={7} className="p-3 text-xs">
                    {o.items.map((i) => (
                      <div key={i.id} className="flex justify-between">
                        <span>
                          {i.quantity} × {i.name}
                        </span>
                        <span>{formatPrice(i.lineTotalKurus)}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {orders.data?.length === 0 && (
            <tr>
              <td colSpan={7} className="p-4 text-slate-500">
                Henüz sipariş yok. 3D mağazada alışveriş yapıp kasada demo ödeme ile tamamlayın.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface QualityIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  entity: string;
  entityId: string;
  label: string;
  message: string;
}

export function QualityPage({ storeId }: { storeId: string }) {
  const q = useQuery({ queryKey: ['quality', storeId], queryFn: () => api<{ issues: QualityIssue[]; summary: Record<string, number> }>(`/api/admin/quality?storeId=${storeId}`) });
  const [code, setCode] = useState<string | null>(null);
  const [sev, setSev] = useState<string>('all');
  const issues = (q.data?.issues ?? []).filter((i) => (!code || i.code === code) && (sev === 'all' || i.severity === sev));
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap gap-2 p-3">
        <button className={`badge cursor-pointer ${!code ? 'bg-blue-600 text-white' : 'bg-slate-100'}`} onClick={() => setCode(null)}>
          Tümü ({q.data?.issues.length ?? 0})
        </button>
        {Object.entries(q.data?.summary ?? {}).map(([k, v]) => (
          <button key={k} className={`badge cursor-pointer ${code === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => setCode(k)}>
            {k} ({v})
          </button>
        ))}
        <select className="input ml-auto w-40" value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="all">Tüm önem</option>
          <option value="error">Hata</option>
          <option value="warning">Uyarı</option>
          <option value="info">Bilgi</option>
        </select>
      </div>
      <div className="card max-h-[70vh] overflow-auto">
        <table className="w-full text-sm">
          <tbody>
            {issues.map((i, k) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="p-2">
                  <span
                    className={`badge ${i.severity === 'error' ? 'bg-rose-100 text-rose-700' : i.severity === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {i.severity}
                  </span>
                </td>
                <td className="p-2 font-mono text-xs">{i.code}</td>
                <td className="p-2">{i.label}</td>
                <td className="p-2 text-slate-600">{i.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface JobsResponse {
  modelJobs: { id: string; productName: string; pipeline: string; status: string; error: string | null; createdAt: string }[];
  importJobs: { id: string; kind: string; status: string; cursor: number; total: number; createdAt: string; report: unknown }[];
}

export function ImportsPage({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<JobsResponse>('/api/admin/jobs') });
  const [format, setFormat] = useState<'csv' | 'json' | 'jsonl'>('csv');
  const [content, setContent] = useState('');
  const [price, setPrice] = useState('');
  const [barcodes, setBarcodes] = useState('');
  const after = () => void qc.invalidateQueries();
  const catalog = useMutation({
    mutationFn: () =>
      api<{ status: string; report: Record<string, unknown> }>('/api/admin/import/catalog', {
        method: 'POST',
        body: jsonBody({ format, content, storeId, defaultPriceKurus: price ? Math.round(Number(price.replace(',', '.')) * 100) : undefined }),
      }),
    onSuccess: after,
  });
  const off = useMutation({
    mutationFn: () =>
      api<{ status: string; report: Record<string, unknown>; notFound: string[]; fetchErrors: { gtin: string; message: string }[] }>('/api/admin/import/off', {
        method: 'POST',
        body: jsonBody({ barcodes: barcodes.split(/[\s,;]+/).filter(Boolean), storeId }),
      }),
    onSuccess: after,
  });
  const resume = useMutation({ mutationFn: (id: string) => api(`/api/admin/import/jobs/${id}/resume`, { method: 'POST' }), onSuccess: after });
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="card space-y-2 p-4">
        <h2 className="text-lg font-bold">Toplu katalog içe aktarma</h2>
        <p className="text-xs text-slate-500">
          Sütunlar: gtin, name, brand, category, quantity, packaging_type, width_mm, height_mm, depth_mm, image_url, image_license. Barkodlar doğrulanır, tekrarlar
          birleştirilir, eksik ölçü/görsel işaretlenir. İş, her partiden sonra kaydedildiği için kesintiden sonra devam ettirilebilir.
        </p>
        <select className="input" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
          <option value="csv">CSV</option>
          <option value="json">JSON (dizi)</option>
          <option value="jsonl">JSONL</option>
        </select>
        <input type="file" className="text-xs" accept=".csv,.json,.jsonl,.txt" onChange={async (e) => setContent((await e.target.files?.[0]?.text()) ?? '')} />
        <textarea className="input h-40 font-mono text-[11px]" value={content} onChange={(e) => setContent(e.target.value)} placeholder="gtin,name,brand,quantity&#10;..." />
        <label className="block">
          <span className="label">Varsayılan fiyat (₺) — boşsa ürün satışa kapalı eklenir</span>
          <input className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={!content || catalog.isPending} onClick={() => catalog.mutate()}>
          İçe aktar
        </button>
        {catalog.error && <p className="text-xs text-rose-600">{errorMessage(catalog.error)}</p>}
        {catalog.data && <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(catalog.data.report, null, 2)}</pre>}
      </div>
      <div className="card space-y-2 p-4">
        <h2 className="text-lg font-bold">Open Food Facts'ten ürün al</h2>
        <p className="text-xs text-slate-500">
          Barkod başına Open Food Facts API'si sorgulanır (≈90 istek/dk sınırı, tanımlayıcı User-Agent). Veri ODbL, görseller CC BY-SA lisanslıdır; kaynak ve
          lisans kaydı otomatik tutulur. Ölçüler OFF'ta bulunmaz ve “eksik” olarak işaretlenir. Bu işlem dış servise istek gönderir.
        </p>
        <textarea className="input h-28 font-mono text-xs" value={barcodes} onChange={(e) => setBarcodes(e.target.value)} placeholder="8690504012345&#10;3017620422003" />
        <button className="btn-primary" disabled={!barcodes.trim() || off.isPending} onClick={() => off.mutate()}>
          {off.isPending ? 'Sorgulanıyor…' : 'Open Food Facts ile içe aktar'}
        </button>
        {off.error && <p className="text-xs text-rose-600">{errorMessage(off.error)}</p>}
        {off.data && (
          <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px]">
            {JSON.stringify({ report: off.data.report, bulunamadı: off.data.notFound, hatalar: off.data.fetchErrors }, null, 2)}
          </pre>
        )}
      </div>
      <div className="card p-4 xl:col-span-2">
        <h2 className="mb-2 text-lg font-bold">İşler</h2>
        <h3 className="text-sm font-semibold">İçe aktarma işleri</h3>
        <table className="mb-4 w-full text-xs">
          <tbody>
            {jobs.data?.importJobs.map((j) => (
              <tr key={j.id} className="border-t border-slate-100">
                <td className="p-1.5 font-mono">{j.kind}</td>
                <td className="p-1.5">{j.status}</td>
                <td className="p-1.5">
                  {j.cursor}/{j.total}
                </td>
                <td className="p-1.5">{new Date(j.createdAt).toLocaleString('tr-TR')}</td>
                <td className="p-1.5">
                  {j.cursor < j.total && j.kind.startsWith('catalog') && (
                    <button className="btn-secondary px-2 py-0.5 text-xs" onClick={() => resume.mutate(j.id)}>
                      Devam ettir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="text-sm font-semibold">3D model üretim işleri</h3>
        <table className="w-full text-xs">
          <tbody>
            {jobs.data?.modelJobs.slice(0, 30).map((j) => (
              <tr key={j.id} className="border-t border-slate-100">
                <td className="p-1.5">{j.productName}</td>
                <td className="p-1.5 font-mono">{j.pipeline}</td>
                <td className="p-1.5">
                  <span className={`badge ${j.status === 'succeeded' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>{j.status}</span>
                </td>
                <td className="p-1.5 text-rose-600">{j.error}</td>
                <td className="p-1.5">{new Date(j.createdAt).toLocaleString('tr-TR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
