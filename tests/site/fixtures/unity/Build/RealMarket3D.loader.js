// TEST DUBLÖRÜ — gerçek Unity derlemesi DEĞİLDİR.
// Unity WebBridge'in köprü sözleşmesini (jslib olayları + SendMessage komutları) taklit eder;
// sitenin köprü tarafını Unity derlemesi olmadan test etmeye yarar.
(function () {
  const log = [];
  let session = null;
  const emit = (type, payload) => {
    const message = { version: 1, type, payload };
    window.dispatchEvent(new CustomEvent('realmarket:event', { detail: message }));
    if (window.RealMarketBridge) window.RealMarketBridge.onEvent(type, message);
  };
  const api = async (path, method = 'GET', body) => {
    const res = await fetch(path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), 'x-session-token': session.token },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };
  window.__mockUnity = {
    log,
    get session() { return session; },
    // Unity içinde raftan ürün alınıp sepete eklenmiş gibi
    async addFromShelf(storeProductId) {
      const cart = await api(`/api/sessions/${session.sessionId}/cart/add`, 'POST', { storeProductId, quantity: 1 });
      emit('ADD_TO_CART', { storeProductId, quantity: 1 });
      emit('CART_UPDATED', cart);
      return cart;
    },
  };
  window.createUnityInstance = async function (canvas, config, onProgress) {
    if (!config.dataUrl.endsWith('.br') || !config.codeUrl.includes('/Build/RealMarket3D.wasm')) throw new Error('beklenmeyen yapılandırma');
    onProgress(0.5);
    onProgress(1);
    const instance = {
      SendMessage(obj, method, json) {
        if (obj !== 'WebBridge' || method !== 'Receive') throw new Error('yanlış hedef');
        const msg = JSON.parse(json);
        log.push(msg.type);
        if (msg.type === 'SET_SESSION') {
          session = msg.payload;
          emit('SESSION_READY', { ...session, isNew: false });
        }
        if (msg.type === 'CART_UPDATED') api(`/api/sessions/${session.sessionId}/cart`).then((c) => emit('CART_UPDATED', c));
      },
      async Quit() { log.push('QUIT'); },
    };
    setTimeout(() => {
      window.RealMarketBridge.onReady();
      setTimeout(() => emit('SCENE_LOADED', { storeId: 'demo-market', products: 42 }), 50);
    }, 20);
    return instance;
  };
})();
