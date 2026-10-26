using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using NUnit.Framework;
using RealMarket.Core;

namespace RealMarket.Core.Tests
{
    static class Fixture
    {
        static SceneDataDto scene;

        /** Yerel API'den kaydedilmiş gerçek sahne (GET /api/stores/demo-market/scene). */
        public static SceneDataDto Scene
        {
            get
            {
                if (scene != null) return scene;
                string path = Path.Combine(TestContext.CurrentContext.TestDirectory, "Fixtures", "scene.json");
                scene = Json.Parse<SceneDataDto>(File.ReadAllText(path));
                return scene;
            }
        }
    }

    public class DtoTests
    {
        [Test]
        public void SceneJson_DeserializesWithCamelCase()
        {
            var s = Fixture.Scene;
            Assert.That(s.Store.Id, Is.EqualTo("demo-market"));
            Assert.That(s.Layout.Shelves.Count, Is.GreaterThan(50));
            Assert.That(s.Products.Count, Is.GreaterThan(10));
            Assert.That(s.Slots.Count, Is.GreaterThan(100));
            var slot = s.Slots[0];
            Assert.That(slot.Facings, Is.GreaterThan(0));
            Assert.That(slot.UnitWidthMm, Is.GreaterThan(0));
            Assert.That(s.Products.All(p => p.PriceKurus > 0 && !string.IsNullOrEmpty(p.StoreProductId)), Is.True);
            Assert.That(s.Layout.Spawn, Is.Not.Null);
            Assert.That(s.Layout.Params.WidthM, Is.GreaterThan(10));
        }

        [Test]
        public void Json_WritesCamelCase()
        {
            string json = Json.Write(new SessionDto { SessionId = "a", Token = "t", StoreId = "s" });
            Assert.That(json, Does.Contain("\"sessionId\":\"a\""));
            Assert.That(json, Does.Contain("\"storeId\":\"s\""));
        }

        [Test]
        public void LayoutObjectMeta_ReadsTypedValues()
        {
            var o = Json.Parse<LayoutObjectDto>("{\"id\":\"x\",\"type\":\"sign\",\"meta\":{\"label\":\"Süt\",\"h\":2.5}}");
            Assert.That(o.MetaString("label"), Is.EqualTo("Süt"));
            Assert.That(o.MetaFloat("h"), Is.EqualTo(2.5f).Within(1e-5));
            Assert.That(o.MetaFloat("yok", 7f), Is.EqualTo(7f));
        }
    }

    public class PlanogramTests
    {
        static SlotDto Slot(int facings = 3, int depth = 2, int stack = 1) => new SlotDto
        {
            XMm = 100, YMm = 220, ZMm = 0, UnitWidthMm = 70, UnitHeightMm = 245, UnitDepthMm = 70,
            Facings = facings, DepthCount = depth, StackCount = stack,
        };

        [Test]
        public void ExpandSlotUnits_MatchesTypeScriptOrder()
        {
            // packages/planogram expandSlotUnits ile aynı: ön sıra → soldan sağa → istif
            var u = PlanogramMath.ExpandSlotUnits(Slot(), 1.25f, 0.6f);
            Assert.That(u.Count, Is.EqualTo(6));
            float left = -0.625f + 0.1f;
            Assert.That(u[0].X, Is.EqualTo(left + 0.035f).Within(1e-5));
            Assert.That(u[1].X, Is.EqualTo(left + 0.072f + 0.035f).Within(1e-5));
            Assert.That(u[0].Z, Is.EqualTo(0.3f - 0.012f - 0.035f).Within(1e-5));
            Assert.That(u[3].Row, Is.EqualTo(1));
            Assert.That(u[3].Z, Is.EqualTo(u[0].Z - 0.07f).Within(1e-5));
            Assert.That(u[0].Y, Is.EqualTo(0.22f).Within(1e-5));
        }

        [Test]
        public void ExpandSlotUnits_LimitsDepthRows()
        {
            var u = PlanogramMath.ExpandSlotUnits(Slot(facings: 2, depth: 8, stack: 2), 1.25f, 0.6f, maxRows: 2);
            Assert.That(u.Count, Is.EqualTo(2 * 2 * 2));
            Assert.That(u.Max(x => x.Row), Is.EqualTo(1));
        }

        [Test]
        public void LocalToWorld_PreservesShopperLeftToRight()
        {
            // Unity'de (sol elli) raf önünde rafa bakan müşterinin sağ tarafı:
            // bakış yönü f = -n, sağ = (f.z, -f.x) (y yukarı, sol elli: right = up × forward).
            foreach (float rot in new[] { 0f, (float)Math.PI / 2, (float)Math.PI, -(float)Math.PI / 2, 0.4f })
            {
                var origin = new Vec2Dto { X = 10, Z = 20 };
                PlanogramMath.LocalToWorld(origin, rot, -0.5f, 0.3f, out float ax, out float az);
                PlanogramMath.LocalToWorld(origin, rot, 0.5f, 0.3f, out float bx, out float bz);
                PlanogramMath.FrontNormal(rot, out float nx, out float nz);
                float fx = -nx, fz = -nz;
                float rx = fz, rz = -fx;
                float along = (bx - ax) * rx + (bz - az) * rz;
                Assert.That(along, Is.EqualTo(1f).Within(1e-4), $"rot={rot}");
                // ön yüz (+lz) normal yönünde
                PlanogramMath.LocalToWorld(origin, rot, 0f, 1f, out float fxw, out float fzw);
                Assert.That((fxw - origin.X) * nx + (fzw - origin.Z) * nz, Is.EqualTo(1f).Within(1e-4));
            }
        }
    }

    public class UnitIndexTests
    {
        [Test]
        public void Build_FromRealScene_CountsMatchVisibleUnitsCappedAtTwoRows()
        {
            var s = Fixture.Scene;
            var idx = new UnitIndex();
            idx.Build(s);
            var shelves = s.Layout.Shelves.ToDictionary(x => x.Id);
            int expected = 0;
            foreach (var slot in s.Slots)
            {
                if (!shelves.ContainsKey(slot.ShelfId) || s.Products.All(p => p.Id != slot.ProductId)) continue;
                int rowSize = slot.Facings * slot.StackCount;
                int local = rowSize * Math.Min(slot.DepthCount, UnitIndex.MaxDepthRows);
                expected += Math.Min(slot.VisibleUnits, local);
            }
            Assert.That(idx.Units.Count, Is.EqualTo(expected));
            Assert.That(idx.Units.Count, Is.GreaterThan(5000));
            // tüm birimler mağaza sınırları içinde
            float w = s.Layout.Params.WidthM, l = s.Layout.Params.LengthM;
            Assert.That(idx.Units.All(u => u.Position.X > 0 && u.Position.X < w && u.Position.Z > 0 && u.Position.Z < l), Is.True);
        }

        [Test]
        public void Raycast_HitsFrontUnitFromAisle_AndSkipsTaken()
        {
            var s = Fixture.Scene;
            var idx = new UnitIndex();
            idx.Build(s);
            var target = idx.Units.First(u => u.Occludable && u.Position.Y > 1.0f && u.Position.Y < 1.5f);
            float cy = target.Position.Y + target.Half.Y;
            var aim = new Vector3(target.Position.X, cy, target.Position.Z);
            var from = aim + new Vector3(target.NormalX, 0, target.NormalZ) * 1.2f;
            var dir = Vector3.Normalize(aim - from);
            int hit = idx.Raycast(from, dir, 2.5f, out float dist);
            Assert.That(hit, Is.GreaterThanOrEqualTo(0));
            var h = idx.Units[hit];
            Assert.That(h.ProductId, Is.EqualTo(target.ProductId));
            Assert.That(dist, Is.LessThan(1.2f));
            // ön sıradaki isabet alınınca ışın arkadaki birime geçer, aynı birimi tekrar vermez
            h.Taken = true;
            int hit2 = idx.Raycast(from, dir, 2.5f, out float dist2);
            Assert.That(hit2, Is.Not.EqualTo(hit));
            if (hit2 >= 0) Assert.That(dist2, Is.GreaterThanOrEqualTo(dist));
        }

        [Test]
        public void Raycast_MissesWhenPointingAtCeiling()
        {
            var idx = new UnitIndex();
            idx.Build(Fixture.Scene);
            var sp = Fixture.Scene.Layout.Spawn.Position;
            int hit = idx.Raycast(new Vector3(sp.X, 1.6f, sp.Z), new Vector3(0, 1, 0), 2.5f, out _);
            Assert.That(hit, Is.EqualTo(-1));
        }

        [Test]
        public void RayAabb_Basic()
        {
            Assert.That(UnitIndex.RayAabb(new Vector3(0, 0, -5), new Vector3(0, 0, 1), new Vector3(-1, -1, -1), new Vector3(1, 1, 1), out float t), Is.True);
            Assert.That(t, Is.EqualTo(4f).Within(1e-5));
            Assert.That(UnitIndex.RayAabb(new Vector3(0, 3, -5), new Vector3(0, 0, 1), new Vector3(-1, -1, -1), new Vector3(1, 1, 1), out _), Is.False);
        }

        [Test]
        public void ShelfCount_DecreasesWhenTaken()
        {
            var idx = new UnitIndex();
            idx.Build(Fixture.Scene);
            var pid = idx.Units[0].ProductId;
            int before = idx.ShelfCount(pid);
            idx.Units[idx.ByProduct[pid][0]].Taken = true;
            Assert.That(idx.ShelfCount(pid), Is.EqualTo(before - 1));
        }
    }

    public class StateMachineTests
    {
        [Test]
        public void FullPickToCartFlow()
        {
            var m = new ItemStateMachine();
            Assert.That(m.Send(1, ItemEvent.Hover), Is.True);
            Assert.That(m.Send(1, ItemEvent.Select), Is.True);
            Assert.That(m.Send(1, ItemEvent.PickStart), Is.True);
            Assert.That(m.Get(1), Is.EqualTo(ItemState.PickingUp));
            Assert.That(m.Send(1, ItemEvent.PickDone), Is.True);
            Assert.That(m.Send(1, ItemEvent.ToCart), Is.True);
            Assert.That(m.Send(1, ItemEvent.CartArrived), Is.True);
            Assert.That(m.Get(1), Is.EqualTo(ItemState.InCart));
        }

        [Test]
        public void RejectsInvalidTransitions()
        {
            var m = new ItemStateMachine();
            Assert.That(m.Send(2, ItemEvent.ToCart), Is.False);
            Assert.That(m.Send(2, ItemEvent.PickDone), Is.False);
            Assert.That(m.RejectedCount, Is.EqualTo(2));
            Assert.That(m.Get(2), Is.EqualTo(ItemState.Idle));
        }

        [Test]
        public void ServerRejectReturnsToShelfThenIdle()
        {
            var m = new ItemStateMachine();
            foreach (var e in new[] { ItemEvent.Select, ItemEvent.PickStart, ItemEvent.PickDone, ItemEvent.ToCart, ItemEvent.CartRejected })
                Assert.That(m.Send(3, e), Is.True, e.ToString());
            Assert.That(m.Get(3), Is.EqualTo(ItemState.ReturningToShelf));
            Assert.That(m.Send(3, ItemEvent.ShelfArrived), Is.True);
            Assert.That(m.Get(3), Is.EqualTo(ItemState.Idle));
        }

        [Test]
        public void EveryStateHasAnExit()
        {
            foreach (ItemState s in Enum.GetValues(typeof(ItemState)))
                Assert.That(Enum.GetValues(typeof(ItemEvent)).Cast<ItemEvent>().Any(e => ItemStateMachine.Next(s, e) != null), Is.True, s.ToString());
        }
    }

    public class CartPackingTests
    {
        [Test]
        public void ItemsDoNotOverlapWithinLayer()
        {
            var items = Enumerable.Range(0, 20).Select(i => new PackItem { Key = "k" + i, W = 0.07f + (i % 3) * 0.02f, H = 0.12f, D = 0.08f }).ToList();
            var packed = CartPacking.Pack(items, out float ratio);
            Assert.That(packed.Count, Is.EqualTo(20));
            for (int a = 0; a < packed.Count; a++)
                for (int b = a + 1; b < packed.Count; b++)
                {
                    var A = packed[a]; var B = packed[b];
                    if (Math.Abs(A.Y - B.Y) > 1e-5) continue;
                    float wa = items[a].W, wb = items[b].W;
                    bool overlapX = Math.Abs(A.X - B.X) < (wa + wb) / 2 - 1e-5;
                    bool overlapZ = Math.Abs(A.Z - B.Z) < (items[a].D + items[b].D) / 2 - 1e-5;
                    Assert.That(overlapX && overlapZ, Is.False, $"{a} vs {b}");
                }
            Assert.That(packed.All(p => p.X >= -CartPacking.BasketWidth / 2 && p.X <= CartPacking.BasketWidth / 2), Is.True);
            Assert.That(ratio, Is.GreaterThan(0));
        }

        [Test]
        public void TallBottleLiesDown()
        {
            var packed = CartPacking.Pack(new[] { new PackItem { Key = "su", W = 0.09f, H = 0.38f, D = 0.09f } }, out _);
            Assert.That(packed[0].Lying, Is.True);
            Assert.That(packed[0].Overflow, Is.False);
        }

        [Test]
        public void OverflowFlaggedWhenFull()
        {
            var items = Enumerable.Range(0, 200).Select(i => new PackItem { Key = "b" + i, W = 0.25f, H = 0.2f, D = 0.26f }).ToList();
            var packed = CartPacking.Pack(items, out float ratio);
            Assert.That(packed.Any(p => p.Overflow), Is.True);
            Assert.That(ratio, Is.GreaterThan(1));
        }
    }

    public class MotionTests
    {
        [Test]
        public void ApproachVelocity_ReachesTargetWithoutOvershoot()
        {
            float vx = 0, vz = 0;
            for (int i = 0; i < 120; i++)
            {
                MotionMath.ApproachVelocity(ref vx, ref vz, 1.4f, 0, 6f, 9f, 1f / 60f);
                Assert.That(vx, Is.LessThanOrEqualTo(1.4f + 1e-5));
            }
            Assert.That(vx, Is.EqualTo(1.4f).Within(1e-5));
        }

        [Test]
        public void ApproachVelocity_StopsFasterThanStarts()
        {
            int Frames(float from, float to, float accel, float decel)
            {
                float vx = from, vz = 0; int n = 0;
                while (Math.Abs(vx - to) > 1e-4 && n < 1000) { MotionMath.ApproachVelocity(ref vx, ref vz, to, 0, accel, decel, 1f / 60f); n++; }
                return n;
            }
            Assert.That(Frames(1.4f, 0, 6, 9), Is.LessThan(Frames(0, 1.4f, 6, 9)));
        }

        [Test]
        public void Damp_IsFrameRateIndependent()
        {
            float a = 0; for (int i = 0; i < 60; i++) a = MotionMath.Damp(a, 1, 5, 1f / 60f);
            float b = 0; for (int i = 0; i < 144; i++) b = MotionMath.Damp(b, 1, 5, 1f / 144f);
            Assert.That(a, Is.EqualTo(b).Within(1e-3));
        }

        [Test]
        public void HeadBob_DisabledIsZero()
        {
            MotionMath.HeadBob(1.2f, 1.4f, false, out float y, out float x, out float r);
            Assert.That(y == 0 && x == 0 && r == 0, Is.True);
            MotionMath.HeadBob(0.7f, 1.4f, true, out y, out x, out r);
            Assert.That(Math.Abs(y), Is.LessThan(0.02f));
        }

        [Test]
        public void CartCoast_StopsInFiniteTime()
        {
            float vx = 1.2f, vz = 0.3f; int n = 0;
            while ((vx != 0 || vz != 0) && n < 1000) { CartDynamics.Coast(ref vx, ref vz, 1f / 60f); n++; }
            Assert.That(n, Is.LessThan(120));
        }

        [Test]
        public void CasterAlignsToTravelDirection()
        {
            float caster = 1.5f, spin = 0;
            for (int i = 0; i < 120; i++) CartDynamics.UpdateWheels(0, 1f, 0, 0, 1f / 60f, ref caster, ref spin);
            Assert.That(caster, Is.EqualTo(0).Within(0.02));
            Assert.That(spin, Is.GreaterThan(0));
        }
    }

    public class LodAndQualityTests
    {
        [Test]
        public void Lod_IncreasesWithDistance_AndHasHysteresis()
        {
            Assert.That(LodSelector.Select(1f, 0.15f, 1, 5f, 12f, 0.1f), Is.EqualTo(1));
            Assert.That(LodSelector.Select(8f, 0.15f, 1, 5f, 12f, 0.1f), Is.EqualTo(2));
            Assert.That(LodSelector.Select(20f, 0.15f, 2, 5f, 12f, 0.1f), Is.EqualTo(3));
            // eşiğin hemen altında geri dönmez
            Assert.That(LodSelector.Select(4.8f, 0.15f, 2, 5f, 12f, 0.1f), Is.EqualTo(2));
            Assert.That(LodSelector.Select(5.2f, 0.15f, 1, 5f, 12f, 0.1f), Is.EqualTo(1));
            // büyük ürün daha uzakta da ayrıntılı kalır
            Assert.That(LodSelector.Select(8f, 0.6f, 1, 5f, 12f, 0.1f), Is.EqualTo(1));
        }

        [Test]
        public void QualityProfiles_AreMonotonic()
        {
            var tiers = new[] { QualityTier.Low, QualityTier.Medium, QualityTier.High, QualityTier.Ultra }.Select(QualityProfile.For).ToList();
            for (int i = 1; i < tiers.Count; i++)
            {
                Assert.That(tiers[i].RenderScale, Is.GreaterThanOrEqualTo(tiers[i - 1].RenderScale));
                Assert.That(tiers[i].ShadowDistance, Is.GreaterThanOrEqualTo(tiers[i - 1].ShadowDistance));
                Assert.That(tiers[i].MaxProductDistance, Is.GreaterThan(tiers[i - 1].MaxProductDistance));
                Assert.That(tiers[i].LodFar, Is.GreaterThan(tiers[i - 1].LodFar));
            }
        }

        [Test]
        public void Recommend_PicksSensibleTiers()
        {
            Assert.That(QualityProfile.Recommend(false, "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11)", 8000), Is.EqualTo(QualityTier.High));
            Assert.That(QualityProfile.Recommend(false, "ANGLE (Intel, Intel(R) UHD Graphics)", 8000), Is.EqualTo(QualityTier.Low));
            Assert.That(QualityProfile.Recommend(false, "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)", 8000), Is.EqualTo(QualityTier.Low));
            Assert.That(QualityProfile.Recommend(false, "Apple M2", 8000), Is.EqualTo(QualityTier.Medium));
            Assert.That(QualityProfile.Recommend(false, "Google SwiftShader", 8000), Is.EqualTo(QualityTier.Low));
            Assert.That(QualityProfile.Recommend(true, "Mali-G52", 3000), Is.EqualTo(QualityTier.Low));
            Assert.That(QualityProfile.Recommend(true, "Apple GPU", 6000), Is.EqualTo(QualityTier.Medium));
        }
    }

    public class MoneyAndBridgeTests
    {
        [Test]
        public void Money_FormatsTurkishLira()
        {
            Assert.That(Money.Format(3450), Is.EqualTo("₺34,50"));
            Assert.That(Money.Format(345000), Is.EqualTo("₺3.450,00"));
            Assert.That(Money.Format(123456789), Is.EqualTo("₺1.234.567,89"));
            Assert.That(Money.Format(5), Is.EqualTo("₺0,05"));
            Assert.That(Money.Format(-1999), Is.EqualTo("-₺19,99"));
            Assert.That(Money.FormatTl(345000), Is.EqualTo("3.450,00 TL"));
            Assert.That(Money.FormatTl(-1999), Is.EqualTo("-19,99 TL"));
        }

        [Test]
        public void Bridge_EnvelopeIsVersionedCamelCase()
        {
            string json = BridgeEvents.Envelope(BridgeEvents.AddToCart, new Dictionary<string, object> { ["storeProductId"] = "sp1", ["quantity"] = 1 });
            Assert.That(json, Does.Contain("\"type\":\"ADD_TO_CART\""));
            Assert.That(json, Does.Contain("\"version\":1"));
            Assert.That(json, Does.Contain("\"storeProductId\":\"sp1\""));
        }
    }
}
