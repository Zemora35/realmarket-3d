using System;
using System.Collections.Generic;

namespace RealMarket.Core
{
    public struct PackItem { public string Key; public float W; public float H; public float D; }

    public struct PackedItem
    {
        public string Key;
        /** Sepet-yerel taban merkezi: x genişlik, z uzunluk, y taban üstü */
        public float X; public float Y; public float Z;
        public bool Lying; public bool Overflow;
    }

    /**
     * Alışveriş arabası sepeti için çakışmasız katmanlı yerleşim (packages/shopping cart-packing.ts).
     * Ürünler ekleme sırasıyla yerleşir; yeni ürün öncekileri oynatmaz → fiziksel kararsızlık yok.
     */
    public static class CartPacking
    {
        public const float BasketWidth = 0.5f, BasketLength = 0.78f, BasketHeight = 0.42f;

        public static List<PackedItem> Pack(IList<PackItem> items, out float volumeRatio)
        {
            var output = new List<PackedItem>();
            float x = 0, z = 0, y = 0, rowDepth = 0, layerHeight = 0, volume = 0;
            foreach (var it in items)
            {
                volume += it.W * it.H * it.D;
                float w = it.W, h = it.H, d = it.D;
                bool lying = false;
                if (h > BasketHeight * 0.85f && h <= BasketLength)
                {
                    lying = true;
                    float t = w; w = h; h = t;
                }
                if (x + w > BasketWidth + 1e-6f) { x = 0; z += rowDepth; rowDepth = 0; }
                if (z + d > BasketLength + 1e-6f) { x = 0; z = 0; y += layerHeight; layerHeight = 0; rowDepth = 0; }
                output.Add(new PackedItem
                {
                    Key = it.Key,
                    X = -BasketWidth / 2 + x + w / 2,
                    Y = y,
                    Z = -BasketLength / 2 + z + d / 2,
                    Lying = lying,
                    Overflow = y + h > BasketHeight + 0.05f,
                });
                x += w;
                rowDepth = Math.Max(rowDepth, d);
                layerHeight = Math.Max(layerHeight, h);
            }
            volumeRatio = volume / (BasketWidth * BasketLength * BasketHeight);
            return output;
        }
    }
}
