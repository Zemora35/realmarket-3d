// RealMarket web sitesi: istemci tarafı yönlendirme + sayfalar (çerçevesiz ES modülleri).
import {
  STORE_ID, addToCart, api, currentCart, ensureSession, loadSession, money, onCart, orders, pay, quote, refreshCart, removeFromCart, clearSession,
} from './api.js';
import { THREE_URL, bridgeLog, sendToUnity, startUnity, stopUnity, unityAvailable, unityRunning } from './bridge.js';

const main = document.getElementById('main');
const badge = document.getElementById('cart-badge');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let toastTimer;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

onCart((cart) => {
  const n = cart?.itemCount ?? 0;
  badge.textContent = String(n);
  badge.hidden = n === 0;
});

let catalog = null;
async function products() {
  if (!catalog) catalog = await api(`/api/stores/${encodeURIComponent(STORE_ID)}/products`);
  return catalog;
}

function swatch(p) {
  const a = p.appearance || {};
  return `<div class="swatch" style="--c1:${esc(a.primaryColor || '#64748b')};--c2:${esc(a.secondaryColor || '#e2e8f0')};--c3:${esc(a.accentColor || '#94a3b8')}" aria-hidden="true"><span>${esc(p.brand)}</span></div>`;
}

function productCard(p) {
  const promo = p.promotion?.label ? `<span class="tag promo">${esc(p.promotion.label)}</span>` : '';
  const list = p.listPriceKurus && p.listPriceKurus > p.priceKurus ? `<s>${money(p.listPriceKurus)}</s>` : '';
  return `<article class="card product">
    ${swatch(p)}
    <div class="body">
      <h3>${esc(p.name)}</h3>
      <p class="muted">${esc(p.brand)} · ${esc(p.subcategory || p.category)}</p>
      <p class="price">${money(p.priceKurus)} ${list} ${promo}</p>
      <div class="row">
        <button class="btn primary" data-add="${esc(p.storeProductId)}" ${p.available > 0 ? '' : 'disabled'}>${p.available > 0 ? 'Sepete ekle' : 'Stokta yok'}</button>
        <a class="btn ghost" href="/market?product=${encodeURIComponent(p.id)}" data-link>Rafta gör</a>
      </div>
    </div>
  </article>`;
}

function bindAddButtons(root) {
  root.querySelectorAll('[data-add]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await addToCart(b.dataset.add);
        toast('Sepete eklendi');
      } catch (e) {
        toast(e.message);
      } finally {
        b.disabled = false;
      }
    }),
  );
}

// ---- sayfalar --------------------------------------------------------------------------

const pages = {
  async '/'() {
    document.title = 'RealMarket — 3B sanal süpermarket';
    main.innerHTML = `<section class="hero">
        <div>
          <p class="eyebrow">Sanal süpermarket</p>
          <h1>Rafların arasında yürüyün, ürünü elinize alın, kasada ödeyin.</h1>
          <p class="lead">RealMarket gerçek ölçülerde kurulmuş bir mağazadır. Ürünleri raftan alıp inceleyebilir, arabanıza koyabilir, demo ödeme ile alışverişi tamamlayabilirsiniz. Sepetiniz site ile mağaza arasında ortaktır.</p>
          <div class="row"><a class="btn primary lg" href="/market" data-link>Mağazaya gir</a><a class="btn ghost lg" href="/products" data-link>Ürünlere göz at</a></div>
        </div>
        <ul class="facts">
          <li><b>Masaüstü</b><span>WASD ile yürüyün, fareyle bakın</span></li>
          <li><b>Mobil</b><span>Sanal joystick ve dokunmatik bakış</span></li>
          <li><b>Ortak sepet</b><span>Site ve 3B mağaza aynı sepeti kullanır</span></li>
        </ul>
      </section>
      <section class="page"><h2>Kampanyalı ürünler</h2><div id="featured" class="grid"><p class="muted">Yükleniyor…</p></div></section>`;
    const list = await products().catch(() => []);
    const featured = list.filter((p) => p.promotion).concat(list.filter((p) => !p.promotion)).slice(0, 8);
    const el = document.getElementById('featured');
    el.innerHTML = featured.length ? featured.map(productCard).join('') : '<p class="muted">Ürünler alınamadı — API çalışıyor mu?</p>';
    bindAddButtons(el);
  },

  async '/market'() {
    document.title = 'Mağaza — RealMarket';
    main.innerHTML = `<section class="market">
      <div class="stage" id="stage">
        <canvas id="unity-canvas" tabindex="-1" aria-label="3B mağaza"></canvas>
        <div class="loader" id="loader"><div class="spinner"></div><p id="loader-text">Mağaza hazırlanıyor…</p><div class="bar"><i id="bar"></i></div></div>
      </div>
      <aside class="side" id="side">
        <h2>Seçili ürün</h2><div id="selected" class="muted">Raftan bir ürün alın.</div>
        <h2>Sepet</h2><div id="mini-cart" class="muted">—</div>
        <p class="row"><a class="btn primary" href="/checkout" data-link>Ödemeye geç</a><button class="btn ghost" id="fullscreen">Tam ekran</button></p>
        <details><summary>Köprü olayları</summary><pre id="events"></pre></details>
      </aside>
    </section>`;
    const renderMini = (cart) => {
      const el = document.getElementById('mini-cart');
      if (!el) return;
      el.innerHTML = cart && cart.lines.length
        ? `<ul class="lines">${cart.lines.map((l) => `<li><span>${l.quantity} × ${esc(l.name)}</span><b>${money(l.lineTotalKurus)}</b></li>`).join('')}</ul><p><b>Toplam ${money(cart.totalKurus)}</b></p>`
        : 'Sepetiniz boş.';
    };
    renderMini(currentCart());
    const off = onCart(renderMini);
    cleanups.push(off);
    document.getElementById('fullscreen').addEventListener('click', () => document.getElementById('stage').requestFullscreen?.());

    const productParam = new URLSearchParams(location.search).get('product');
    if (!(await unityAvailable())) {
      document.getElementById('loader').innerHTML = `<p><b>Unity Web derlemesi bu sunucuda yok.</b></p>
        <p class="muted">CI derlemesi (GitHub Actions + GameCI) yayımlanana kadar Three.js sürümü açılıyor.</p>`;
      const frame = document.createElement('iframe');
      frame.src = THREE_URL;
      frame.title = '3B mağaza (Three.js)';
      frame.allow = 'fullscreen; autoplay';
      frame.className = 'fallback-frame';
      document.getElementById('stage').appendChild(frame);
      setTimeout(() => document.getElementById('loader')?.remove(), 2500);
      return;
    }
    try {
      await startUnity(document.getElementById('unity-canvas'), {
        onProgress: (p) => {
          const bar = document.getElementById('bar');
          if (bar) bar.style.width = `${Math.round(p * 100)}%`;
          const t = document.getElementById('loader-text');
          if (t) t.textContent = `Mağaza indiriliyor… %${Math.round(p * 100)}`;
        },
        onEvent: (type, p) => {
          const ev = document.getElementById('events');
          if (ev) ev.textContent = bridgeLog().slice(-14).map((e) => `${e.dir === 'in' ? '←' : '→'} ${e.type}`).join('\n');
          if (type === 'SCENE_LOADED') {
            document.getElementById('loader')?.remove();
            if (productParam) sendToUnity('NAVIGATE_TO', { productId: productParam });
          }
          if (type === 'PRODUCT_SELECTED') {
            const el = document.getElementById('selected');
            if (el) el.innerHTML = `<b>${esc(p.name)}</b><br>${money(p.priceKurus)}<br><span class="muted">Barkod ${esc(p.gtin)}</span>`;
          }
          if (type === 'CHECKOUT_STARTED') toast(`Kasada: ${money(p.totalKurus)}`);
          if (type === 'ORDER_COMPLETED') toast(`Sipariş ${p.orderNumber} tamamlandı`);
          if (type === 'ERROR') toast(p.message);
        },
      });
    } catch (e) {
      document.getElementById('loader').innerHTML = `<p><b>Mağaza açılamadı</b></p><p class="muted">${esc(e.message)}</p><p class="muted">Tarayıcınız WebGL 2 desteklemiyor olabilir.</p>`;
    }
    cleanups.push(() => stopUnity());
  },

  async '/products'() {
    document.title = 'Ürünler — RealMarket';
    main.innerHTML = `<section class="page">
      <div class="row between"><h1>Ürünler</h1><input id="q" type="search" placeholder="Ürün, marka veya barkod ara" aria-label="Ürün ara" /></div>
      <div id="cats" class="chips" role="tablist"></div>
      <div id="list" class="grid"><p class="muted">Yükleniyor…</p></div>
    </section>`;
    const all = await products().catch((e) => (toast(e.message), []));
    const cats = [...new Set(all.map((p) => p.category))];
    let cat = '';
    const catsEl = document.getElementById('cats');
    catsEl.innerHTML = ['', ...cats].map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${c === ''}">${c ? esc(c.replaceAll('_', ' ').toLocaleLowerCase('tr-TR')) : 'Tümü'}</button>`).join('');
    const q = document.getElementById('q');
    const norm = (s) => String(s ?? '').toLocaleLowerCase('tr-TR');
    const render = () => {
      const term = norm(q.value.trim());
      const rows = all.filter((p) => (!cat || p.category === cat) && (!term || norm(`${p.name} ${p.brand} ${p.gtin} ${p.subcategory}`).includes(term)));
      const el = document.getElementById('list');
      el.innerHTML = rows.length ? rows.map(productCard).join('') : '<p class="muted">Sonuç yok.</p>';
      bindAddButtons(el);
    };
    catsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      cat = b.dataset.cat;
      catsEl.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      render();
    });
    q.addEventListener('input', render);
    render();
  },

  async '/cart'() {
    document.title = 'Sepet — RealMarket';
    main.innerHTML = `<section class="page narrow"><h1>Sepetim</h1><div id="cart"><p class="muted">Yükleniyor…</p></div></section>`;
    const render = (cart) => {
      const el = document.getElementById('cart');
      if (!el) return;
      if (!cart || cart.lines.length === 0) {
        el.innerHTML = `<p class="muted">Sepetiniz boş.</p><p class="row"><a class="btn primary" href="/market" data-link>Mağazaya gir</a><a class="btn ghost" href="/products" data-link>Ürünler</a></p>`;
        return;
      }
      el.innerHTML = `<ul class="cart-lines">${cart.lines.map((l) => `<li>
          <div><b>${esc(l.name)}</b><span class="muted">${money(l.unitPriceKurus)}${l.promotionLabel ? ` · ${esc(l.promotionLabel)}` : ''}</span></div>
          <div class="qty"><button class="btn icon" data-dec="${esc(l.storeProductId)}" aria-label="Azalt">−</button><span>${l.quantity}</span><button class="btn icon" data-inc="${esc(l.storeProductId)}" aria-label="Artır">+</button></div>
          <b>${money(l.lineTotalKurus)}</b></li>`).join('')}</ul>
        <dl class="totals"><dt>Ara toplam</dt><dd>${money(cart.subtotalKurus)}</dd>${cart.discountKurus ? `<dt>İndirim</dt><dd>−${money(cart.discountKurus)}</dd>` : ''}<dt class="total">Toplam</dt><dd class="total">${money(cart.totalKurus)}</dd></dl>
        <p class="row end"><a class="btn ghost" href="/market" data-link>Alışverişe devam</a><a class="btn primary" href="/checkout" data-link>Ödemeye geç</a></p>`;
      el.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => addToCart(b.dataset.inc).catch((e) => toast(e.message))));
      el.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => removeFromCart(b.dataset.dec).catch((e) => toast(e.message))));
    };
    cleanups.push(onCart(render));
    render(await refreshCart().catch((e) => (toast(e.message), null)));
  },

  async '/checkout'() {
    document.title = 'Ödeme — RealMarket';
    main.innerHTML = `<section class="page narrow"><h1>Ödeme</h1><div id="co"><p class="muted">Tutar hesaplanıyor…</p></div></section>`;
    const el = document.getElementById('co');
    let q;
    try {
      q = await quote();
    } catch (e) {
      el.innerHTML = `<p>${esc(e.code === 'CART_EMPTY' ? 'Sepetiniz boş.' : e.message)}</p><a class="btn primary" href="/market" data-link>Mağazaya gir</a>`;
      return;
    }
    if (!q.lines.length) {
      el.innerHTML = `<p class="muted">Sepetiniz boş.</p><a class="btn primary" href="/market" data-link>Mağazaya gir</a>`;
      return;
    }
    el.innerHTML = `<ul class="cart-lines compact">${q.lines.map((l) => `<li><span>${l.quantity} × ${esc(l.name)}</span><b>${money(l.lineTotalKurus)}</b></li>`).join('')}</ul>
      <dl class="totals"><dt>Ara toplam</dt><dd>${money(q.subtotalKurus)}</dd>${q.discountKurus ? `<dt>İndirim</dt><dd>−${money(q.discountKurus)}</dd>` : ''}<dt class="total">Toplam</dt><dd class="total">${money(q.totalKurus)}</dd></dl>
      <div class="notice">Bu bir demo ödemedir: kart bilgisi istenmez, gerçek para çekilmez.</div>
      <p class="row end"><a class="btn ghost" href="/cart" data-link>Sepete dön</a><button class="btn primary lg" id="pay">${money(q.totalKurus)} öde (demo)</button></p>`;
    document.getElementById('pay').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try {
        const order = await pay(q.totalKurus);
        el.innerHTML = `<div class="receipt"><h2>Teşekkürler!</h2><p>Sipariş no <b>${esc(order.orderNumber)}</b></p>
          <ul class="cart-lines compact">${order.items.map((i) => `<li><span>${i.quantity} × ${esc(i.name)}</span><b>${money(i.lineTotalKurus)}</b></li>`).join('')}</ul>
          <p><b>Toplam ${money(order.totalKurus)}</b></p><p class="row"><a class="btn primary" href="/market" data-link>Yeni alışveriş</a><a class="btn ghost" href="/account" data-link>Siparişlerim</a></p></div>`;
      } catch (e) {
        ev.target.disabled = false;
        toast(e.code === 'PRICE_CHANGED' ? 'Tutar değişti, sayfa yenileniyor' : e.message);
        if (e.code === 'PRICE_CHANGED') route();
      }
    });
  },

  async '/account'() {
    document.title = 'Hesabım — RealMarket';
    const s = loadSession();
    const list = orders();
    main.innerHTML = `<section class="page narrow"><h1>Hesabım</h1>
      <div class="card pad"><h2>Alışveriş oturumu</h2>
        <p class="muted">Üyelik gerekmez. Sepetiniz bu tarayıcıda saklanan bir oturum anahtarıyla korunur; anahtar sunucuda yalnızca özet (hash) olarak tutulur.</p>
        <p>Oturum: <code>${s ? esc(s.sessionId.slice(0, 8)) + '…' : 'yok'}</code> · Mağaza: <code>${esc(STORE_ID)}</code></p>
        <button class="btn ghost" id="reset">Yeni boş sepetle başla</button></div>
      <div class="card pad"><h2>Siparişlerim (bu cihaz)</h2>
        ${list.length ? `<ul class="cart-lines compact">${list.map((o) => `<li><span>${esc(o.orderNumber)} · ${new Date(o.createdAt).toLocaleString('tr-TR')}</span><b>${money(o.totalKurus)}</b></li>`).join('')}</ul>` : '<p class="muted">Henüz sipariş yok.</p>'}
      </div></section>`;
    document.getElementById('reset').addEventListener('click', async () => {
      clearSession();
      await ensureSession();
      await refreshCart();
      toast('Yeni oturum açıldı');
      route();
    });
  },

  async '/admin'() {
    document.title = 'Yönetim — RealMarket';
    main.innerHTML = `<section class="page narrow"><h1>Yönetim paneli</h1>
      <p>Ürün, fiyat, stok ve planogram yönetimi ayrı bir uygulamadır ve yönetici girişi gerektirir.</p>
      <p class="row"><a class="btn primary" href="${esc((window.REALMARKET_CONFIG || {}).adminUrl || '/admin/')}">Yönetim panelini aç</a></p>
      <p class="muted">API belgeleri: <a href="/api/docs">/api/docs</a></p></section>`;
  },
};

// ---- yönlendirici ----------------------------------------------------------------------

let cleanups = [];
async function route() {
  for (const c of cleanups.splice(0)) await c();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const page = pages[path] || notFound;
  document.querySelectorAll('.nav a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === path ? 'page' : 'false'));
  document.body.dataset.page = path.slice(1) || 'home';
  try {
    await page();
  } catch (e) {
    main.innerHTML = `<section class="page"><h1>Bir sorun oluştu</h1><p>${esc(e.message)}</p></section>`;
  }
  main.focus({ preventScroll: true });
}

async function notFound() {
  main.innerHTML = `<section class="page"><h1>Sayfa bulunamadı</h1><a class="btn primary" href="/" data-link>Ana sayfa</a></section>`;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  // /admin bağlantısı yönetim uygulamasına gidiyorsa tam sayfa geçiş
  if (url.pathname.startsWith('/admin/')) return;
  e.preventDefault();
  if (url.pathname + url.search === location.pathname + location.search) return;
  history.pushState({}, '', url);
  route();
});
window.addEventListener('popstate', route);

refreshCart().catch(() => {});
route();

// test ve hata ayıklama için
window.__realmarket = { unityRunning, bridgeLog, refreshCart, sendToUnity };
