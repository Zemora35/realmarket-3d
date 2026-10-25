import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEPARTMENTS, generateStoreLayout } from '@realmarket/store-generator';
import type { StoreLayout, StoreLayoutParams } from '@realmarket/shared';
import { api, errorMessage, jsonBody } from '../api';

const FIELDS: { key: keyof StoreLayoutParams; label: string; step: number; int?: boolean }[] = [
  { key: 'widthM', label: 'Mağaza genişliği (m)', step: 0.5 },
  { key: 'lengthM', label: 'Mağaza uzunluğu (m)', step: 0.5 },
  { key: 'ceilingHeightM', label: 'Tavan yüksekliği (m)', step: 0.1 },
  { key: 'gondolaCount', label: 'Gondol (raf sırası) sayısı', step: 1, int: true },
  { key: 'bayCount', label: 'Gondol başına bölme', step: 1, int: true },
  { key: 'aisleWidthM', label: 'Koridor genişliği (m)', step: 0.1 },
  { key: 'checkoutCount', label: 'Kasa sayısı', step: 1, int: true },
  { key: 'entranceX', label: 'Giriş kapısı konumu x (m)', step: 0.5 },
  { key: 'exitX', label: 'Çıkış kapısı konumu x (m)', step: 0.5 },
  { key: 'seed', label: 'Seed (tekrarlanabilirlik)', step: 1, int: true },
];

const COLORS: Record<string, string> = {
  wall: '#334155',
  door: '#16a34a',
  checkout: '#1d4ed8',
  cart_corral: '#94a3b8',
  promo_stand: '#e11d48',
};

/** Yerleşimin kuşbakışı planı (SVG). */
function TopView({ layout }: { layout: StoreLayout }) {
  const { widthM: W, lengthM: L } = layout.params;
  const pad = 1;
  return (
    <svg viewBox={`${-pad} ${-pad - 2} ${W + 2 * pad} ${L + 2 * pad + 2}`} className="h-[60vh] w-full rounded-lg bg-white" style={{ transform: 'scaleY(-1)' }}>
      <rect x={0} y={0} width={W} height={L} fill="#f8fafc" stroke="#334155" strokeWidth={0.15} />
      {layout.obstacles.length > 0 &&
        layout.objects.map((o) => {
          if (o.type === 'sign') return null;
          const swap = Math.abs(Math.sin(o.rotationY)) > 0.5;
          const w = swap ? o.size.z : o.size.x;
          const d = swap ? o.size.x : o.size.z;
          const color = o.departmentCode ? (DEPARTMENTS[o.departmentCode]?.color ?? '#64748b') : (COLORS[o.type] ?? '#64748b');
          return <rect key={o.id} x={o.position.x - w / 2} y={o.position.z - d / 2} width={w} height={d} fill={color} opacity={o.type === 'wall' ? 0.9 : 0.75} rx={0.05} />;
        })}
      {layout.checkouts.map((c) => (
        <rect key={c.id} x={c.zone.minX} y={c.zone.minZ} width={c.zone.maxX - c.zone.minX} height={c.zone.maxZ - c.zone.minZ} fill="none" stroke="#1d4ed8" strokeDasharray="0.3 0.2" strokeWidth={0.06} />
      ))}
      <circle cx={layout.spawn.position.x} cy={layout.spawn.position.z} r={0.35} fill="#f59e0b" />
    </svg>
  );
}

export function LayoutPage({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const current = useQuery({
    queryKey: ['layout', storeId],
    queryFn: () => api<{ version: number; params: StoreLayoutParams; layout: StoreLayout }>(`/api/admin/stores/${storeId}/layout`),
  });
  const [params, setParams] = useState<Partial<StoreLayoutParams> | null>(null);
  useEffect(() => {
    if (current.data && !params) setParams(current.data.params);
  }, [current.data, params]);
  // önizleme istemcide anında üretilir (aynı deterministik üretici)
  const preview = useMemo(() => {
    if (!params) return null;
    try {
      return generateStoreLayout(params);
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [params]);
  const save = useMutation({
    mutationFn: () =>
      api<{ version: number; shelves: number; planogramIssues: number }>(`/api/admin/stores/${storeId}/layout`, { method: 'PUT', body: jsonBody({ params }) }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
  if (current.isError) {
    return (
      <div className="card p-6 text-sm text-rose-600">
        Yerleşim yüklenemedi: {errorMessage(current.error)}{' '}
        <button className="btn-secondary ml-2" onClick={() => void current.refetch()}>
          Tekrar dene
        </button>
      </div>
    );
  }
  if (!params || !preview) return <div className="card p-6 text-sm text-slate-500">Yükleniyor…</div>;
  const layout = 'error' in preview ? null : preview;
  const errors = layout?.issues.filter((i) => i.severity === 'error') ?? [];
  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <div className="card space-y-2 p-4">
        <h2 className="text-lg font-bold">Parametrik mağaza üretimi</h2>
        <p className="text-xs text-slate-500">
          Mevcut sürüm: v{current.data?.version}. Aynı girdiler her zaman aynı yerleşimi üretir. Koridorların araba geçişine uygunluğu ve rafların
          erişilebilirliği otomatik doğrulanır.
        </p>
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="label">{f.label}</span>
            <input
              className="input"
              type="number"
              step={f.step}
              value={(params[f.key] as number | undefined) ?? ''}
              placeholder="otomatik"
              onChange={(e) => {
                const v = e.target.value === '' ? undefined : f.int ? Math.round(Number(e.target.value)) : Number(e.target.value);
                setParams({ ...params, [f.key]: v });
              }}
            />
          </label>
        ))}
        {save.error && <p className="text-sm text-rose-600">{errorMessage(save.error)}</p>}
        {save.data && (
          <p className="text-sm text-emerald-700">
            v{save.data.version} kaydedildi: {save.data.shelves} raf, planogramlar yeniden uygulandı{save.data.planogramIssues ? ` (${save.data.planogramIssues} raf sorunlu)` : ''}.
          </p>
        )}
        <button className="btn-primary w-full" disabled={!layout || errors.length > 0 || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Uygulanıyor…' : 'Kaydet ve mağazaya uygula'}
        </button>
        <a className="btn-secondary w-full" href={`${location.protocol}//${location.hostname}:5173`} target="_blank" rel="noreferrer">
          3D mağazayı aç ↗
        </a>
      </div>
      <div className="card p-4">
        {layout ? (
          <>
            <div className="mb-2 flex flex-wrap gap-3 text-sm">
              <span>{layout.shelves.length} raf birimi</span>
              <span>{layout.departments.length} reyon</span>
              <span>{layout.checkouts.length} kasa</span>
              {layout.issues.map((i, k) => (
                <span key={k} className={`badge ${i.severity === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                  {i.message}
                </span>
              ))}
            </div>
            <TopView layout={layout} />
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {layout.departments.map((d) => (
                <span key={d.code} className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 rounded" style={{ background: d.color }} /> {d.name}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full bg-amber-500" /> Giriş noktası
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-rose-600">{'error' in preview ? preview.error : ''}</p>
        )}
      </div>
    </div>
  );
}
