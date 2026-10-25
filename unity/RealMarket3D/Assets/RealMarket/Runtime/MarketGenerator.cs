using System.Collections.Generic;
using RealMarket.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace RealMarket.Runtime
{
    /**
     * API'den gelen yerleşimden (layout) mağaza binasını ve demirbaşları kodla kurar:
     * zemin, duvarlar, tavan + ışık panelleri, gondol/soğutucu/tezgâh raf modülleri, kasalar,
     * tabelalar ve çarpışma kutuları. Aynı malzemeli parçalar 8 m'lik hücrelerde tek meshte
     * birleştirilir (az çizim çağrısı, hücre bazında görüş konisi ayıklaması korunur).
     */
    public class MarketGenerator : MonoBehaviour
    {
        public const string ColliderLayerName = "Default";
        const float Chunk = 8f;

        MaterialLibrary lib;
        Transform root;
        readonly Dictionary<(Material, int, int), MeshBuilder> builders = new Dictionary<(Material, int, int), MeshBuilder>();
        public readonly List<BoxCollider> Colliders = new List<BoxCollider>();
        public Light Sun { get; private set; }
        public float Width { get; private set; }
        public float Length { get; private set; }

        Material steel, steelDark, panel, pegboard, wood, white, rail, floorMat, ceilingMat, wallMat, glass, glow, belt, rubber;

        public void Init(MaterialLibrary library) { lib = library; }

        public Transform Generate(SceneDataDto scene)
        {
            if (root != null) Destroy(root.gameObject);
            builders.Clear();
            Colliders.Clear();
            root = new GameObject("Store").transform;
            var L = scene.Layout;
            Width = L.Params.WidthM;
            Length = L.Params.LengthM;
            float H = L.Params.CeilingHeightM;
            CreateMaterials();

            // zemin + tavan
            var floor = new MeshBuilder().Box(new Vector3(Width / 2, -0.05f, Length / 2), new Vector3(Width + 2, 0.1f, Length + 2), Quaternion.identity, 1.2f);
            Spawn("Floor", floor.ToMesh("floor"), floorMat, shadows: false);
            AddCollider("FloorCol", new Vector3(Width / 2, -0.05f, Length / 2), new Vector3(Width + 2, 0.1f, Length + 2), 0);
            var ceil = new MeshBuilder().Box(new Vector3(Width / 2, H + 0.05f, Length / 2), new Vector3(Width + 2, 0.1f, Length + 2), Quaternion.identity, 1.2f);
            Spawn("Ceiling", ceil.ToMesh("ceiling"), ceilingMat, shadows: false);

            // tavan ışık panelleri (koridor ızgarası)
            for (float x = 2f; x < Width - 1f; x += 3f)
                for (float z = 2.5f; z < Length - 1f; z += 3.2f)
                    Add(glow, new Vector3(x, H - 0.01f, z)).Box(new Vector3(x, H - 0.012f, z), new Vector3(0.6f, 0.02f, 1.2f));

            foreach (var o in L.Objects) BuildObject(o, H);
            foreach (var s in L.Shelves) BuildShelf(s);

            foreach (var kv in builders)
            {
                if (kv.Value.IsEmpty) continue;
                bool shadows = kv.Key.Item1 != glow && kv.Key.Item1 != glass;
                Spawn($"{kv.Key.Item1.name}-{kv.Key.Item2}-{kv.Key.Item3}", kv.Value.ToMesh(kv.Key.Item1.name), kv.Key.Item1, shadows);
            }
            builders.Clear();
            SetupLighting(L, H);
            return root;
        }

        void CreateMaterials()
        {
            steel = lib.Solid(new Color(0.78f, 0.8f, 0.82f), 0.55f, 0.85f);
            steelDark = lib.Solid(new Color(0.28f, 0.3f, 0.33f), 0.45f, 0.7f);
            panel = lib.Solid(new Color(0.93f, 0.93f, 0.92f), 0.3f);
            pegboard = lib.Textured(ProceduralTextures.Pegboard(), Color.white, 0.35f, "pegboard");
            wood = lib.Solid(new Color(0.62f, 0.45f, 0.3f), 0.25f);
            white = lib.Solid(new Color(0.96f, 0.96f, 0.95f), 0.4f);
            rail = lib.Solid(new Color(0.95f, 0.95f, 0.96f), 0.6f);
            floorMat = lib.Textured(ProceduralTextures.FloorTiles(), Color.white, 0.55f, "floor");
            ceilingMat = lib.Textured(ProceduralTextures.CeilingPanels(), Color.white, 0.1f, "ceiling");
            wallMat = lib.Solid(new Color(0.9f, 0.89f, 0.86f), 0.15f);
            glass = lib.Glass(new Color(0.85f, 0.95f, 1f), 0.18f);
            glow = lib.Glow(new Color(1f, 0.97f, 0.92f), 2.2f);
            belt = lib.Solid(new Color(0.08f, 0.08f, 0.09f), 0.2f);
            rubber = lib.Solid(new Color(0.12f, 0.12f, 0.12f), 0.15f);
        }

        MeshBuilder Add(Material m, Vector3 worldPos)
        {
            var key = (m, Mathf.FloorToInt(worldPos.x / Chunk), Mathf.FloorToInt(worldPos.z / Chunk));
            if (!builders.TryGetValue(key, out var b)) builders[key] = b = new MeshBuilder();
            return b;
        }

        /** Raf-yerel kutu (yerel +z ön yüz). Demirbaş x'te simetrik olduğundan el yönü aynalaması gerekmez. */
        void Part(Material m, Vector3 origin, Quaternion rot, Vector3 localCenter, Vector3 size)
        {
            Vector3 c = origin + rot * localCenter;
            Add(m, c).Box(c, size, rot);
        }

        GameObject Spawn(string name, Mesh mesh, Material mat, bool shadows)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = shadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
            go.isStatic = true;
            return go;
        }

        void AddCollider(string name, Vector3 center, Vector3 size, float yawDeg)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root, false);
            go.transform.SetPositionAndRotation(center, Quaternion.Euler(0, yawDeg, 0));
            var bc = go.AddComponent<BoxCollider>();
            bc.size = size;
            Colliders.Add(bc);
        }

        void BuildObject(LayoutObjectDto o, float H)
        {
            var rot = Quaternion.Euler(0, PlanogramMath.YawDegrees(o.RotationY), 0);
            var pos = new Vector3(o.Position.X, 0, o.Position.Z);
            var s = o.Size ?? new Size3Dto { X = 1, Y = 1, Z = 1 };
            switch (o.Type)
            {
                case "wall":
                    Part(wallMat, pos, rot, new Vector3(0, s.Y / 2, 0), new Vector3(s.X, s.Y, s.Z));
                    Part(steelDark, pos, rot, new Vector3(0, 0.06f, 0), new Vector3(s.X, 0.12f, s.Z + 0.02f));
                    AddCollider("Wall-" + o.Id, pos + new Vector3(0, s.Y / 2, 0), new Vector3(s.X, s.Y, s.Z), PlanogramMath.YawDegrees(o.RotationY));
                    break;
                case "door":
                    Part(steelDark, pos, rot, new Vector3(-s.X / 2, s.Y / 2, 0), new Vector3(0.08f, s.Y, 0.12f));
                    Part(steelDark, pos, rot, new Vector3(s.X / 2, s.Y / 2, 0), new Vector3(0.08f, s.Y, 0.12f));
                    Part(steelDark, pos, rot, new Vector3(0, s.Y, 0), new Vector3(s.X + 0.08f, 0.1f, 0.12f));
                    Part(glass, pos, rot, new Vector3(-s.X / 4 - 0.35f, s.Y / 2, 0.02f), new Vector3(s.X / 2 - 0.1f, s.Y - 0.1f, 0.02f));
                    Part(glass, pos, rot, new Vector3(s.X / 4 + 0.35f, s.Y / 2, 0.02f), new Vector3(s.X / 2 - 0.1f, s.Y - 0.1f, 0.02f));
                    Label(o.MetaString("label", "GİRİŞ"), pos + rot * new Vector3(0, s.Y + 0.3f, 0.1f), rot, 0.22f, Color.white, new Color(0.11f, 0.3f, 0.85f), 1.4f, 0.32f);
                    break;
                case "checkout":
                    BuildCheckout(o, pos, rot, s);
                    break;
                case "sign":
                    float sh = o.MetaFloat("height", 3.2f);
                    var col = MaterialLibrary.Hex(o.MetaString("color", "#1d4ed8"), new Color(0.11f, 0.3f, 0.85f));
                    Part(lib.Solid(col, 0.3f), pos, rot, new Vector3(0, sh, 0), new Vector3(s.X, s.Y, s.Z));
                    Part(steelDark, pos, rot, new Vector3(-s.X * 0.4f, (sh + H) / 2, 0), new Vector3(0.01f, H - sh, 0.01f));
                    Part(steelDark, pos, rot, new Vector3(s.X * 0.4f, (sh + H) / 2, 0), new Vector3(0.01f, H - sh, 0.01f));
                    string text = o.MetaString("text", "");
                    Label(text, pos + rot * new Vector3(0, sh, s.Z / 2 + 0.005f), rot, 0.3f, Color.white, Color.clear, 0, 0);
                    if (o.MetaString("doubleSided", "False").ToLowerInvariant() == "true")
                        Label(text, pos + rot * new Vector3(0, sh, -s.Z / 2 - 0.005f), rot * Quaternion.Euler(0, 180, 0), 0.3f, Color.white, Color.clear, 0, 0);
                    break;
                case "cart_corral":
                    for (int i = -1; i <= 1; i += 2)
                        Part(steel, pos, rot, new Vector3(i * s.X / 2, 0.5f, 0), new Vector3(0.04f, 0.04f, s.Z));
                    Part(steel, pos, rot, new Vector3(0, 0.5f, s.Z / 2), new Vector3(s.X, 0.04f, 0.04f));
                    break;
                // gondol / soğutucu / tezgâh gövdeleri raf modüllerinden (shelves) kurulur
            }
        }

        void BuildCheckout(LayoutObjectDto o, Vector3 pos, Quaternion rot, Size3Dto s)
        {
            float h = s.Y;
            Part(white, pos, rot, new Vector3(0, h / 2 - 0.05f, 0), new Vector3(s.X, h - 0.1f, s.Z));
            Part(steelDark, pos, rot, new Vector3(0, 0.05f, 0), new Vector3(s.X - 0.04f, 0.1f, s.Z - 0.04f));
            Part(steel, pos, rot, new Vector3(0, h - 0.02f, 0), new Vector3(s.X + 0.02f, 0.04f, s.Z + 0.02f));
            Part(belt, pos, rot, new Vector3(0, h + 0.005f, s.Z * 0.12f), new Vector3(s.X * 0.7f, 0.01f, s.Z * 0.6f));
            // tarayıcı + POS ekranı
            Part(steelDark, pos, rot, new Vector3(0, h + 0.02f, -s.Z * 0.25f), new Vector3(s.X * 0.5f, 0.04f, 0.35f));
            Part(glow, pos, rot, new Vector3(0, h + 0.042f, -s.Z * 0.25f), new Vector3(s.X * 0.3f, 0.005f, 0.2f));
            Part(steelDark, pos, rot, new Vector3(-s.X * 0.35f, h + 0.25f, -s.Z * 0.4f), new Vector3(0.05f, 0.5f, 0.05f));
            Part(rubber, pos, rot, new Vector3(-s.X * 0.35f, h + 0.5f, -s.Z * 0.4f), new Vector3(0.36f, 0.24f, 0.04f));
            // kasa numarası direği
            Part(steelDark, pos, rot, new Vector3(s.X / 2 - 0.05f, 1.2f, -s.Z / 2 + 0.05f), new Vector3(0.05f, 2.4f, 0.05f));
            string number = o.MetaString("number", "");
            Label("KASA " + number, pos + rot * new Vector3(s.X / 2 - 0.05f, 2.45f, -s.Z / 2 + 0.05f), rot * Quaternion.Euler(0, -90, 0), 0.12f, Color.white, new Color(0.85f, 0.15f, 0.2f), 0.6f, 0.22f);
            AddCollider("Checkout-" + o.Id, pos + new Vector3(0, h / 2, 0), new Vector3(s.X, h, s.Z), PlanogramMath.YawDegrees(o.RotationY));
        }

        void BuildShelf(ShelfDto s)
        {
            var rot = Quaternion.Euler(0, PlanogramMath.YawDegrees(s.RotationY), 0);
            var o = new Vector3(s.Position.X, 0, s.Position.Z);
            float w = s.WidthM, d = s.DepthM, h = s.HeightM;
            switch (s.Kind)
            {
                case "gondola":
                    Part(steelDark, o, rot, new Vector3(0, 0.06f, 0.0f), new Vector3(w, 0.12f, d - 0.02f));
                    Part(pegboard, o, rot, new Vector3(0, h / 2, -d / 2 + 0.012f), new Vector3(w, h, 0.02f));
                    Part(steel, o, rot, new Vector3(-w / 2 + 0.015f, h / 2, -d / 2 + 0.04f), new Vector3(0.03f, h, 0.05f));
                    Part(steel, o, rot, new Vector3(w / 2 - 0.015f, h / 2, -d / 2 + 0.04f), new Vector3(0.03f, h, 0.05f));
                    foreach (var lv in s.Levels) ShelfBoard(o, rot, w, d, lv, lv.Index == 0 ? steelDark : panel);
                    Part(white, o, rot, new Vector3(0, h + 0.1f, -d / 2 + 0.03f), new Vector3(w, 0.2f, 0.04f));
                    break;
                case "open_chiller":
                case "cooler":
                    Part(white, o, rot, new Vector3(0, h / 2, -d / 2 + 0.03f), new Vector3(w, h, 0.06f));
                    Part(white, o, rot, new Vector3(-w / 2 + 0.02f, h / 2, 0), new Vector3(0.04f, h, d));
                    Part(white, o, rot, new Vector3(w / 2 - 0.02f, h / 2, 0), new Vector3(0.04f, h, d));
                    Part(white, o, rot, new Vector3(0, h - 0.06f, 0), new Vector3(w, 0.12f, d));
                    Part(glow, o, rot, new Vector3(0, h - 0.125f, d / 2 - 0.08f), new Vector3(w - 0.1f, 0.01f, 0.04f));
                    Part(steelDark, o, rot, new Vector3(0, 0.1f, 0), new Vector3(w, 0.2f, d));
                    Part(steel, o, rot, new Vector3(0, 0.2f, d / 2 - 0.02f), new Vector3(w, 0.06f, 0.03f));
                    foreach (var lv in s.Levels) ShelfBoard(o, rot, w, d - 0.08f, lv, steel);
                    if (s.Kind == "cooler")
                    {
                        int doors = Mathf.Max(1, Mathf.RoundToInt(w / 0.8f));
                        for (int i = 0; i < doors; i++)
                        {
                            float x = -w / 2 + (i + 0.5f) * w / doors;
                            Part(glass, o, rot, new Vector3(x, h / 2 + 0.06f, d / 2 + 0.01f), new Vector3(w / doors - 0.04f, h - 0.32f, 0.015f));
                            Part(steel, o, rot, new Vector3(x - w / doors / 2 + 0.015f, h / 2 + 0.06f, d / 2 + 0.02f), new Vector3(0.03f, h - 0.32f, 0.03f));
                            Part(steel, o, rot, new Vector3(x + w / doors / 2 - 0.08f, h / 2, d / 2 + 0.05f), new Vector3(0.02f, 0.5f, 0.02f));
                        }
                    }
                    break;
                case "produce_table":
                    foreach (var lv in s.Levels)
                    {
                        Part(wood, o, rot, new Vector3(0, lv.HeightM - 0.03f, lv.ZOffsetM), new Vector3(w, 0.03f, lv.DepthM));
                        Part(wood, o, rot, new Vector3(0, lv.HeightM + 0.03f, lv.ZOffsetM + lv.DepthM / 2 - 0.01f), new Vector3(w, 0.1f, 0.02f));
                    }
                    for (int i = -1; i <= 1; i += 2)
                        for (int j = -1; j <= 1; j += 2)
                            Part(wood, o, rot, new Vector3(i * (w / 2 - 0.05f), h / 2, j * (d / 2 - 0.05f)), new Vector3(0.06f, h, 0.06f));
                    break;
                default: // promo_stand ve diğerleri
                    Part(lib.Solid(new Color(0.85f, 0.12f, 0.15f), 0.35f), o, rot, new Vector3(0, h / 2, -d / 2 + 0.02f), new Vector3(w, h, 0.04f));
                    Part(steelDark, o, rot, new Vector3(0, 0.05f, 0), new Vector3(w, 0.1f, d));
                    foreach (var lv in s.Levels) ShelfBoard(o, rot, w, d, lv, white);
                    break;
            }
            AddCollider("Shelf-" + s.Id, o + rot * new Vector3(0, h / 2, 0), new Vector3(w, h, d), PlanogramMath.YawDegrees(s.RotationY));
        }

        void ShelfBoard(Vector3 o, Quaternion rot, float w, float d, ShelfLevelDto lv, Material m)
        {
            float depth = lv.DepthM > 0 ? lv.DepthM : d;
            float zc = d / 2 - depth / 2 + lv.ZOffsetM;
            Part(m, o, rot, new Vector3(0, lv.HeightM - 0.012f, zc), new Vector3(w - 0.04f, 0.024f, depth));
            if (lv.HeightM > 0.05f)
                Part(rail, o, rot, new Vector3(0, lv.HeightM - 0.025f, d / 2 + 0.006f), new Vector3(w - 0.04f, 0.04f, 0.012f));
        }

        public static TextMesh Label(string text, Vector3 pos, Quaternion rot, float charHeight, Color fg, Color bg, float bgW, float bgH, Transform parent = null)
        {
            var go = new GameObject("Label");
            if (parent != null) go.transform.SetParent(parent, false);
            // TextMesh yerel −z'den okunur; dışa bakan yüzün tersine çevir
            go.transform.SetPositionAndRotation(pos, rot * Quaternion.Euler(0, 180, 0));
            var tm = go.AddComponent<TextMesh>();
            tm.text = text;
            tm.font = UIManager.DefaultFont;
            tm.fontSize = 64;
            tm.characterSize = charHeight / 64f * 1.6f;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.alignment = TextAlignment.Center;
            tm.color = fg;
            var mr = go.GetComponent<MeshRenderer>();
            mr.sharedMaterial = tm.font.material;
            mr.shadowCastingMode = ShadowCastingMode.Off;
            if (bg.a > 0 && bgW > 0)
            {
                var back = GameObject.CreatePrimitive(PrimitiveType.Quad);
                Destroy(back.GetComponent<Collider>());
                back.transform.SetParent(go.transform, false);
                back.transform.localPosition = new Vector3(0, 0, 0.004f);
                back.transform.localScale = new Vector3(bgW, bgH, 1);
                back.GetComponent<MeshRenderer>().sharedMaterial = GameManager.Instance.Materials.Solid(bg, 0.3f);
            }
            return tm;
        }

        void SetupLighting(LayoutDto L, float H)
        {
            var sunGo = new GameObject("KeyLight");
            sunGo.transform.SetParent(root, false);
            sunGo.transform.rotation = Quaternion.Euler(62f, 28f, 0f);
            Sun = sunGo.AddComponent<Light>();
            Sun.type = LightType.Directional;
            Sun.color = new Color(1f, 0.97f, 0.92f);
            Sun.intensity = 1.15f;
            Sun.shadows = LightShadows.Soft;
            Sun.shadowStrength = 0.55f;
            Sun.shadowBias = 0.03f;
            Sun.shadowNormalBias = 0.25f;

            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.86f, 0.87f, 0.9f);
            RenderSettings.ambientEquatorColor = new Color(0.62f, 0.62f, 0.62f);
            RenderSettings.ambientGroundColor = new Color(0.38f, 0.36f, 0.34f);
            RenderSettings.ambientIntensity = 1f;
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.86f, 0.86f, 0.86f);
            RenderSettings.fogStartDistance = 22f;
            RenderSettings.fogEndDistance = 70f;
        }
    }
}
