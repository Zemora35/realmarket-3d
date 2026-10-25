using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using GLTFast;
using RealMarket.Core;
using UnityEngine;

namespace RealMarket.Runtime
{
    /** Bir ürün modelinin tek bir LOD'u: parça başına mesh + malzemeler + kök-yerel matris. */
    public class ModelLod
    {
        public readonly List<ModelPart> Parts = new List<ModelPart>();
        public Bounds Bounds;
        public int Triangles;
    }

    public class ModelPart
    {
        public Mesh Mesh; public Material[] Materials; public Matrix4x4 Local;
    }

    /**
     * Ürün GLB modellerini (asset pipeline: storage/models/{productId}/lod*.glb) öncelik sırasıyla
     * akıtır. Aynı anda en fazla MaxConcurrent indirme; yakındaki ürünler önce. Model gelene
     * kadar ProductManager kodla üretilmiş yedek geometriyi çizer — sahne hiçbir zaman beklemez.
     */
    public class AssetStreamingManager : MonoBehaviour
    {
        public int MaxConcurrent = 3;
        public bool Enabled = true;
        public int Loaded { get; private set; }
        public int Failed { get; private set; }
        public int Pending => queue.Count + active;

        APIClient api;
        MaterialLibrary library;
        ModelManifestDto manifest;
        Transform hiddenRoot;
        int active;
        readonly List<Request> queue = new List<Request>();
        readonly Dictionary<string, ModelLod> cache = new Dictionary<string, ModelLod>();
        readonly HashSet<string> requested = new HashSet<string>();
        readonly List<GltfImport> imports = new List<GltfImport>();

        struct Request { public string Key; public string Url; public float Priority; public Action<ModelLod> Done; }

        public event Action<string, int, ModelLod> ModelReady; // productId, lod, model

        public void Init(APIClient api, MaterialLibrary library)
        {
            this.api = api;
            this.library = library;
            var go = new GameObject("StreamedModels");
            go.SetActive(false);
            go.transform.SetParent(transform, false);
            hiddenRoot = go.transform;
        }

        public async Task LoadManifest()
        {
            try
            {
                manifest = await api.GetModelManifest();
                Debug.Log($"[RealMarket] model bildirimi: {manifest?.Products?.Count ?? 0} ürün");
            }
            catch (Exception e)
            {
                manifest = null;
                Debug.LogWarning("[RealMarket] model bildirimi alınamadı, yedek geometri kullanılacak: " + e.Message);
            }
        }

        public bool HasModel(string productId) => manifest != null && manifest.Products != null && manifest.Products.ContainsKey(productId);

        string UrlFor(string productId, int lod)
        {
            if (!HasModel(productId)) return null;
            string rel = manifest.Products[productId].PathFor(lod);
            return string.IsNullOrEmpty(rel) ? null : api.Url(rel.StartsWith("/") ? rel : "/api/models/" + rel);
        }

        public ModelLod Get(string productId, int lod) => cache.TryGetValue(productId + "#" + lod, out var m) ? m : null;

        /** priority: küçük = önce (ör. mesafe). */
        public void Request(string productId, int lod, float priority)
        {
            if (!Enabled) return;
            string key = productId + "#" + lod;
            if (cache.ContainsKey(key)) return;
            if (requested.Contains(key))
            {
                for (int i = 0; i < queue.Count; i++)
                    if (queue[i].Key == key && priority < queue[i].Priority) { var r = queue[i]; r.Priority = priority; queue[i] = r; }
                return;
            }
            string url = UrlFor(productId, lod);
            if (url == null) return;
            requested.Add(key);
            int lodCopy = lod;
            queue.Add(new Request { Key = key, Url = url, Priority = priority, Done = m => ModelReady?.Invoke(productId, lodCopy, m) });
        }

        void Update()
        {
            while (active < MaxConcurrent && queue.Count > 0)
            {
                int best = 0;
                for (int i = 1; i < queue.Count; i++) if (queue[i].Priority < queue[best].Priority) best = i;
                var r = queue[best];
                queue.RemoveAt(best);
                _ = Load(r);
            }
        }

        async Task Load(Request r)
        {
            active++;
            try
            {
                var gltf = new GltfImport(null, null, new UrpMaterialGenerator(library), null);
                bool ok = await gltf.Load(r.Url);
                if (!ok) throw new Exception("GLB okunamadı");
                var holder = new GameObject(r.Key);
                holder.transform.SetParent(hiddenRoot, false);
                ok = await gltf.InstantiateMainSceneAsync(holder.transform);
                if (!ok) throw new Exception("GLB sahnesi oluşturulamadı");
                imports.Add(gltf);
                var model = Extract(holder.transform);
                cache[r.Key] = model;
                Loaded++;
                r.Done?.Invoke(model);
            }
            catch (Exception e)
            {
                Failed++;
                Debug.LogWarning($"[RealMarket] model yüklenemedi {r.Url}: {e.Message}");
            }
            finally { active--; }
        }

        static ModelLod Extract(Transform root)
        {
            var lod = new ModelLod();
            bool first = true;
            Matrix4x4 toRoot = root.worldToLocalMatrix;
            foreach (var mf in root.GetComponentsInChildren<MeshFilter>(true))
            {
                var mr = mf.GetComponent<MeshRenderer>();
                if (mf.sharedMesh == null || mr == null) continue;
                foreach (var m in mr.sharedMaterials) if (m != null) m.enableInstancing = true;
                var part = new ModelPart { Mesh = mf.sharedMesh, Materials = mr.sharedMaterials, Local = toRoot * mf.transform.localToWorldMatrix };
                lod.Parts.Add(part);
                for (int s = 0; s < part.Mesh.subMeshCount; s++) lod.Triangles += (int)(part.Mesh.GetIndexCount(s) / 3);
                var b = TransformBounds(part.Mesh.bounds, part.Local);
                if (first) { lod.Bounds = b; first = false; } else lod.Bounds.Encapsulate(b);
            }
            return lod;
        }

        static Bounds TransformBounds(Bounds b, Matrix4x4 m)
        {
            var c = m.MultiplyPoint3x4(b.center);
            var e = b.extents;
            var ax = m.MultiplyVector(new Vector3(e.x, 0, 0));
            var ay = m.MultiplyVector(new Vector3(0, e.y, 0));
            var az = m.MultiplyVector(new Vector3(0, 0, e.z));
            var ext = new Vector3(
                Mathf.Abs(ax.x) + Mathf.Abs(ay.x) + Mathf.Abs(az.x),
                Mathf.Abs(ax.y) + Mathf.Abs(ay.y) + Mathf.Abs(az.y),
                Mathf.Abs(ax.z) + Mathf.Abs(ay.z) + Mathf.Abs(az.z));
            return new Bounds(c, ext * 2f);
        }

        void OnDestroy()
        {
            foreach (var g in imports) g.Dispose();
            imports.Clear();
        }
    }
}
