using System;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Çalışma zamanı yapılandırması. Öncelik: sayfa adresi sorgusu (?api=&store=&quality=) →
     * sayfanın köprü üzerinden gönderdiği değerler → derleme varsayılanları.
     * API adresi göreli verilirse ("/api") Unity derlemesiyle aynı kökene gider (CORS gerekmez).
     */
    [Serializable]
    public class RuntimeConfig
    {
        public string ApiBase = "";
        public string StoreId = "demo-market";
        public string Quality = "";
        public bool Embedded;
        /** ?debug=1: köprü test komutları (DEBUG_*) açılır. Üretim sayfası bu bayrağı eklemez. */
        public bool Debug;

        public static RuntimeConfig FromEnvironment()
        {
            var c = new RuntimeConfig();
            string url = Application.absoluteURL ?? "";
            int q = url.IndexOf('?');
            if (q >= 0)
            {
                string query = url.Substring(q + 1);
                int hash = query.IndexOf('#');
                if (hash >= 0) query = query.Substring(0, hash);
                foreach (string part in query.Split('&'))
                {
                    int eq = part.IndexOf('=');
                    if (eq <= 0) continue;
                    string key = part.Substring(0, eq);
                    string value = Uri.UnescapeDataString(part.Substring(eq + 1).Replace('+', ' '));
                    if (key == "api" && IsSafeApi(value)) c.ApiBase = value.TrimEnd('/');
                    else if (key == "store" && IsSafeId(value)) c.StoreId = value;
                    else if (key == "quality") c.Quality = value;
                    else if (key == "debug") c.Debug = value == "1" || value == "true";
                }
            }
#if UNITY_EDITOR
            if (string.IsNullOrEmpty(c.ApiBase)) c.ApiBase = "http://127.0.0.1:3001";
#endif
            // UnityWebRequest mutlak adres ister: göreli/boş API adresi sayfanın kökenine bağlanır
            if ((string.IsNullOrEmpty(c.ApiBase) || c.ApiBase.StartsWith("/", StringComparison.Ordinal)) &&
                Uri.TryCreate(url, UriKind.Absolute, out var page) && (page.Scheme == "http" || page.Scheme == "https"))
                c.ApiBase = page.GetLeftPart(UriPartial.Authority) + (c.ApiBase ?? "");
            return c;
        }

        /** Yalnızca göreli yol veya http(s) adresi kabul edilir (javascript: vb. reddedilir). */
        public static bool IsSafeApi(string v) =>
            !string.IsNullOrEmpty(v) && v.Length < 200 &&
            (v.StartsWith("/", StringComparison.Ordinal) && !v.StartsWith("//", StringComparison.Ordinal) ||
             v.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || v.StartsWith("http://", StringComparison.OrdinalIgnoreCase));

        public static bool IsSafeId(string v)
        {
            if (string.IsNullOrEmpty(v) || v.Length > 64) return false;
            foreach (char ch in v) if (!(char.IsLetterOrDigit(ch) || ch == '-' || ch == '_')) return false;
            return true;
        }
    }
}
