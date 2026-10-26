using System.Collections.Generic;
using RealMarket.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace RealMarket.Runtime
{
    public class ProductInfo
    {
        public ProductDto Dto;
        /** Gerçek boyut (m): x genişlik, y yükseklik, z derinlik */
        public Vector3 Size;
        public Color Primary, Secondary, Accent;
        /** Kodla üretilmiş yedek modeller: [0] inceleme, [1] yakın, [2] orta, [3] uzak */
        public readonly ModelLod[] Fallback = new ModelLod[4];
    }

    /**
     * Ürün kataloğu ve raf ürünlerinin çizimi. Binlerce ürün birimi GameObject olmadan
     * Graphics.RenderMeshInstanced ile çizilir: raf modülü başına önceden hazırlanmış matrisler,
     * görüş konisi + mesafe ayıklaması ve raf başına LOD seçimi (histerezisli).
     * GLB modeli gelmişse o, gelmemişse yedek geometri kullanılır.
     */
    public class ProductManager : MonoBehaviour
    {
        public readonly Dictionary<string, ProductInfo> Products = new Dictionary<string, ProductInfo>();
        public readonly Dictionary<string, ProductInfo> ByStoreProduct = new Dictionary<string, ProductInfo>();
        public int DrawnInstances { get; private set; }
        public int DrawCalls { get; private set; }
        public bool CastShadows = true;

        MaterialLibrary library;
        AssetStreamingManager streaming;
        UnitIndex index;
        QualityProfile profile = QualityProfile.For(QualityTier.High);
        readonly List<ShelfBatch> batches = new List<ShelfBatch>();
        readonly Dictionary<string, List<Matrix4x4>>[] frame = { null, new Dictionary<string, List<Matrix4x4>>(), new Dictionary<string, List<Matrix4x4>>(), new Dictionary<string, List<Matrix4x4>>() };
        readonly Plane[] planes = new Plane[6];
        readonly List<Matrix4x4> scratch = new List<Matrix4x4>(1024);
        const int MaxPerCall = 511;

        class ShelfBatch
        {
            public Bounds Bounds;
            public readonly Dictionary<string, List<int>> Units = new Dictionary<string, List<int>>();
            public readonly Dictionary<string, Matrix4x4[]> Matrices = new Dictionary<string, Matrix4x4[]>();
            public readonly Dictionary<string, int> Lod = new Dictionary<string, int>();
            public bool Dirty = true;
        }

        readonly Dictionary<string, ShelfBatch> byShelf = new Dictionary<string, ShelfBatch>();

        public void Init(MaterialLibrary library, AssetStreamingManager streaming)
        {
            this.library = library;
            this.streaming = streaming;
        }

        public void SetProfile(QualityProfile p) { profile = p; CastShadows = p.Shadows && p.Tier >= QualityTier.High; }

        public void Build(SceneDataDto scene, UnitIndex unitIndex)
        {
            index = unitIndex;
            Products.Clear(); ByStoreProduct.Clear(); batches.Clear(); byShelf.Clear();
            foreach (var p in scene.Products)
            {
                var d = p.Dimensions ?? new DimensionsDto { WidthMm = 80, HeightMm = 200, DepthMm = 80 };
                var info = new ProductInfo
                {
                    Dto = p,
                    Size = new Vector3(d.WidthMm, d.HeightMm, d.DepthMm) / 1000f,
                    Primary = MaterialLibrary.Hex(p.Appearance?.BodyColor ?? p.Appearance?.PrimaryColor, new Color(0.8f, 0.8f, 0.8f)),
                    Secondary = MaterialLibrary.Hex(p.Appearance?.SecondaryColor, Color.white),
                    Accent = MaterialLibrary.Hex(p.Appearance?.CapColor ?? p.Appearance?.AccentColor, Color.gray),
                };
                for (int lod = 0; lod < 4; lod++) info.Fallback[lod] = FallbackModels.Build(info, lod, library);
                Products[p.Id] = info;
                if (!string.IsNullOrEmpty(p.StoreProductId)) ByStoreProduct[p.StoreProductId] = info;
            }
            foreach (var u in index.Units)
            {
                if (!byShelf.TryGetValue(u.ShelfId, out var b))
                {
                    b = new ShelfBatch { Bounds = new Bounds(ShelfManager.ToUnity(u.Position), Vector3.zero) };
                    byShelf[u.ShelfId] = b;
                    batches.Add(b);
                }
                b.Bounds.Encapsulate(new Bounds(ShelfManager.ToUnity(u.Position) + new Vector3(0, u.Half.Y, 0), ShelfManager.ToUnity(u.Half) * 2f));
                if (!b.Units.TryGetValue(u.ProductId, out var list)) b.Units[u.ProductId] = list = new List<int>();
                list.Add(u.Index);
            }
        }

        public void MarkDirty(string shelfId)
        {
            if (shelfId != null && byShelf.TryGetValue(shelfId, out var b)) b.Dirty = true;
        }

        public void MarkAllDirty() { foreach (var b in batches) b.Dirty = true; }

        void Rebuild(ShelfBatch b)
        {
            b.Matrices.Clear();
            foreach (var kv in b.Units)
            {
                var list = new List<Matrix4x4>(kv.Value.Count);
                foreach (int i in kv.Value)
                {
                    var u = index.Units[i];
                    if (u.Taken) continue;
                    list.Add(Matrix4x4.TRS(ShelfManager.ToUnity(u.Position), Quaternion.Euler(0, u.YawDeg, 0), Vector3.one));
                }
                b.Matrices[kv.Key] = list.ToArray();
            }
            b.Dirty = false;
        }

        public ModelLod ModelFor(ProductInfo p, int lod)
        {
            var m = streaming != null ? streaming.Get(p.Dto.Id, lod) : null;
            return m ?? p.Fallback[Mathf.Clamp(lod, 0, 3)];
        }

        void LateUpdate()
        {
            var cam = Camera.main;
            if (cam == null || index == null) return;
            GeometryUtility.CalculateFrustumPlanes(cam, planes);
            Vector3 eye = cam.transform.position;
            float maxD = profile.MaxProductDistance;
            for (int l = 1; l <= 3; l++) foreach (var list in frame[l].Values) list.Clear();

            foreach (var b in batches)
            {
                float dist = Mathf.Sqrt(b.Bounds.SqrDistance(eye));
                if (dist > maxD || !GeometryUtility.TestPlanesAABB(planes, b.Bounds)) continue;
                if (b.Dirty) Rebuild(b);
                foreach (var kv in b.Matrices)
                {
                    if (kv.Value.Length == 0 || !Products.TryGetValue(kv.Key, out var p)) continue;
                    float size = Mathf.Max(p.Size.x, Mathf.Max(p.Size.y, p.Size.z));
                    int prev = b.Lod.TryGetValue(kv.Key, out var pl) ? pl : 2;
                    int lod = LodSelector.Select(dist, size, prev, profile.LodMid, profile.LodFar, profile.LodHysteresis);
                    b.Lod[kv.Key] = lod;
                    if (streaming != null && streaming.HasModel(kv.Key)) streaming.Request(kv.Key, lod, dist);
                    if (!frame[lod].TryGetValue(kv.Key, out var target)) frame[lod][kv.Key] = target = new List<Matrix4x4>();
                    target.AddRange(kv.Value);
                }
            }

            int drawn = 0, calls = 0;
            for (int lod = 1; lod <= 3; lod++)
            {
                foreach (var kv in frame[lod])
                {
                    if (kv.Value.Count == 0) continue;
                    var model = ModelFor(Products[kv.Key], lod);
                    var shadows = CastShadows && lod == 1 ? ShadowCastingMode.On : ShadowCastingMode.Off;
                    calls += DrawInstanced(model, kv.Value, shadows);
                    drawn += kv.Value.Count;
                }
            }
            DrawnInstances = drawn;
            DrawCalls = calls;
        }

        int DrawInstanced(ModelLod model, List<Matrix4x4> instances, ShadowCastingMode shadows)
        {
            int calls = 0;
            foreach (var part in model.Parts)
            {
                bool identity = part.Local == Matrix4x4.identity;
                List<Matrix4x4> data = instances;
                if (!identity)
                {
                    scratch.Clear();
                    foreach (var m in instances) scratch.Add(m * part.Local);
                    data = scratch;
                }
                for (int s = 0; s < part.Mesh.subMeshCount; s++)
                {
                    var mat = part.Materials[Mathf.Min(s, part.Materials.Length - 1)];
                    if (mat == null) continue;
                    var rp = new RenderParams(mat) { shadowCastingMode = shadows, receiveShadows = true, layer = 0 };
                    for (int start = 0; start < data.Count; start += MaxPerCall)
                    {
                        Graphics.RenderMeshInstanced(rp, part.Mesh, s, data, Mathf.Min(MaxPerCall, data.Count - start), start);
                        calls++;
                    }
                }
            }
            return calls;
        }

        /** Tek ürün çizimi (elde tutulan, sepetteki ürünler). */
        public void DrawSingle(ProductInfo p, int lod, Matrix4x4 m, bool shadows = false)
        {
            var model = ModelFor(p, lod);
            foreach (var part in model.Parts)
            {
                var mm = m * part.Local;
                for (int s = 0; s < part.Mesh.subMeshCount; s++)
                {
                    var mat = part.Materials[Mathf.Min(s, part.Materials.Length - 1)];
                    if (mat == null) continue;
                    var rp = new RenderParams(mat) { shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off, receiveShadows = true };
                    Graphics.RenderMesh(rp, part.Mesh, s, mm);
                }
            }
        }
    }

    /** GLB yokken kullanılan, ambalaj tipine göre kodla üretilen ürün geometrisi. */
    public static class FallbackModels
    {
        public static ModelLod Build(ProductInfo p, int lod, MaterialLibrary lib)
        {
            float w = p.Size.x, h = p.Size.y, d = p.Size.z;
            int seg = lod == 0 ? 28 : lod == 1 ? 16 : 8;
            var body = new MeshBuilder();
            var accent = new MeshBuilder();
            string t = p.Dto.PackagingType ?? "";
            float r = Mathf.Min(w, d) / 2f;
            if (lod == 3)
            {
                body.Box(new Vector3(0, h / 2f, 0), new Vector3(w, h, d));
            }
            else switch (t)
            {
                case "pet_bottle":
                case "glass_bottle":
                case "shampoo_bottle":
                    body.Cylinder(Vector3.zero, r, r, h * 0.62f, seg, false);
                    body.Cylinder(new Vector3(0, h * 0.62f, 0), r, r * 0.38f, h * 0.24f, seg, false);
                    body.Cylinder(Vector3.zero, r, r, 0.0001f, seg, true);
                    accent.Cylinder(new Vector3(0, h * 0.86f, 0), r * 0.4f, r * 0.4f, h * 0.14f, seg, true);
                    break;
                case "beverage_can":
                case "tin_can":
                case "yogurt_cup":
                case "jar":
                    body.Cylinder(Vector3.zero, t == "yogurt_cup" ? r * 0.8f : r, r, h * 0.9f, seg, true);
                    accent.Cylinder(new Vector3(0, h * 0.9f, 0), r * 0.96f, r * 0.96f, h * 0.1f, seg, true);
                    break;
                case "spray":
                    body.Cylinder(Vector3.zero, r, r, h * 0.78f, seg, true);
                    accent.Cylinder(new Vector3(0, h * 0.78f, 0), r * 0.85f, r * 0.6f, h * 0.22f, seg, true);
                    break;
                case "fruit":
                case "vegetable":
                    body.Cylinder(Vector3.zero, r * 0.45f, r, h * 0.35f, seg, true);
                    body.Cylinder(new Vector3(0, h * 0.35f, 0), r, r * 0.95f, h * 0.35f, seg, false);
                    body.Cylinder(new Vector3(0, h * 0.7f, 0), r * 0.95f, r * 0.35f, h * 0.28f, seg, true);
                    accent.Cylinder(new Vector3(0, h * 0.96f, 0), r * 0.06f, r * 0.04f, h * 0.06f, 4, true);
                    break;
                case "detergent_bottle":
                    body.Box(new Vector3(0, h * 0.42f, 0), new Vector3(w, h * 0.84f, d));
                    accent.Cylinder(new Vector3(w * 0.2f, h * 0.84f, 0), r * 0.5f, r * 0.5f, h * 0.16f, seg, true);
                    break;
                case "milk_carton":
                    body.Box(new Vector3(0, h * 0.42f, 0), new Vector3(w, h * 0.84f, d));
                    accent.Box(new Vector3(0, h * 0.92f, 0), new Vector3(w * 0.96f, h * 0.16f, d * 0.2f));
                    break;
                case "tube":
                    body.Box(new Vector3(0, h * 0.46f, 0), new Vector3(w, h * 0.92f, d * 0.7f));
                    accent.Cylinder(new Vector3(0, h * 0.92f, 0), d * 0.35f, d * 0.35f, h * 0.08f, seg, true);
                    break;
                default:
                    body.Box(new Vector3(0, h / 2f, 0), new Vector3(w, h, d));
                    if (t == "chips_bag" || t == "pouch" || t == "pasta_pack")
                        accent.Box(new Vector3(0, h * 0.96f, 0), new Vector3(w * 1.01f, h * 0.06f, d * 0.4f));
                    else
                        accent.Box(new Vector3(0, h * 0.5f, d / 2f + 0.0006f), new Vector3(w * 0.8f, h * 0.35f, 0.001f));
                    break;
            }
            float smooth = t == "beverage_can" || t == "glass_bottle" || t == "pet_bottle" ? 0.8f : 0.45f;
            float metal = t == "beverage_can" || t == "tin_can" || t == "spray" ? 0.8f : 0f;
            var model = new ModelLod();
            model.Parts.Add(new ModelPart { Mesh = body.ToMesh($"{p.Dto.Id}-l{lod}-b"), Materials = new[] { lib.Solid(p.Primary, smooth, metal, true) }, Local = Matrix4x4.identity });
            if (!accent.IsEmpty)
                model.Parts.Add(new ModelPart { Mesh = accent.ToMesh($"{p.Dto.Id}-l{lod}-a"), Materials = new[] { lib.Solid(p.Accent, 0.4f, 0f, true) }, Local = Matrix4x4.identity });
            model.Bounds = new Bounds(new Vector3(0, h / 2f, 0), p.Size);
            return model;
        }
    }
}
