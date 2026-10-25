using System;
using System.Collections.Generic;
using RealMarket.Core;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Nişangâhla ürün seçme, alma, inceleme (döndürme/yakınlaştırma), sepete atma ve rafa geri
     * koyma. Her birimin durumu RealMarket.Core.ItemStateMachine ile yönetilir; geçersiz geçişler
     * (çift tıklama, ağ yanıtı beklerken tekrar basma) reddedilir. Sunucu reddederse ürün rafa uçar.
     */
    public class ProductInteractionController : MonoBehaviour
    {
        public float Reach = 2.3f;
        public int Hovered { get; private set; } = -1;
        public int Held { get; private set; } = -1;
        public bool Inspecting => Held >= 0 && machine.Get(Held) == ItemState.Inspecting;
        public bool Busy => Held >= 0;
        public readonly ItemStateMachine machine = new ItemStateMachine();

        GameManager game;
        Quaternion userRot = Quaternion.identity;
        float zoom = 1f;
        readonly List<Flight> flights = new List<Flight>();

        class Flight
        {
            public int Unit; public ProductInfo Info; public Func<Matrix4x4> From; public Func<Matrix4x4> To;
            public float T, Duration; public Action Done; public float Arc;
        }

        public void Init(GameManager g) { game = g; }

        Camera Cam => game.Player.Cam;

        void Update()
        {
            if (game == null || !game.Ready) return;
            var sm = game.Flow;
            if (sm.State == FlowState.Shopping && !Busy)
            {
                int h = game.Shelves.Pick(Cam, Reach);
                if (h != Hovered)
                {
                    if (Hovered >= 0 && machine.Get(Hovered) == ItemState.Hovered) machine.Send(Hovered, ItemEvent.Unhover);
                    Hovered = h;
                    if (h >= 0) machine.Send(h, ItemEvent.Hover);
                    game.UI.ShowHover(h >= 0 ? game.InfoOf(h) : null, h >= 0 ? game.Remaining(game.InfoOf(h)) : 0);
                }
                if (Hovered >= 0 && (InputAdapter.Down(Act.Interact) || (InputAdapter.PrimaryClick() && Cursor.lockState == CursorLockMode.Locked)))
                    PickUp(Hovered);
            }
            else if (Inspecting)
            {
                Vector2 d = InputAdapter.DragDelta();
                userRot = Quaternion.AngleAxis(-d.x * 0.35f, Vector3.up) * Quaternion.AngleAxis(d.y * 0.35f, Vector3.right) * userRot;
                zoom = Mathf.Clamp(zoom - InputAdapter.Scroll() * 0.08f, 0.6f, 1.6f);
                if (InputAdapter.Down(Act.AddToCart) || InputAdapter.Down(Act.Interact)) AddHeldToCart();
                else if (InputAdapter.Down(Act.ReturnItem) || InputAdapter.Down(Act.Back)) ReturnHeld();
            }
            StepFlights(Time.deltaTime);
            if (Held >= 0 && machine.Get(Held) == ItemState.Inspecting)
            {
                var info = game.InfoOf(Held);
                game.Products.DrawSingle(info, 0, InspectPose(info));
            }
        }

        Matrix4x4 UnitPose(int unit)
        {
            var u = game.Shelves.Unit(unit);
            return Matrix4x4.TRS(ShelfManager.ToUnity(u.Position), Quaternion.Euler(0, u.YawDeg, 0), Vector3.one);
        }

        Matrix4x4 InspectPose(ProductInfo info)
        {
            var t = Cam.transform;
            float size = Mathf.Max(info.Size.x, Mathf.Max(info.Size.y, info.Size.z));
            float dist = (0.28f + size * 1.25f) * zoom;
            var rot = t.rotation * Quaternion.Euler(0, 180, 0) * userRot;
            var center = t.position + t.forward * dist;
            return Matrix4x4.TRS(center - rot * new Vector3(0, info.Size.y / 2f, 0), rot, Vector3.one);
        }

        public void PickUp(int unit)
        {
            if (Busy) return;
            var info = game.InfoOf(unit);
            if (info == null) return;
            if (machine.Get(unit) == ItemState.Idle) machine.Send(unit, ItemEvent.Hover);
            if (!machine.Send(unit, ItemEvent.Select) || !machine.Send(unit, ItemEvent.PickStart)) return;
            Held = unit;
            userRot = Quaternion.identity;
            zoom = 1f;
            game.Inventory.BeginTake(unit);
            game.Streaming.Request(info.Dto.Id, 0, 0f);
            game.Flow.Enter(FlowState.Inspecting);
            game.Audio.Play(SoundKind.Pick, ShelfManager.ToUnity(game.Shelves.Unit(unit).Position));
            Fly(unit, info, () => UnitPose(unit), () => InspectPose(info), 0.38f, 0.05f, () =>
            {
                machine.Send(unit, ItemEvent.PickDone);
                game.UI.ShowInspect(info, game.Remaining(info));
                game.Bridge.Emit(BridgeEvents.ProductSelected, new Dictionary<string, object>
                {
                    ["productId"] = info.Dto.Id, ["storeProductId"] = info.Dto.StoreProductId, ["name"] = info.Dto.Name,
                    ["gtin"] = info.Dto.Gtin, ["priceKurus"] = info.Dto.PriceKurus,
                });
            });
        }

        public async void AddHeldToCart()
        {
            int unit = Held;
            if (unit < 0 || !machine.Send(unit, ItemEvent.ToCart)) return;
            var info = game.InfoOf(unit);
            game.UI.HideInspect();
            game.Flow.Enter(FlowState.Shopping);
            bool cartNear = game.Cart != null && (game.Cart.transform.position - Cam.transform.position).sqrMagnitude < 36f;
            Vector3 target = cartNear ? game.Cart.NextSlotWorld(info) : Cam.transform.position + Cam.transform.forward * 0.3f - Vector3.up * 0.6f;
            Quaternion trot = cartNear ? game.Cart.Rotation : Cam.transform.rotation;
            var startPose = InspectPose(info);
            bool arrived = false, answered = false, ok = false;
            void Finish()
            {
                if (!arrived || !answered) return;
                if (ok)
                {
                    machine.Send(unit, ItemEvent.CartArrived);
                    machine.Clear(unit);
                    game.Inventory.CommitTake(unit);
                    game.ApplyCart(game.LastCart);
                    game.Audio.Play(SoundKind.CartDrop, target);
                }
                else
                {
                    machine.Send(unit, ItemEvent.CartRejected);
                    Fly(unit, info, () => Matrix4x4.TRS(target, trot, Vector3.one), () => UnitPose(unit), 0.5f, 0.15f, () =>
                    {
                        machine.Send(unit, ItemEvent.ShelfArrived);
                        game.Inventory.Release(unit);
                    });
                }
                if (Held == unit) Held = -1;
            }
            Fly(unit, info, () => startPose, () => Matrix4x4.TRS(target, trot, Vector3.one), cartNear ? 0.45f : 0.3f, 0.18f, () => { arrived = true; Finish(); }, hideAtEnd: true);
            ok = await game.AddToCart(info);
            answered = true;
            Finish();
        }

        public void ReturnHeld()
        {
            int unit = Held;
            if (unit < 0 || !machine.Send(unit, ItemEvent.ToShelf)) return;
            var info = game.InfoOf(unit);
            game.UI.HideInspect();
            game.Flow.Enter(FlowState.Shopping);
            var start = InspectPose(info);
            Fly(unit, info, () => start, () => UnitPose(unit), 0.4f, 0.04f, () =>
            {
                machine.Send(unit, ItemEvent.ShelfArrived);
                game.Inventory.Release(unit);
                game.Audio.Play(SoundKind.Place, ShelfManager.ToUnity(game.Shelves.Unit(unit).Position));
            });
            Held = -1;
        }

        /** Sepetten çıkarılan ürünün rafa uçuşu (yalnızca görsel). */
        public void AnimateCartToShelf(int unit)
        {
            if (unit < 0) return;
            var info = game.InfoOf(unit);
            var from = game.Cart != null ? game.Cart.transform.position + Vector3.up * 0.7f : Cam.transform.position;
            game.Shelves.SetTaken(unit, true);
            Fly(unit, info, () => Matrix4x4.TRS(from, Quaternion.identity, Vector3.one), () => UnitPose(unit), 0.55f, 0.2f, () => game.Shelves.SetTaken(unit, false));
        }

        void Fly(int unit, ProductInfo info, Func<Matrix4x4> from, Func<Matrix4x4> to, float duration, float arc, Action done, bool hideAtEnd = false)
        {
            flights.Add(new Flight { Unit = unit, Info = info, From = from, To = to, Duration = duration, Arc = arc, Done = done });
        }

        void StepFlights(float dt)
        {
            for (int i = flights.Count - 1; i >= 0; i--)
            {
                var f = flights[i];
                f.T = Mathf.Min(1f, f.T + dt / f.Duration);
                float e = f.T < 0.5f ? 4f * f.T * f.T * f.T : 1f - Mathf.Pow(-2f * f.T + 2f, 3f) / 2f;
                Matrix4x4 a = f.From(), b = f.To();
                Vector3 pa = a.GetColumn(3), pb = b.GetColumn(3);
                Vector3 p = Vector3.Lerp(pa, pb, e) + Vector3.up * (Mathf.Sin(e * Mathf.PI) * f.Arc);
                Quaternion r = Quaternion.Slerp(a.rotation, b.rotation, e);
                if (f.T < 1f) game.Products.DrawSingle(f.Info, 0, Matrix4x4.TRS(p, r, Vector3.one));
                if (f.T >= 1f)
                {
                    flights.RemoveAt(i);
                    f.Done?.Invoke();
                }
            }
        }

        public bool AnyFlight => flights.Count > 0;
    }
}
