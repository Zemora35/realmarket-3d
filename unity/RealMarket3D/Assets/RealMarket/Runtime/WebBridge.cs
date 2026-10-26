using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Newtonsoft.Json.Linq;
using RealMarket.Core;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Web sayfası ↔ Unity köprüsü.
     * Unity → sayfa: RealMarketBridge.jslib içindeki RM_Emit, window üzerinde "realmarket:event"
     *   CustomEvent'i yayar ve (iframe içindeysek) izin verilen üst kökene postMessage gönderir.
     * Sayfa → Unity: unityInstance.SendMessage("WebBridge", "Receive", json).
     * Zarf: { version: 1, type: "...", payload: {...} }. Bilinmeyen türler yok sayılır.
     */
    public class WebBridge : MonoBehaviour
    {
        public const string ObjectName = "WebBridge";
        public event Action<string, JObject> Received;
        public readonly List<string> Log = new List<string>();

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void RM_Emit(string type, string json);
        [DllImport("__Internal")] static extern int RM_IsEmbedded();
        [DllImport("__Internal")] static extern void RM_Ready();
#else
        static void RM_Emit(string type, string json) { }
        static int RM_IsEmbedded() => 0;
        static void RM_Ready() { }
#endif

        public bool Embedded => RM_IsEmbedded() == 1;

        void Awake() { gameObject.name = ObjectName; }

        /** Sayfaya köprünün komut almaya hazır olduğunu bildirir (sayfa bekleyen SET_SESSION'ı gönderir). */
        public void AnnounceReady() => RM_Ready();

        public void Emit(string type, object payload)
        {
            string json = BridgeEvents.Envelope(type, payload);
            if (Log.Count > 50) Log.RemoveAt(0);
            Log.Add("→ " + type);
            RM_Emit(type, json);
        }

        /** SendMessage hedefi — tek string parametre. */
        public void Receive(string json)
        {
            try
            {
                if (string.IsNullOrEmpty(json) || json.Length > 64 * 1024) return;
                var o = JObject.Parse(json);
                string type = (string)o["type"];
                if (string.IsNullOrEmpty(type)) return;
                if (Log.Count > 50) Log.RemoveAt(0);
                Log.Add("← " + type);
                Received?.Invoke(type, o["payload"] as JObject ?? new JObject());
            }
            catch (Exception e) { Debug.LogWarning("[RealMarket] köprü mesajı okunamadı: " + e.Message); }
        }
    }
}
