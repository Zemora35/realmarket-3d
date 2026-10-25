using UnityEngine;

namespace RealMarket.Runtime
{
    /** Çalışma zamanında üretilen dokular (ek indirme yok): zemin karosu, tavan paneli, delikli pano. */
    public static class ProceduralTextures
    {
        static float Hash(int x, int y)
        {
            unchecked
            {
                int h = x * 374761393 + y * 668265263;
                h = (h ^ (h >> 13)) * 1274126177;
                return ((h ^ (h >> 16)) & 0xffff) / 65535f;
            }
        }

        static Texture2D Make(int size, string name, bool mip = true)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, mip) { name = name, wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Trilinear, anisoLevel = 8 };
            return t;
        }

        /** 2×2 karo (tek döşeme = 1.2 m): açık terrazzo, ince derz, karo başına hafif ton farkı. */
        public static Texture2D FloorTiles()
        {
            const int S = 512;
            var t = Make(S, "floor-tiles");
            var px = new Color32[S * S];
            int tile = S / 2;
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    int tx = x / tile, ty = y / tile;
                    int lx = x % tile, ly = y % tile;
                    float baseTone = 0.86f + (Hash(tx, ty) - 0.5f) * 0.04f;
                    float speck = Hash(x * 3, y * 7);
                    float v = baseTone + (speck > 0.985f ? -0.18f : speck > 0.95f ? -0.06f : 0f) + (Hash(x / 6, y / 6) - 0.5f) * 0.025f;
                    bool grout = lx < 2 || ly < 2;
                    if (grout) v = 0.62f;
                    byte r = (byte)(Mathf.Clamp01(v) * 255), g = (byte)(Mathf.Clamp01(v * 0.985f) * 255), b = (byte)(Mathf.Clamp01(v * 0.955f) * 255);
                    px[y * S + x] = new Color32(r, g, b, 255);
                }
            t.SetPixels32(px);
            t.Apply(true, true);
            return t;
        }

        public static Texture2D CeilingPanels()
        {
            const int S = 256;
            var t = Make(S, "ceiling");
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    bool frame = x % 128 < 3 || y % 128 < 3;
                    float v = frame ? 0.78f : 0.93f + (Hash(x, y) - 0.5f) * 0.03f;
                    byte c = (byte)(v * 255);
                    px[y * S + x] = new Color32(c, c, c, 255);
                }
            t.SetPixels32(px);
            t.Apply(true, true);
            return t;
        }

        /** Gondol arka paneli: delikli metal (5 cm aralık). */
        public static Texture2D Pegboard()
        {
            const int S = 128;
            var t = Make(S, "pegboard");
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    int cx = x % 32 - 16, cy = y % 32 - 16;
                    bool hole = cx * cx + cy * cy < 12;
                    byte c = hole ? (byte)70 : (byte)(232 + (int)((Hash(x, y) - 0.5f) * 8));
                    px[y * S + x] = new Color32(c, c, (byte)Mathf.Min(255, c + 3), 255);
                }
            t.SetPixels32(px);
            t.Apply(true, true);
            return t;
        }
    }
}
