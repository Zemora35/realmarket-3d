// Unity Web derlemesini yükler ve sayfa ↔ Unity köprüsünü kurar.
// Unity → sayfa: jslib "realmarket:event" CustomEvent'i (window.RealMarketBridge.onEvent).
// Sayfa → Unity: unityInstance.SendMessage('WebBridge', 'Receive', JSON zarfı).
// Unity derlemesi yoksa (henüz CI derlemesi yayımlanmadıysa) Three.js sürümü yedek olarak açılır.
import { loadSession, onCart, onSessionChange, publishCart, rememberOrder, saveSession, ensureSession } from './api.js';

const CFG = window.REALMARKET_CONFIG || {};
export const UNITY_BASE = (CFG.unityBase || '/unity').replace(/\/$/, '');
export const UNITY_NAME = CFG.unityBuildName || 'RealMarket3D';
export const THREE_URL = CFG.threeUrl || '/3d/';

let instance = null;
let unsubscribers = [];
const eventLog = [];
export const bridgeLog = () => eventLog.slice();

function send(type, payload = {}) {
  if (!instance) return false;
  const json = JSON.stringify({ version: 1, type, payload });
  instance.SendMessage('WebBridge', 'Receive', json);
  eventLog.push({ dir: 'out', type, at: Date.now() });
  return true;
}

export const sendToUnity = send;

/** Unity derlemesi yayımlanmış mı? (loader.js var mı) */
export async function unityAvailable() {
  try {
    const res = await fetch(`${UNITY_BASE}/Build/${UNITY_NAME}.loader.js`, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`${src} yüklenemedi`));
    document.head.appendChild(s);
  });
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ onProgress?: (p:number)=>void, onEvent?: (type:string, payload:any)=>void, quality?: string }} opts
 */
export async function startUnity(canvas, opts = {}) {
  await ensureSession();
  window.RealMarketBridge = {
    embedded: true,
    onReady() {
      const s = loadSession();
      if (s) send('SET_SESSION', s);
    },
    onEvent(type, message) {
      eventLog.push({ dir: 'in', type, at: Date.now() });
      const p = message && message.payload;
      switch (type) {
        case 'SESSION_READY':
          saveSession(p);
          break;
        case 'CART_UPDATED':
          if (p && Array.isArray(p.lines)) publishCart(p, { fromUnity: true });
          break;
        case 'ORDER_COMPLETED':
          rememberOrder({ id: p.orderId, orderNumber: p.orderNumber, totalKurus: p.totalKurus });
          break;
        default:
          break;
      }
      opts.onEvent?.(type, p);
    },
  };
  await loadScript(`${UNITY_BASE}/Build/${UNITY_NAME}.loader.js`);
  const mobile = matchMedia('(pointer: coarse)').matches;
  const query = new URLSearchParams(location.search);
  const config = {
    dataUrl: `${UNITY_BASE}/Build/${UNITY_NAME}.data${CFG.unityExt ?? '.br'}`,
    frameworkUrl: `${UNITY_BASE}/Build/${UNITY_NAME}.framework.js${CFG.unityExt ?? '.br'}`,
    codeUrl: `${UNITY_BASE}/Build/${UNITY_NAME}.wasm${CFG.unityExt ?? '.br'}`,
    streamingAssetsUrl: `${UNITY_BASE}/StreamingAssets`,
    companyName: 'RealMarket',
    productName: 'RealMarket 3D',
    productVersion: CFG.version || 'dev',
    // mobilde piksel yoğunluğu sınırlanır (pil/ısı)
    devicePixelRatio: mobile ? Math.min(window.devicePixelRatio || 1, 1.5) : undefined,
    matchWebGLToCanvasSize: true,
  };
  // Unity çalışma zamanı, API adresini ve mağazayı sayfa adresinden okur (RuntimeConfig)
  if (!query.has('store')) query.set('store', loadSession()?.storeId || 'demo-market');
  if (opts.quality) query.set('quality', opts.quality);
  if (CFG.apiBase) query.set('api', CFG.apiBase);
  history.replaceState(history.state, '', `${location.pathname}?${query}`);

  instance = await window.createUnityInstance(canvas, config, (p) => opts.onProgress?.(p));

  // sitedeki sepet değişiklikleri (ürünler/sepet sayfası, başka sekme) Unity'ye bildirilir
  unsubscribers.push(onCart((cart, meta) => { if (!meta.fromUnity) send('CART_UPDATED', { itemCount: cart.itemCount }); }));
  unsubscribers.push(onSessionChange((s) => send('SET_SESSION', s)));
  return instance;
}

export async function stopUnity() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  const inst = instance;
  instance = null;
  window.RealMarketBridge = undefined;
  if (inst) await inst.Quit().catch(() => {});
}

export const unityRunning = () => instance !== null;
