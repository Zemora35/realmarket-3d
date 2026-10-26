// RealMarket Unity ↔ sayfa köprüsü (Emscripten kütüphanesi).
// Sayfa isteğe bağlı olarak window.RealMarketBridgeConfig = { parentOrigin: "https://site.ornek" }
// tanımlarsa, iframe içinde çalışırken olaylar yalnızca o kökene postMessage ile iletilir.
mergeInto(LibraryManager.library, {
  RM_Emit: function (typePtr, jsonPtr) {
    var type = UTF8ToString(typePtr);
    var json = UTF8ToString(jsonPtr);
    var message;
    try { message = JSON.parse(json); } catch (e) { return; }
    try {
      window.dispatchEvent(new CustomEvent('realmarket:event', { detail: message }));
    } catch (e) { /* eski tarayıcı */ }
    try {
      var cfg = window.RealMarketBridgeConfig || {};
      if (window.parent && window.parent !== window && typeof cfg.parentOrigin === 'string' && cfg.parentOrigin.length > 0) {
        window.parent.postMessage({ source: 'realmarket-unity', message: message }, cfg.parentOrigin);
      }
    } catch (e) { /* farklı köken */ }
    if (window.RealMarketBridge && typeof window.RealMarketBridge.onEvent === 'function') {
      try { window.RealMarketBridge.onEvent(type, message); } catch (e) { console.error(e); }
    }
  },

  RM_IsEmbedded: function () {
    return (window.RealMarketBridge && window.RealMarketBridge.embedded === true) || (window.parent && window.parent !== window) ? 1 : 0;
  },

  RM_Ready: function () {
    try { window.dispatchEvent(new CustomEvent('realmarket:ready')); } catch (e) { }
    if (window.RealMarketBridge && typeof window.RealMarketBridge.onReady === 'function') {
      try { window.RealMarketBridge.onReady(); } catch (e) { console.error(e); }
    }
  }
});
