import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BLOCK_GAP_MM, computePlacements, FACING_GAP_MM } from '@realmarket/planogram';
import { planogramSchema, type Planogram, type PlanogramIssue, type SceneProduct } from '@realmarket/shared';
import { api, errorMessage, jsonBody } from '../api';
import { ShelfPreview } from '../components/Preview3D';

interface PlanogramRow {
  id: string;
  planogramId: string;
  shelfId: string;
  aisleId: string;
  kind: string;
  itemCount: number;
  fillRatio: number;
  errorCount: number;
  warningCount: number;
  source: string;
}

export function PlanogramsPage({ storeId }: { storeId: string }) {
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const list = useQuery({ queryKey: ['planograms', storeId], queryFn: () => api<PlanogramRow[]>(`/api/admin/stores/${storeId}/planograms`) });
  const products = useQuery({ queryKey: ['products', storeId], queryFn: () => api<SceneProduct[]>(`/api/admin/stores/${storeId}/products`) });
  const rows = (list.data ?? []).filter((r) => !filter || r.shelfId.toLowerCase().includes(filter.toLowerCase()) || r.aisleId.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 p-3">
            <input className="input" placeholder="Raf / reyon filtrele (ör. G3, ICECEK)" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <ul className="max-h-[55vh] overflow-auto text-sm">
            {rows.map((r) => (
              <li key={r.id}>
                <button className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${shelfId === r.shelfId ? 'bg-blue-50' : ''}`} onClick={() => setShelfId(r.shelfId)}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{r.shelfId}</span>
                    <span className="text-xs text-slate-500">%{Math.round(r.fillRatio * 100)} dolu</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.aisleId} · {r.kind} · {r.itemCount} kalem · {r.source}
                    {r.errorCount > 0 && <span className="badge ml-1 bg-rose-100 text-rose-700">{r.errorCount} hata</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <ImportBox storeId={storeId} />
      </div>
      {shelfId && products.data ? (
        <Editor key={shelfId} storeId={storeId} shelfId={shelfId} products={products.data} />
      ) : (
        <div className="card p-6 text-sm text-slate-500">Düzenlemek için bir raf seçin. Her raf (gondol bölmesi, soğutucu, tezgâh) bir planogram birimidir.</div>
      )}
    </div>
  );
}

const SCALE_PX = 0.55; // px / mm (1250 mm ≈ 690 px)

function Editor({ storeId, shelfId, products }: { storeId: string; shelfId: string; products: SceneProduct[] }) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['planogram', storeId, shelfId],
    queryFn: () => api<{ document: Planogram; issues: PlanogramIssue[] }>(`/api/admin/stores/${storeId}/planograms/${shelfId}`),
  });
  const [doc, setDoc] = useState<Planogram | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<'visual' | 'json'>('visual');
  const [jsonText, setJsonText] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [serverIssues, setServerIssues] = useState<PlanogramIssue[] | null>(null);
  const [addGtin, setAddGtin] = useState('');
  const byGtin = useMemo(() => new Map(products.map((p) => [p.gtin, p])), [products]);

  // Görsel düzenleme için tüm kalemlere açık konum atanır (otomatik konumlar sabitlenir).
  useEffect(() => {
    if (!detail.data) return;
    const d = structuredClone(detail.data.document);
    const r = computePlacements(d, (g) => byGtin.get(g)?.dimensions ?? null);
    let si = 0;
    d.items = d.items.map((it) => {
      const slot = r.slots.find((s, k) => k >= si && s.gtin === it.gtin && s.levelIndex === it.levelIndex);
      if (slot) si = r.slots.indexOf(slot) + 1;
      return { ...it, positionXMm: it.positionXMm ?? slot?.xMm ?? 0 };
    });
    setDoc(d);
  }, [detail.data, byGtin]);

  const evalResult = useMemo(() => (doc ? computePlacements(doc, (g) => byGtin.get(g)?.dimensions ?? null) : null), [doc, byGtin]);
  if (!doc || !evalResult) return <div className="card p-6 text-sm text-slate-500">Yükleniyor…</div>;
  const W = doc.fixture.widthMm;
  const levels = [...doc.fixture.levels].sort((a, b) => b.heightFromBaseMm - a.heightFromBaseMm);
  const blockWidth = (i: number) => {
    const it = doc.items[i];
    const p = byGtin.get(it.gtin);
    const w = it.orientation === 'side' ? (p?.dimensions?.depthMm ?? 80) : (p?.dimensions?.widthMm ?? 80);
    return it.facings * w + (it.facings - 1) * FACING_GAP_MM;
  };
  const update = (fn: (d: Planogram) => void) => {
    const d = structuredClone(doc);
    fn(d);
    setDoc(d);
    setServerIssues(null);
  };
  const sel = selected !== null ? doc.items[selected] : null;

  const save = async () => {
    setMsg(null);
    try {
      const res = await api<{ saved: boolean; issues: PlanogramIssue[]; fillRatio: number }>(`/api/admin/stores/${storeId}/planograms`, {
        method: 'PUT',
        body: jsonBody({ document: doc }),
      });
      setServerIssues(res.issues);
      setMsg({ tone: 'ok', text: `Kaydedildi ve 3D mağazaya uygulandı (doluluk %${Math.round(res.fillRatio * 100)}).` });
      void qc.invalidateQueries({ queryKey: ['planograms', storeId] });
    } catch (e) {
      const body = (e as { body?: { issues?: PlanogramIssue[] } }).body;
      if (body?.issues) setServerIssues(body.issues);
      setMsg({ tone: 'err', text: `Kaydedilmedi: ${errorMessage(e)}` });
    }
  };

  const issues = serverIssues ?? evalResult.issues;
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-bold">
            {doc.shelfId} <span className="text-sm font-normal text-slate-500">· {doc.aisleId} · {doc.fixture.kind} · {W} × {doc.fixture.depthMm} × {doc.fixture.heightMm} mm</span>
          </h2>
          <span className="text-sm text-slate-600">Doluluk %{Math.round(evalResult.fillRatio * 100)}</span>
          <button className={tab === 'visual' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('visual')}>
            Görsel
          </button>
          <button className={tab === 'json' ? 'btn-primary' : 'btn-secondary'} onClick={() => (setJsonText(JSON.stringify(doc, null, 2)), setTab('json'))}>
            JSON
          </button>
          <button className="btn-primary" onClick={() => void save()}>
            Kaydet ve uygula
          </button>
        </div>
        {msg && <div className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</div>}

        {tab === 'visual' ? (
          <>
            <div className="overflow-x-auto">
              <div className="relative rounded-lg border border-slate-300 bg-slate-100" style={{ width: W * SCALE_PX + 2 }}>
                {levels.map((l) => (
                  <div
                    key={l.index}
                    className="relative border-b-4 border-slate-400 bg-white/60"
                    style={{ height: Math.max(56, Math.min(140, l.clearanceMm * SCALE_PX * 0.5)) }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const idx = Number(e.dataTransfer.getData('text/plain'));
                      const offset = Number(e.dataTransfer.getData('application/x-offset') || 0);
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const x = Math.max(0, Math.round((e.clientX - rect.left - offset) / SCALE_PX));
                      update((d) => {
                        d.items[idx].levelIndex = l.index;
                        d.items[idx].positionXMm = Math.min(x, Math.max(0, W - 10));
                      });
                      setSelected(idx);
                    }}
                  >
                    <span className="absolute top-0.5 left-1 z-10 text-[10px] text-slate-400">
                      Kat {l.index} · {l.heightFromBaseMm} mm · boşluk {l.clearanceMm} mm
                    </span>
                    {doc.items.map((it, i) => {
                      if (it.levelIndex !== l.index) return null;
                      const p = byGtin.get(it.gtin);
                      const bad = evalResult.issues.some((x) => x.gtin === it.gtin && x.levelIndex === it.levelIndex && x.severity === 'error');
                      return (
                        <div
                          key={i}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', String(i));
                            e.dataTransfer.setData('application/x-offset', String(e.clientX - (e.currentTarget as HTMLDivElement).getBoundingClientRect().left));
                          }}
                          onClick={() => setSelected(i)}
                          title={`${p?.name ?? it.gtin} · ${it.facings} facing`}
                          className={`absolute bottom-0 flex cursor-grab items-end justify-center overflow-hidden rounded-t border text-[10px] leading-tight font-semibold text-white shadow ${selected === i ? 'ring-2 ring-blue-500' : ''} ${bad ? 'border-rose-600' : 'border-black/20'}`}
                          style={{
                            left: (it.positionXMm ?? 0) * SCALE_PX,
                            width: Math.max(10, blockWidth(i) * SCALE_PX),
                            height: '78%',
                            background: bad ? 'repeating-linear-gradient(45deg,#e11d48,#e11d48 6px,#be123c 6px,#be123c 12px)' : (p?.appearance.primaryColor ?? '#64748b'),
                          }}
                        >
                          <span className="mb-1 rounded bg-black/40 px-1">
                            {p?.name.slice(0, 18) ?? it.gtin} ×{it.facings}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Ürün bloklarını sürükleyip başka kata veya konuma bırakın. Kırmızı taralı bloklar hatalıdır.</p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <h3 className="mb-2 text-sm font-bold">Seçili kalem</h3>
                {sel ? (
                  <div className="space-y-2 text-sm">
                    <div className="font-medium">{byGtin.get(sel.gtin)?.name ?? sel.gtin}</div>
                    <div className="flex items-center gap-2">
                      Facing:
                      <button className="btn-secondary px-2" onClick={() => update((d) => (d.items[selected!].facings = Math.max(1, d.items[selected!].facings - 1)))}>
                        −
                      </button>
                      <b>{sel.facings}</b>
                      <button className="btn-secondary px-2" onClick={() => update((d) => (d.items[selected!].facings += 1))}>
                        +
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      İstif:
                      <input
                        className="input w-20"
                        type="number"
                        min={1}
                        max={8}
                        value={sel.stackCount ?? 1}
                        onChange={(e) => update((d) => (d.items[selected!].stackCount = Math.max(1, Number(e.target.value))))}
                      />
                      Yön:
                      <select className="input w-28" value={sel.orientation ?? 'front'} onChange={(e) => update((d) => (d.items[selected!].orientation = e.target.value as 'front' | 'side' | 'top'))}>
                        <option value="front">ön</option>
                        <option value="side">yan</option>
                        <option value="top">yatık</option>
                      </select>
                    </div>
                    <button className="btn-danger" onClick={() => (update((d) => d.items.splice(selected!, 1)), setSelected(null))}>
                      Kalemi kaldır
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Raftaki bir bloğa tıklayın.</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <h3 className="mb-2 text-sm font-bold">Ürün ekle</h3>
                <select className="input mb-2" value={addGtin} onChange={(e) => setAddGtin(e.target.value)}>
                  <option value="">Ürün seçin…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.gtin}>
                      {p.name} ({p.dimensions?.widthMm}×{p.dimensions?.heightMm} mm)
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1">
                  {doc.fixture.levels.map((l) => (
                    <button
                      key={l.index}
                      className="btn-secondary text-xs"
                      disabled={!addGtin}
                      onClick={() =>
                        update((d) => {
                          const end = d.items
                            .map((it, i) => ({ it, i }))
                            .filter((x) => x.it.levelIndex === l.index)
                            .reduce((m, x) => Math.max(m, (x.it.positionXMm ?? 0) + blockWidth(x.i) + BLOCK_GAP_MM), 0);
                          d.items.push({ gtin: addGtin, levelIndex: l.index, facings: 1, positionXMm: end, orientation: 'front' });
                        })
                      }
                    >
                      Kat {l.index}'e ekle
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div>
            <textarea className="input h-96 font-mono text-xs" value={jsonText} onChange={(e) => setJsonText(e.target.value)} spellCheck={false} />
            <button
              className="btn-secondary mt-2"
              onClick={() => {
                try {
                  const parsed = planogramSchema.safeParse(JSON.parse(jsonText));
                  if (!parsed.success) throw new Error(parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '));
                  setDoc(parsed.data);
                  setMsg({ tone: 'ok', text: 'JSON uygulandı (kaydetmek için “Kaydet ve uygula”).' });
                } catch (e) {
                  setMsg({ tone: 'err', text: `Geçersiz planogram: ${errorMessage(e)}` });
                }
              }}
            >
              JSON'u düzenleyiciye uygula
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-3">
          <h3 className="mb-2 text-sm font-bold">Canlı 3D önizleme</h3>
          <ShelfPreview planogram={doc} products={products} />
        </div>
        <div className="card p-3">
          <h3 className="mb-2 text-sm font-bold">
            Doğrulama {serverIssues ? '(sunucu)' : '(anlık)'} — {issues.filter((i) => i.severity === 'error').length} hata, {issues.filter((i) => i.severity === 'warning').length} uyarı
          </h3>
          <ul className="max-h-80 space-y-1 overflow-auto text-xs">
            {issues.map((i, k) => (
              <li key={k} className={`rounded px-2 py-1 ${i.severity === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
                <b>{i.code}</b> {i.message}
              </li>
            ))}
            {!issues.length && <li className="text-emerald-700">Sorun yok.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ImportBox({ storeId }: { storeId: string }) {
  const qc = useQueryClient();
  const [format, setFormat] = useState<'json' | 'csv' | 'pln'>('csv');
  const [content, setContent] = useState('');
  const run = useMutation({
    mutationFn: () =>
      api<{ parseErrors: { row?: number; message: string }[]; results: { shelfId: string; saved: boolean; issues: PlanogramIssue[] }[] }>(
        `/api/admin/stores/${storeId}/planograms/import`,
        { method: 'POST', body: jsonBody({ format, content }) },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['planograms', storeId] }),
  });
  return (
    <div className="card p-3">
      <h3 className="mb-2 text-sm font-bold">Planogram içe aktar</h3>
      <select className="input mb-2" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
        <option value="csv">CSV (Excel'den “CSV olarak kaydet”)</option>
        <option value="json">JSON (RealMarket Planogram Format v1)</option>
        <option value="pln">Spaceman PLN (desteklenmiyor)</option>
      </select>
      <input
        type="file"
        className="mb-2 text-xs"
        accept=".csv,.json,.txt,.pln"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setContent(await f.text());
        }}
      />
      <textarea className="input h-28 font-mono text-[11px]" placeholder="İçeriği yapıştırın veya dosya seçin" value={content} onChange={(e) => setContent(e.target.value)} />
      <button className="btn-primary mt-2 w-full" disabled={!content || run.isPending} onClick={() => run.mutate()}>
        İçe aktar
      </button>
      {run.error && <p className="mt-2 text-xs text-rose-600">{errorMessage(run.error)}</p>}
      {run.data && (
        <ul className="mt-2 space-y-1 text-xs">
          {run.data.parseErrors.map((e, i) => (
            <li key={`p${i}`} className="text-rose-700">
              {e.row ? `Satır ${e.row}: ` : ''}
              {e.message}
            </li>
          ))}
          {run.data.results.map((r) => (
            <li key={r.shelfId} className={r.saved ? 'text-emerald-700' : 'text-rose-700'}>
              {r.shelfId}: {r.saved ? 'uygulandı' : `reddedildi — ${r.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ')}`}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Biçim ayrıntıları: PLANOGRAM_FORMAT.md</p>
    </div>
  );
}
