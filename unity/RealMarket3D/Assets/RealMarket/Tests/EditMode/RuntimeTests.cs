using NUnit.Framework;
using RealMarket.Core;
using RealMarket.Runtime;
using UnityEngine;

namespace RealMarket.Tests
{
    /** Unity'ye bağlı katmanın düzenleyici testleri (GameCI test-runner ile CI'da çalışır). */
    public class MeshBuilderTests
    {
        [Test]
        public void BoxFacesPointOutwardWithClockwiseWinding()
        {
            var mesh = new MeshBuilder().Box(Vector3.zero, Vector3.one).ToMesh("t");
            var v = mesh.vertices; var t = mesh.triangles; var n = mesh.normals;
            Assert.That(t.Length, Is.EqualTo(36));
            for (int i = 0; i < t.Length; i += 3)
            {
                Vector3 a = v[t[i]], b = v[t[i + 1]], c = v[t[i + 2]];
                // Unity: ön yüzde saat yönü → Cross(b-a, c-a) dışa (normal yönüne) bakar
                Vector3 face = Vector3.Cross(b - a, c - a).normalized;
                Vector3 center = (a + b + c) / 3f;
                Assert.That(Vector3.Dot(face, center), Is.GreaterThan(0f), $"üçgen {i / 3}");
                Assert.That(Vector3.Dot(face, n[t[i]]), Is.GreaterThan(0.99f));
            }
            Object.DestroyImmediate(mesh);
        }

        [Test]
        public void CylinderSideAndCapsFaceOutward()
        {
            var mesh = new MeshBuilder().Cylinder(Vector3.zero, 0.5f, 0.5f, 1f, 12).ToMesh("c");
            var v = mesh.vertices; var t = mesh.triangles;
            var axisCenter = new Vector3(0, 0.5f, 0);
            for (int i = 0; i < t.Length; i += 3)
            {
                Vector3 a = v[t[i]], b = v[t[i + 1]], c = v[t[i + 2]];
                Vector3 face = Vector3.Cross(b - a, c - a);
                if (face.sqrMagnitude < 1e-10f) continue;
                Assert.That(Vector3.Dot(face.normalized, (a + b + c) / 3f - axisCenter), Is.GreaterThan(0f), $"üçgen {i / 3}");
            }
            Object.DestroyImmediate(mesh);
        }
    }

    public class ConfigTests
    {
        [Test]
        public void ApiAddressMustBeRelativeOrHttp()
        {
            Assert.That(RuntimeConfig.IsSafeApi("/api"), Is.True); // aynı kökene göreli yol
            Assert.That(RuntimeConfig.IsSafeApi(""), Is.False);
            Assert.That(RuntimeConfig.IsSafeApi("https://api.ornek.com"), Is.True);
            Assert.That(RuntimeConfig.IsSafeApi("javascript:alert(1)"), Is.False);
            Assert.That(RuntimeConfig.IsSafeApi("//evil.example"), Is.False);
            Assert.That(RuntimeConfig.IsSafeId("demo-market"), Is.True);
            Assert.That(RuntimeConfig.IsSafeId("../x"), Is.False);
        }
    }

    public class BridgeTests
    {
        [Test]
        public void ReceiveDispatchesTypedPayload()
        {
            var go = new GameObject("bridge");
            var bridge = go.AddComponent<WebBridge>();
            string got = null; string sp = null;
            bridge.Received += (type, payload) => { got = type; sp = (string)payload["storeProductId"]; };
            bridge.Receive("{\"version\":1,\"type\":\"ADD_TO_CART\",\"payload\":{\"storeProductId\":\"x1\"}}");
            Assert.That(got, Is.EqualTo(BridgeEvents.AddToCart));
            Assert.That(sp, Is.EqualTo("x1"));
            bridge.Receive("bozuk json");
            Assert.That(got, Is.EqualTo(BridgeEvents.AddToCart));
            Object.DestroyImmediate(go);
        }
    }

    public class FallbackModelTests
    {
        [Test]
        public void EveryPackagingTypeProducesBoundedGeometry()
        {
            var lib = ScriptableObject.CreateInstance<MaterialLibrary>();
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            lib.Lit = new Material(shader); lib.LitInstanced = new Material(shader) { enableInstancing = true };
            foreach (var t in new[] { "pet_bottle", "glass_bottle", "beverage_can", "tin_can", "jar", "yogurt_cup", "spray", "shampoo_bottle", "detergent_bottle", "tube", "fruit", "vegetable", "milk_carton", "carton_box", "chips_bag", "pouch", "pasta_pack", "biscuit_pack" })
            {
                var info = new ProductInfo { Dto = new ProductDto { Id = t, PackagingType = t }, Size = new Vector3(0.08f, 0.25f, 0.08f), Primary = Color.red, Accent = Color.white };
                for (int lod = 0; lod < 4; lod++)
                {
                    var m = FallbackModels.Build(info, lod, lib);
                    Assert.That(m.Parts.Count, Is.GreaterThan(0), t);
                    foreach (var p in m.Parts)
                    {
                        var b = p.Mesh.bounds;
                        Assert.That(b.min.y, Is.GreaterThanOrEqualTo(-1e-3f), t);
                        Assert.That(b.max.y, Is.LessThanOrEqualTo(0.25f + 0.01f), t);
                        Assert.That(b.extents.x, Is.LessThanOrEqualTo(0.045f), t);
                    }
                }
            }
        }
    }
}
