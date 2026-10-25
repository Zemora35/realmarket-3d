using System;
using System.Collections.Generic;
using System.Numerics;

namespace RealMarket.Core
{
    /** Raftaki tek bir fiziksel ürün birimi. */
    public class ShelfUnit
    {
        public int Index;
        public string ProductId; public string StoreProductId; public string SlotId; public string ShelfId; public string Department;
        /** Taban merkezi (dünya) */
        public Vector3 Position;
        /** Dünya eksenlerinde yarı boyutlar */
        public Vector3 Half;
        /** Unity y dönüşü (derece) — küçük kontrollü sapma dahil */
        public float YawDeg;
        public bool Taken;
        /** Pişirilmiş ortam örtmesi (0–1) */
        public float Ao = 1f;
        /** En büyük boyut (m) — LOD ölçütü */
        public float Size;
        /** Arka paneli olan raflarda ön normal (örtme testi) */
        public bool Occludable; public float NormalX; public float NormalZ; public float PlaneX; public float PlaneZ;
    }

    /**
     * Sahnedeki tüm raf birimleri + uzamsal ızgara. Nişangâh seçimi için ışın–AABB testi
     * (Unity collider gerektirmez → binlerce ürün için fizik maliyeti yok).
     */
    public class UnitIndex
    {
        public const float Cell = 0.5f;
        public const int MaxDepthRows = 2;
        public readonly List<ShelfUnit> Units = new List<ShelfUnit>();
        public readonly Dictionary<string, List<int>> ByProduct = new Dictionary<string, List<int>>();
        readonly Dictionary<long, List<int>> grid = new Dictionary<long, List<int>>();

        static long Key(int cx, int cz) => ((long)cx << 32) ^ (uint)cz;

        static float Hash01(float n)
        {
            double x = Math.Sin(n * 12.9898 + 78.233) * 43758.5453;
            return (float)(x - Math.Floor(x));
        }

        public void Build(SceneDataDto scene)
        {
            Units.Clear();
            ByProduct.Clear();
            grid.Clear();
            var shelves = new Dictionary<string, ShelfDto>();
            foreach (var s in scene.Layout.Shelves) shelves[s.Id] = s;
            var products = new Dictionary<string, ProductDto>();
            foreach (var p in scene.Products) products[p.Id] = p;

            foreach (var slot in scene.Slots)
            {
                if (!shelves.TryGetValue(slot.ShelfId, out var shelf) || !products.TryGetValue(slot.ProductId, out var product)) continue;
                int rowSize = slot.Facings * slot.StackCount;
                var local = PlanogramMath.ExpandSlotUnits(slot, shelf.WidthM, shelf.DepthM, MaxDepthRows);
                int take = Math.Min(slot.VisibleUnits, Math.Min(local.Count, rowSize * MaxDepthRows));
                bool produce = product.PackagingType == "fruit" || product.PackagingType == "vegetable";
                bool occludable = shelf.Kind != "produce_table" && shelf.Kind != "promo_stand";
                float s0 = (float)Math.Sin(shelf.RotationY);
                bool swap = Math.Abs(s0) > 0.5f;
                float hw = slot.UnitWidthMm / 2000f, hh = slot.UnitHeightMm / 2000f, hd = slot.UnitDepthMm / 2000f;
                ShelfLevelDto level = shelf.Levels.Find(l => l.Index == slot.LevelIndex);
                float topGap = level != null ? level.ClearanceM - slot.UnitHeightMm / 1000f * slot.StackCount : 1f;
                PlanogramMath.FrontNormal(shelf.RotationY, out float nx, out float nz);
                for (int k = 0; k < take; k++)
                {
                    var u = local[k];
                    float seed = Units.Count * 7.13f + k;
                    // kontrollü çeşitlilik (three.js sürümüyle aynı): birkaç mm, birkaç derece
                    float jx = (Hash01(seed) - 0.5f) * (produce ? 0.012f : 0.004f);
                    float jz = -Hash01(seed + 1) * (produce ? 0.01f : 0.005f);
                    PlanogramMath.LocalToWorld(shelf.Position, shelf.RotationY, u.X + jx, u.Z + jz, out float wx, out float wz);
                    float ao = u.Row >= 1 ? 0.8f : 1f;
                    if (slot.LevelIndex == 0 && shelf.Kind == "gondola") ao *= 0.92f;
                    if (u.Stack < slot.StackCount - 1) ao *= 0.94f;
                    if (u.Stack == slot.StackCount - 1 && topGap < 0.05f) ao *= 0.9f;
                    var unit = new ShelfUnit
                    {
                        Index = Units.Count,
                        ProductId = product.Id,
                        StoreProductId = product.StoreProductId,
                        SlotId = slot.SlotId,
                        ShelfId = shelf.Id,
                        Department = shelf.DepartmentCode,
                        Position = new Vector3(wx, u.Y, wz),
                        Half = new Vector3(swap ? hd : hw, hh, swap ? hw : hd),
                        YawDeg = PlanogramMath.YawDegrees(shelf.RotationY) + (produce ? Hash01(seed + 3) * 360f : (Hash01(seed + 2) - 0.5f) * 4f),
                        Ao = ao,
                        Size = Math.Max(slot.UnitWidthMm, Math.Max(slot.UnitHeightMm, slot.UnitDepthMm)) / 1000f,
                        Occludable = occludable,
                        NormalX = nx,
                        NormalZ = nz,
                        PlaneX = shelf.Position.X - shelf.DepthM / 2f * nx,
                        PlaneZ = shelf.Position.Z - shelf.DepthM / 2f * nz,
                    };
                    Units.Add(unit);
                    if (!ByProduct.TryGetValue(product.Id, out var list)) ByProduct[product.Id] = list = new List<int>();
                    list.Add(unit.Index);
                    int x0 = (int)Math.Floor((wx - unit.Half.X) / Cell), x1 = (int)Math.Floor((wx + unit.Half.X) / Cell);
                    int z0 = (int)Math.Floor((wz - unit.Half.Z) / Cell), z1 = (int)Math.Floor((wz + unit.Half.Z) / Cell);
                    for (int cx = x0; cx <= x1; cx++)
                        for (int cz = z0; cz <= z1; cz++)
                        {
                            long key = Key(cx, cz);
                            if (!grid.TryGetValue(key, out var cell)) grid[key] = cell = new List<int>();
                            cell.Add(unit.Index);
                        }
                }
            }
        }

        public int ShelfCount(string productId)
        {
            if (!ByProduct.TryGetValue(productId, out var list)) return 0;
            int n = 0;
            foreach (int i in list) if (!Units[i].Taken) n++;
            return n;
        }

        /** Kameranın rafın arka panelinin arkasında kalıp kalmadığı (ucuz örtme). */
        public static bool BehindShelf(ShelfUnit u, float camX, float camZ) =>
            u.Occludable && (camX - u.PlaneX) * u.NormalX + (camZ - u.PlaneZ) * u.NormalZ < -0.05f;

        /** Işın boyunca en yakın alınmamış birim; yoksa −1. */
        public int Raycast(Vector3 origin, Vector3 dir, float maxDist, out float hitDist)
        {
            hitDist = float.MaxValue;
            int best = -1;
            var seen = new HashSet<int>();
            int steps = (int)Math.Ceiling(maxDist / 0.1f);
            for (int i = 0; i <= steps; i++)
            {
                float t = i / (float)steps * maxDist;
                float x = origin.X + dir.X * t, z = origin.Z + dir.Z * t;
                if (!grid.TryGetValue(Key((int)Math.Floor(x / Cell), (int)Math.Floor(z / Cell)), out var list)) continue;
                foreach (int idx in list)
                {
                    if (!seen.Add(idx)) continue;
                    var u = Units[idx];
                    if (u.Taken) continue;
                    var min = new Vector3(u.Position.X - u.Half.X, u.Position.Y, u.Position.Z - u.Half.Z);
                    var max = new Vector3(u.Position.X + u.Half.X, u.Position.Y + u.Half.Y * 2f, u.Position.Z + u.Half.Z);
                    if (RayAabb(origin, dir, min, max, out float d) && d <= maxDist && d < hitDist)
                    {
                        hitDist = d;
                        best = idx;
                    }
                }
                if (best >= 0 && hitDist < t - Cell) break;
            }
            return best;
        }

        public static bool RayAabb(Vector3 o, Vector3 d, Vector3 min, Vector3 max, out float tHit)
        {
            float tmin = 0f, tmax = float.MaxValue;
            tHit = 0f;
            for (int a = 0; a < 3; a++)
            {
                float oo = a == 0 ? o.X : a == 1 ? o.Y : o.Z;
                float dd = a == 0 ? d.X : a == 1 ? d.Y : d.Z;
                float mn = a == 0 ? min.X : a == 1 ? min.Y : min.Z;
                float mx = a == 0 ? max.X : a == 1 ? max.Y : max.Z;
                if (Math.Abs(dd) < 1e-9f)
                {
                    if (oo < mn || oo > mx) return false;
                }
                else
                {
                    float t1 = (mn - oo) / dd, t2 = (mx - oo) / dd;
                    if (t1 > t2) { float tmp = t1; t1 = t2; t2 = tmp; }
                    tmin = Math.Max(tmin, t1);
                    tmax = Math.Min(tmax, t2);
                    if (tmin > tmax) return false;
                }
            }
            tHit = tmin;
            return true;
        }
    }
}
