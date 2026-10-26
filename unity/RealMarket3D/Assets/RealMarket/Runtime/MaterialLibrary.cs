using System.Collections.Generic;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Derlemeye dahil edilecek URP malzeme şablonları. Editor BuildScript bu varlığı oluşturur ve
     * sahnedeki GameManager'a bağlar; böylece Lit/Unlit gölgelendirici varyantları (GPU instancing,
     * normal haritası, ışıma) derlemede kırpılmaz. Çalışma zamanında yalnızca kopyaları değiştirilir.
     */
    [CreateAssetMenu(menuName = "RealMarket/Material Library")]
    public class MaterialLibrary : ScriptableObject
    {
        public Material Lit;
        public Material LitInstanced;
        public Material LitTransparent;
        public Material Emissive;
        public Material Unlit;
        public Material TextMaterial;
        /** URP renderer verisi (SSAO gibi özellikleri kalite profiline göre açıp kapatmak için; BuildScript bağlar). */
        public UnityEngine.Rendering.Universal.ScriptableRendererData Renderer;

        readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();

        /** Renk/pürüzlülük/metallik bazlı paylaşılan malzeme (aynı anahtar → aynı örnek → SRP Batcher dostu). */
        public Material Solid(Color color, float smoothness = 0.35f, float metallic = 0f, bool instanced = false)
        {
            string key = $"{(instanced ? "i" : "s")}{ColorUtility.ToHtmlStringRGBA(color)}{smoothness:0.00}{metallic:0.00}";
            if (cache.TryGetValue(key, out var m)) return m;
            m = new Material(instanced ? LitInstanced : Lit) { name = "rm-" + key };
            SetBase(m, color);
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_Metallic", metallic);
            cache[key] = m;
            return m;
        }

        public Material Glass(Color tint, float alpha)
        {
            string key = "g" + ColorUtility.ToHtmlStringRGB(tint) + alpha.ToString("0.00");
            if (cache.TryGetValue(key, out var m)) return m;
            m = new Material(LitTransparent) { name = "rm-" + key };
            SetBase(m, new Color(tint.r, tint.g, tint.b, alpha));
            m.SetFloat("_Smoothness", 0.92f);
            cache[key] = m;
            return m;
        }

        public Material Glow(Color color, float intensity)
        {
            string key = "e" + ColorUtility.ToHtmlStringRGB(color) + intensity.ToString("0.0");
            if (cache.TryGetValue(key, out var m)) return m;
            m = new Material(Emissive) { name = "rm-" + key };
            SetBase(m, color);
            m.SetColor("_EmissionColor", color * intensity);
            cache[key] = m;
            return m;
        }

        public Material Textured(Texture2D tex, Color tint, float smoothness, string key, bool instanced = false)
        {
            if (cache.TryGetValue(key, out var m)) return m;
            m = new Material(instanced ? LitInstanced : Lit) { name = "rm-" + key };
            SetBase(m, tint);
            m.SetTexture("_BaseMap", tex);
            m.mainTexture = tex;
            m.SetFloat("_Smoothness", smoothness);
            cache[key] = m;
            return m;
        }

        public static void SetBase(Material m, Color c)
        {
            m.SetColor("_BaseColor", c);
            m.color = c;
        }

        public static Color Hex(string hex, Color fallback)
        {
            if (!string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var c)) return c;
            return fallback;
        }
    }
}
