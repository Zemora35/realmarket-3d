using System.Collections.Generic;
using RealMarket.Core;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Alışveriş arabası: kinematik Rigidbody + SweepTest ile çarpışmalı itme (PhysX),
     * bırakılınca yuvarlanma sürtünmesiyle durma, döner ön tekerlek hizalaması, tekerlek dönüşü.
     * Sepet içeriği CartPacking ile çakışmasız yerleşir; ürünler instancing ile çizilir.
     */
    [RequireComponent(typeof(Rigidbody))]
    public class ShoppingCartController : MonoBehaviour
    {
        public const float GrabDistance = 1.7f, HoldOffset = 0.95f;
        public static readonly Vector3 BasketFloor = new Vector3(0, 0.5f, 0.06f);
        public bool Grabbed { get; private set; }
        public bool Blocked { get; private set; }

        Rigidbody rb;
        BoxCollider body;
        FirstPersonController player;
        ProductManager products;
        Collider playerCollider;
        float vx, vz, yawRate, caster, spin, lastYaw;
        readonly Transform[] casters = new Transform[2];
        readonly Transform[] wheels = new Transform[4];
        readonly List<(ProductInfo info, PackedItem pack)> contents = new List<(ProductInfo, PackedItem)>();
        public float VolumeRatio { get; private set; }

        public void Init(FirstPersonController player, ProductManager products, MaterialLibrary lib, Vector3 pos, float yawDeg)
        {
            this.player = player;
            this.products = products;
            playerCollider = player.GetComponent<CharacterController>();
            rb = GetComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            body = gameObject.AddComponent<BoxCollider>();
            body.center = new Vector3(0, 0.55f, 0);
            body.size = new Vector3(0.56f, 1.0f, 0.95f);
            transform.SetPositionAndRotation(pos, Quaternion.Euler(0, yawDeg, 0));
            lastYaw = yawDeg;
            BuildVisual(lib);
        }

        void BuildVisual(MaterialLibrary lib)
        {
            var chrome = lib.Solid(new Color(0.82f, 0.84f, 0.86f), 0.8f, 0.9f);
            var plastic = lib.Solid(new Color(0.85f, 0.12f, 0.15f), 0.45f);
            var rubber = lib.Solid(new Color(0.1f, 0.1f, 0.1f), 0.2f);
            float w = CartPacking.BasketWidth, l = CartPacking.BasketLength, h = CartPacking.BasketHeight;
            var frame = new MeshBuilder();
            Vector3 f = BasketFloor;
            const float t = 0.008f;
            // sepet tel çerçevesi: taban ızgarası + yan teller
            for (int i = 0; i <= 6; i++) frame.Box(f + new Vector3(-w / 2 + i * w / 6, 0, 0), new Vector3(t, t, l));
            for (int i = 0; i <= 8; i++) frame.Box(f + new Vector3(0, 0, -l / 2 + i * l / 8), new Vector3(w, t, t));
            for (int k = 1; k <= 4; k++)
            {
                float y = f.y + k * h / 4;
                frame.Box(new Vector3(-w / 2, y, f.z), new Vector3(t, t, l));
                frame.Box(new Vector3(w / 2, y, f.z), new Vector3(t, t, l));
                frame.Box(new Vector3(0, y, f.z - l / 2), new Vector3(w, t, t));
                frame.Box(new Vector3(0, y, f.z + l / 2), new Vector3(w, t, t));
            }
            for (int i = 0; i <= 8; i++)
            {
                float z = f.z - l / 2 + i * l / 8;
                frame.Box(new Vector3(-w / 2, f.y + h / 2, z), new Vector3(t, h, t));
                frame.Box(new Vector3(w / 2, f.y + h / 2, z), new Vector3(t, h, t));
            }
            for (int i = 0; i <= 6; i++)
            {
                float x = -w / 2 + i * w / 6;
                frame.Box(new Vector3(x, f.y + h / 2, f.z + l / 2), new Vector3(t, h, t));
                frame.Box(new Vector3(x, f.y + h / 2, f.z - l / 2), new Vector3(t, h, t));
            }
            // şasi, alt raf ve tutma kolu
            frame.Box(new Vector3(-0.2f, 0.12f, 0), new Vector3(0.025f, 0.025f, 0.8f));
            frame.Box(new Vector3(0.2f, 0.12f, 0), new Vector3(0.025f, 0.025f, 0.8f));
            frame.Box(new Vector3(-0.22f, 0.3f, -0.36f), new Vector3(0.02f, 0.4f, 0.02f), Quaternion.Euler(-12, 0, 0));
            frame.Box(new Vector3(0.22f, 0.3f, -0.36f), new Vector3(0.02f, 0.4f, 0.02f), Quaternion.Euler(-12, 0, 0));
            frame.Box(new Vector3(-0.25f, 0.98f, -0.4f), new Vector3(0.015f, 0.12f, 0.015f));
            frame.Box(new Vector3(0.25f, 0.98f, -0.4f), new Vector3(0.015f, 0.12f, 0.015f));
            Child("Frame", frame.ToMesh("cart-frame"), chrome, Vector3.zero);
            var handle = new MeshBuilder().Cylinder(new Vector3(-0.27f, 1.04f, -0.42f), 0.018f, 0.018f, 0.54f, 12, true, Quaternion.Euler(0, 0, -90));
            Child("Handle", handle.ToMesh("cart-handle"), plastic, Vector3.zero);

            var wheelMesh = new MeshBuilder().Cylinder(new Vector3(-0.012f, 0, 0), CartDynamics.WheelRadius, CartDynamics.WheelRadius, 0.024f, 14, true, Quaternion.Euler(0, 0, -90)).ToMesh("cart-wheel");
            Vector3[] wp = { new Vector3(-0.21f, 0, 0.32f), new Vector3(0.21f, 0, 0.32f), new Vector3(-0.21f, 0, -0.3f), new Vector3(0.21f, 0, -0.3f) };
            for (int i = 0; i < 4; i++)
            {
                Transform pivot = transform;
                if (i < 2)
                {
                    var c = new GameObject("Caster" + i).transform;
                    c.SetParent(transform, false);
                    c.localPosition = wp[i] + new Vector3(0, CartDynamics.WheelRadius, 0);
                    casters[i] = c;
                    pivot = c;
                }
                var wgo = Child("Wheel" + i, wheelMesh, rubber, i < 2 ? new Vector3(0, 0, -0.03f) : wp[i] + new Vector3(0, CartDynamics.WheelRadius, 0), pivot);
                wheels[i] = wgo.transform;
            }
        }

        GameObject Child(string name, Mesh mesh, Material m, Vector3 local, Transform parent = null)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent != null ? parent : transform, false);
            go.transform.localPosition = local;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = m;
            return go;
        }

        public float DistanceToHandle(Vector3 p)
        {
            var handle = transform.TransformPoint(new Vector3(0, 1.0f, -0.42f));
            p.y = handle.y = 0;
            return Vector3.Distance(p, handle);
        }

        public bool ToggleGrab()
        {
            if (Grabbed) { Release(); return false; }
            if (DistanceToHandle(player.transform.position) > GrabDistance) return false;
            Grabbed = true;
            player.SpeedMultiplier = 0.85f;
            Physics.IgnoreCollision(playerCollider, body, true);
            return true;
        }

        public void Release()
        {
            if (!Grabbed) return;
            Grabbed = false;
            player.SpeedMultiplier = 1f;
            Physics.IgnoreCollision(playerCollider, body, false);
        }

        void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            Vector3 pos = rb.position;
            float yaw = rb.rotation.eulerAngles.y;
            Vector3 targetPos = pos;
            float targetYaw = yaw;
            if (Grabbed)
            {
                float py = player.Yaw;
                targetYaw = py;
                Vector3 fwd = Quaternion.Euler(0, py, 0) * Vector3.forward;
                targetPos = player.transform.position + fwd * HoldOffset;
                targetPos.y = 0;
                Vector3 delta = targetPos - pos;
                vx = delta.x / dt; vz = delta.z / dt;
                if (DistanceToHandle(player.transform.position) > 2.6f) Release();
            }
            else
            {
                CartDynamics.Coast(ref vx, ref vz, dt);
                targetPos = pos + new Vector3(vx, 0, vz) * dt;
            }

            Vector3 move = targetPos - pos;
            Blocked = false;
            if (move.sqrMagnitude > 1e-8f)
            {
                float d = move.magnitude;
                if (rb.SweepTest(move / d, out var hit, d + 0.01f, QueryTriggerInteraction.Ignore) && hit.collider != playerCollider)
                {
                    float allowed = Mathf.Max(0, hit.distance - 0.01f);
                    // engelin yüzeyi boyunca kaydır
                    Vector3 slide = Vector3.ProjectOnPlane(move - move / d * allowed, hit.normal);
                    slide.y = 0;
                    Vector3 safe = move / d * allowed;
                    if (slide.sqrMagnitude > 1e-8f && !rb.SweepTest(slide.normalized, out _, slide.magnitude + 0.01f, QueryTriggerInteraction.Ignore)) safe += slide;
                    move = safe;
                    Blocked = true;
                    if (!Grabbed) { vx *= 0.3f; vz *= 0.3f; }
                }
            }
            if (Grabbed) Physics.IgnoreCollision(playerCollider, body, !Blocked);
            float newYaw = Mathf.MoveTowardsAngle(yaw, targetYaw, Blocked ? 40f * dt : 360f * dt);
            yawRate = Mathf.DeltaAngle(lastYaw, newYaw) * Mathf.Deg2Rad / dt;
            lastYaw = newYaw;
            rb.MovePosition(pos + move);
            rb.MoveRotation(Quaternion.Euler(0, newYaw, 0));
            if (Grabbed) { vx = move.x / dt; vz = move.z / dt; }
            CartDynamics.UpdateWheels(vx, vz, newYaw * Mathf.Deg2Rad, yawRate, dt, ref caster, ref spin);
        }

        void LateUpdate()
        {
            float casterDeg = caster * Mathf.Rad2Deg, spinDeg = spin * Mathf.Rad2Deg;
            for (int i = 0; i < 2; i++) if (casters[i] != null) casters[i].localRotation = Quaternion.Euler(0, casterDeg, 0);
            for (int i = 0; i < 4; i++) if (wheels[i] != null) wheels[i].localRotation = Quaternion.Euler(spinDeg, 0, 0);
            var cam = Camera.main;
            bool near = cam != null && (cam.transform.position - transform.position).sqrMagnitude < 9f;
            foreach (var (info, pack) in contents) products.DrawSingle(info, near ? 1 : 2, ItemMatrix(info, pack));
        }

        Matrix4x4 ItemMatrix(ProductInfo info, PackedItem pack)
        {
            var local = BasketFloor + new Vector3(pack.X, pack.Y + 0.004f, pack.Z);
            var rot = pack.Lying ? Quaternion.Euler(0, 0, 90) : Quaternion.identity;
            // z etrafında +90°: ürünün +y ekseni −x'e yatar. Yatan ürünü ayak izinin ortasına
            // kaydır (+yükseklik/2) ve yarı genişliği kadar kaldır (taban sepete otursun).
            if (pack.Lying) local += new Vector3(info.Size.y / 2f, info.Size.x / 2f, 0);
            return transform.localToWorldMatrix * Matrix4x4.TRS(local, rot, Vector3.one);
        }

        /** Sepet içeriğini sunucu sepetinden kurar (sıra: satır sırası, adet kadar kopya). */
        public void SetContents(CartDto cart)
        {
            contents.Clear();
            var items = new List<PackItem>();
            var infos = new List<ProductInfo>();
            if (cart != null)
                foreach (var line in cart.Lines)
                {
                    if (!products.ByStoreProduct.TryGetValue(line.StoreProductId, out var info)) continue;
                    for (int q = 0; q < line.Quantity; q++)
                    {
                        items.Add(new PackItem { Key = info.Dto.Id, W = info.Size.x, H = info.Size.y, D = info.Size.z });
                        infos.Add(info);
                    }
                }
            var packed = CartPacking.Pack(items, out float ratio);
            VolumeRatio = ratio;
            for (int i = 0; i < packed.Count; i++) contents.Add((infos[i], packed[i]));
        }

        /** Bir sonraki ürünün sepet içindeki hedef noktası (dünya) — uçuş animasyonu için. */
        public Vector3 NextSlotWorld(ProductInfo info)
        {
            var items = new List<PackItem>();
            foreach (var (ci, _) in contents) items.Add(new PackItem { Key = ci.Dto.Id, W = ci.Size.x, H = ci.Size.y, D = ci.Size.z });
            items.Add(new PackItem { Key = info.Dto.Id, W = info.Size.x, H = info.Size.y, D = info.Size.z });
            var packed = CartPacking.Pack(items, out _);
            var p = packed[packed.Count - 1];
            return transform.TransformPoint(BasketFloor + new Vector3(p.X, p.Y, p.Z));
        }

        public Quaternion Rotation => transform.rotation;
    }
}
