using System;
using System.Collections.Generic;

namespace RealMarket.Core
{
    /** Raf-yerel birim konumu (metre) ve derinlik sırası. */
    public struct LocalUnit
    {
        public float X; public float Y; public float Z; public int Row; public int Stack;
    }

    /**
     * Planogram yuvalarını tek tek ürün birimlerine açar ve raf-yerel koordinatı dünyaya çevirir.
     * Koordinatlar: mağaza x ∈ [0,W], z ∈ [0,L], y yukarı (API ile aynı sayılar).
     *
     * El yönü: API (three.js) sağ elli, Unity sol elli. Aynı x/z sayıları kullanıldığında mağaza
     * yatay aynalanır (geçerli bir mağaza olarak kalır). Ancak raf önüne bakan müşteriye göre
     * planogramın soldan sağa sırası korunmalıdır; bu yüzden raf-yerel x işareti çevrilir.
     */
    public static class PlanogramMath
    {
        public const float FacingGapMm = 2f;

        /** packages/planogram/src/placement.ts expandSlotUnits ile aynı sıra: ön sıra → soldan sağa → istif. */
        public static List<LocalUnit> ExpandSlotUnits(SlotDto slot, float fixtureWidthM, float fixtureDepthM, int maxRows = int.MaxValue)
        {
            var list = new List<LocalUnit>();
            float w = slot.UnitWidthMm / 1000f;
            float h = slot.UnitHeightMm / 1000f;
            float d = slot.UnitDepthMm / 1000f;
            float gap = FacingGapMm / 1000f;
            float left = -fixtureWidthM / 2f + slot.XMm / 1000f;
            float front = fixtureDepthM / 2f - slot.ZMm / 1000f - 0.012f;
            int rows = Math.Min(slot.DepthCount, maxRows);
            for (int dz = 0; dz < rows; dz++)
                for (int f = 0; f < slot.Facings; f++)
                    for (int s = 0; s < slot.StackCount; s++)
                        list.Add(new LocalUnit
                        {
                            X = left + f * (w + gap) + w / 2f,
                            Y = slot.YMm / 1000f + s * h,
                            Z = front - dz * d - d / 2f,
                            Row = dz,
                            Stack = s,
                        });
            return list;
        }

        /**
         * Raf-yerel (x: müşterinin solundan sağına, z: ön yüz) → dünya (Unity).
         * Unity'de raf önüne bakan müşterinin sağı yerel −x olduğundan x çevrilir.
         */
        public static void LocalToWorld(Vec2Dto origin, float rotationY, float lx, float lz, out float wx, out float wz)
        {
            float c = (float)Math.Cos(rotationY);
            float s = (float)Math.Sin(rotationY);
            float mx = -lx;
            wx = origin.X + mx * c + lz * s;
            wz = origin.Z - mx * s + lz * c;
        }

        /** Rafın ön yüz normali (dünya). */
        public static void FrontNormal(float rotationY, out float nx, out float nz)
        {
            nx = (float)Math.Sin(rotationY);
            nz = (float)Math.Cos(rotationY);
        }

        /** Unity Euler y açısı (derece): yerel +z ön yüz, API dönüşüyle aynı yön. */
        public static float YawDegrees(float rotationY) => rotationY * 180f / (float)Math.PI;
    }
}
