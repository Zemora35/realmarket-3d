using System;
using System.Globalization;

namespace RealMarket.Core
{
    public enum QualityTier { Low = 0, Medium = 1, High = 2, Ultra = 3 }

    /** Unity Web için grafik profili (URP ayarları GraphicsQualityManager'da uygulanır). */
    public class QualityProfile
    {
        public QualityTier Tier; public string Label;
        public float RenderScale; public bool Shadows; public float ShadowDistance; public int ShadowResolution;
        public int Msaa; public bool PostProcessing; public bool Ssao;
        public float LodMid; public float LodFar; public float LodHysteresis; public float MaxProductDistance;
        public int TargetFrameRate;

        public static QualityProfile For(QualityTier t)
        {
            switch (t)
            {
                case QualityTier.Low:
                    return new QualityProfile { Tier = t, Label = "Düşük", RenderScale = 0.7f, Shadows = false, ShadowDistance = 0, ShadowResolution = 512, Msaa = 1, PostProcessing = false, Ssao = false, LodMid = 2.2f, LodFar = 5f, LodHysteresis = 0.12f, MaxProductDistance = 16f, TargetFrameRate = 30 };
                case QualityTier.Medium:
                    return new QualityProfile { Tier = t, Label = "Orta", RenderScale = 0.85f, Shadows = true, ShadowDistance = 12, ShadowResolution = 1024, Msaa = 1, PostProcessing = true, Ssao = false, LodMid = 3.5f, LodFar = 8f, LodHysteresis = 0.12f, MaxProductDistance = 22f, TargetFrameRate = 60 };
                case QualityTier.High:
                    return new QualityProfile { Tier = t, Label = "Yüksek", RenderScale = 1f, Shadows = true, ShadowDistance = 20, ShadowResolution = 2048, Msaa = 2, PostProcessing = true, Ssao = true, LodMid = 5.5f, LodFar = 12f, LodHysteresis = 0.1f, MaxProductDistance = 32f, TargetFrameRate = 60 };
                default:
                    return new QualityProfile { Tier = QualityTier.Ultra, Label = "Ultra", RenderScale = 1f, Shadows = true, ShadowDistance = 30, ShadowResolution = 4096, Msaa = 4, PostProcessing = true, Ssao = true, LodMid = 8f, LodFar = 16f, LodHysteresis = 0.08f, MaxProductDistance = 45f, TargetFrameRate = 60 };
            }
        }

        /** Başlangıç önerisi: mobil düşük/orta, tümleşik GPU orta, ayrık GPU yüksek. */
        public static QualityTier Recommend(bool mobile, string gpu, int systemMemoryMb)
        {
            string g = (gpu ?? "").ToLowerInvariant();
            if (g.Contains("swiftshader") || g.Contains("llvmpipe")) return QualityTier.Low;
            if (mobile) return (g.Contains("apple") || g.Contains("adreno (tm) 7") || g.Contains("adreno (tm) 8")) && systemMemoryMb >= 4000 ? QualityTier.Medium : QualityTier.Low;
            if (g.Contains("rtx") || g.Contains("rx 6") || g.Contains("rx 7")) return QualityTier.Ultra;
            if (g.Contains("nvidia") || g.Contains("geforce") || g.Contains("radeon rx")) return QualityTier.High;
            return QualityTier.Medium;
        }
    }

    public static class Money
    {
        /**
         * 345000 → "₺3.450,00". Kültür tablosuna dayanmaz: WebGL/IL2CPP derlemelerinde
         * kültür verisi kırpılabildiği için ayırıcılar elle yazılır.
         */
        public static string Format(int kurus)
        {
            bool negative = kurus < 0;
            long abs = Math.Abs((long)kurus);
            string whole = (abs / 100).ToString(CultureInfo.InvariantCulture);
            var sb = new System.Text.StringBuilder();
            for (int i = 0; i < whole.Length; i++)
            {
                if (i > 0 && (whole.Length - i) % 3 == 0) sb.Append('.');
                sb.Append(whole[i]);
            }
            return (negative ? "-₺" : "₺") + sb + "," + (abs % 100).ToString("00", CultureInfo.InvariantCulture);
        }

        /** "3.450,00 TL" — ₺ glifi olmayan gömülü yazı tiplerinde (Unity LegacyRuntime) kullanılır. */
        public static string FormatTl(int kurus)
        {
            string s = Format(kurus);
            bool negative = s.StartsWith("-", StringComparison.Ordinal);
            return (negative ? "-" : "") + s.Substring(negative ? 2 : 1) + " TL";
        }
    }

    /** Web sayfası ↔ Unity köprüsü olay adları ve zarf biçimi. */
    public static class BridgeEvents
    {
        public const string SessionReady = "SESSION_READY";
        public const string ProductSelected = "PRODUCT_SELECTED";
        public const string AddToCart = "ADD_TO_CART";
        public const string RemoveFromCart = "REMOVE_FROM_CART";
        public const string CartUpdated = "CART_UPDATED";
        public const string CheckoutStarted = "CHECKOUT_STARTED";
        public const string OrderCompleted = "ORDER_COMPLETED";
        public const string SceneLoaded = "SCENE_LOADED";
        public const string Error = "ERROR";

        /** Sayfadan Unity'ye gelen komutlar */
        public const string SetSession = "SET_SESSION";
        public const string SetQuality = "SET_QUALITY";
        public const string NavigateTo = "NAVIGATE_TO";

        public static string Envelope(string type, object payload) =>
            Json.Write(new BridgeMessage { Type = type, Payload = payload, Version = 1 });
    }

    public class BridgeMessage
    {
        public int Version; public string Type; public object Payload;
    }
}
