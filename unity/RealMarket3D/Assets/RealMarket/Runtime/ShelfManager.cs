using System.Collections.Generic;
using RealMarket.Core;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Raf modülleri ve üzerindeki fiziksel birimler (UnitIndex). Birim alma/geri koyma,
     * nişangâh ışını ile birim seçimi ve raf etiketlerinin (fiyat) yakınlığa göre görünürlüğü.
     */
    public class ShelfManager : MonoBehaviour
    {
        public readonly UnitIndex Index = new UnitIndex();
        public readonly Dictionary<string, ShelfDto> Shelves = new Dictionary<string, ShelfDto>();
        public float TagVisibleDistance = 7f;

        ProductManager products;
        readonly List<(TextMesh tag, Vector3 pos)> tags = new List<(TextMesh, Vector3)>();
        Transform tagRoot;
        float nextTagCheck;

        /** 1. adım: raf modülleri + birim dizini (ProductManager bu dizinle kurulur). */
        public void Build(SceneDataDto scene)
        {
            Shelves.Clear();
            foreach (var s in scene.Layout.Shelves) Shelves[s.Id] = s;
            Index.Build(scene);
        }

        /** 2. adım: ürün kataloğu hazır olduktan sonra fiyat etiketleri. */
        public void BuildTags(SceneDataDto scene, ProductManager productManager)
        {
            products = productManager;
            if (tagRoot != null) Destroy(tagRoot.gameObject);
            tagRoot = new GameObject("PriceTags").transform;
            tags.Clear();
            foreach (var slot in scene.Slots)
            {
                if (!Shelves.TryGetValue(slot.ShelfId, out var shelf) || !products.Products.TryGetValue(slot.ProductId, out var p)) continue;
                if (shelf.Kind == "produce_table" && slot.LevelIndex > 0) continue;
                float slotW = (slot.Facings * (slot.UnitWidthMm + PlanogramMath.FacingGapMm)) / 1000f;
                float lx = -shelf.WidthM / 2f + slot.XMm / 1000f + slotW / 2f;
                float lz = shelf.DepthM / 2f + 0.014f;
                PlanogramMath.LocalToWorld(shelf.Position, shelf.RotationY, lx, lz, out float wx, out float wz);
                var rot = Quaternion.Euler(0, PlanogramMath.YawDegrees(shelf.RotationY), 0);
                float y = slot.YMm / 1000f - 0.025f;
                if (y < 0.08f) y = 0.08f;
                var pos = new Vector3(wx, y, wz);
                bool promo = p.Dto.Promotion != null;
                var tm = MarketGenerator.Label(Money.FormatTl(p.Dto.PriceKurus), pos, rot, 0.017f,
                    promo ? Color.white : new Color(0.1f, 0.1f, 0.12f), promo ? new Color(0.86f, 0.12f, 0.16f) : new Color(1f, 0.93f, 0.2f), 0.115f, 0.032f, tagRoot);
                tm.gameObject.SetActive(false);
                tags.Add((tm, pos));
            }
        }

        void Update()
        {
            if (forceTags || Time.time < nextTagCheck || Camera.main == null) return;
            nextTagCheck = Time.time + 0.3f;
            Vector3 eye = Camera.main.transform.position;
            float max2 = TagVisibleDistance * TagVisibleDistance;
            int active = 0;
            foreach (var (tag, pos) in tags)
            {
                bool on = TagsEnabled && (pos - eye).sqrMagnitude < max2;
                if (tag.gameObject.activeSelf != on) tag.gameObject.SetActive(on);
                if (on) active++;
            }
            ActiveTags = active;
        }

        bool forceTags;
        /** Tanılama (DEBUG_TOGGLE): fiyat etiketlerini tamamen kapatır. */
        public bool TagsEnabled = true;
        public int ActiveTags { get; private set; }

        /** Isınma turu: tüm etiketleri geçici olarak açar (yazı gölgelendiricisi önceden derlensin). */
        public void ShowAllTags(bool on)
        {
            forceTags = on;
            foreach (var (tag, _) in tags) tag.gameObject.SetActive(on);
            nextTagCheck = 0f;
        }

        public ShelfUnit Unit(int i) => i >= 0 && i < Index.Units.Count ? Index.Units[i] : null;

        /** Nişangâh: kameradan ileri ışın, rafın arkasındaki birimler hariç. */
        public int Pick(Camera cam, float reach)
        {
            var o = cam.transform.position;
            var d = cam.transform.forward;
            int hit = Index.Raycast(new System.Numerics.Vector3(o.x, o.y, o.z), new System.Numerics.Vector3(d.x, d.y, d.z), reach, out float dist);
            if (hit < 0) return -1;
            var u = Index.Units[hit];
            if (UnitIndex.BehindShelf(u, o.x, o.z)) return -1;
            // duvar/demirbaş arkasında mı? (raf gövdeleri ürünleri kapsadığından yalnızca daha yakın, başka raflara ait çarpışmalar engeller)
            if (Physics.Raycast(o, d, out var phys, dist - 0.05f) && phys.collider.name.StartsWith("Wall")) return -1;
            return hit;
        }

        public void SetTaken(int unit, bool taken)
        {
            var u = Unit(unit);
            if (u == null || u.Taken == taken) return;
            u.Taken = taken;
            products.MarkDirty(u.ShelfId);
        }

        public static Vector3 ToUnity(System.Numerics.Vector3 v) => new Vector3(v.X, v.Y, v.Z);
    }
}
