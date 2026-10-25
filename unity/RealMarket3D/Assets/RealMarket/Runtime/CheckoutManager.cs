using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using RealMarket.Core;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Kasa alanı algılama ve demo ödeme akışı: kasa şeridine girince ipucu, Enter/“Öde” ile
     * sunucudan teklif (quote), onayla demo ödeme (expectedTotalKurus ile fiyat değişimi koruması),
     * fiş gösterimi ve yeni alışveriş oturumu. Gerçek ödeme sağlayıcısı yoktur (paymentMethod=demo).
     */
    public class CheckoutManager : MonoBehaviour
    {
        GameManager game;
        List<CheckoutLaneDto> lanes = new List<CheckoutLaneDto>();
        public CheckoutLaneDto CurrentLane { get; private set; }
        public CartDto Quote { get; private set; }
        public OrderDto LastOrder { get; private set; }
        bool busy;

        public void Init(GameManager g, LayoutDto layout)
        {
            game = g;
            lanes = layout.Checkouts ?? new List<CheckoutLaneDto>();
        }

        void Update()
        {
            if (game == null || !game.Ready) return;
            var p = game.Player.transform.position;
            CheckoutLaneDto lane = null;
            foreach (var l in lanes) if (l.Zone != null && l.Zone.Contains(p.x, p.z, 0.3f)) { lane = l; break; }
            if (lane != CurrentLane)
            {
                CurrentLane = lane;
                game.UI.ShowCheckoutHint(lane != null && game.Flow.State == FlowState.Shopping, game.LastCart?.ItemCount ?? 0);
            }
            if (CurrentLane != null && game.Flow.State == FlowState.Shopping && InputAdapter.Down(Act.Checkout)) _ = Begin();
        }

        public async Task Begin()
        {
            if (busy) return;
            if ((game.LastCart?.ItemCount ?? 0) == 0) { game.UI.Toast("Sepetiniz boş"); return; }
            busy = true;
            try
            {
                Quote = await game.Api.Quote(game.Session.Current);
                game.Flow.Enter(FlowState.Checkout);
                game.UI.ShowCheckout(Quote);
                game.Bridge.Emit(BridgeEvents.CheckoutStarted, new Dictionary<string, object> { ["totalKurus"] = Quote.TotalKurus, ["itemCount"] = Quote.ItemCount });
                game.Audio.Play(SoundKind.Beep, game.Player.transform.position);
            }
            catch (Exception e) { game.UI.Toast("Ödeme başlatılamadı: " + e.Message); }
            finally { busy = false; }
        }

        public async Task Pay()
        {
            if (busy || Quote == null) return;
            busy = true;
            try
            {
                LastOrder = await game.Api.Pay(game.Session.Current, Quote.TotalKurus);
                game.Inventory.ForgetPurchased();
                game.UI.ShowReceipt(LastOrder);
                game.Flow.Enter(FlowState.Receipt);
                game.Bridge.Emit(BridgeEvents.OrderCompleted, new Dictionary<string, object>
                {
                    ["orderId"] = LastOrder.Id, ["orderNumber"] = LastOrder.OrderNumber, ["totalKurus"] = LastOrder.TotalKurus,
                });
                game.Audio.Play(SoundKind.Register, game.Player.transform.position);
                // satın alınan ürünler raftan düşmüş kalır; yeni oturum boş sepetle başlar
                await game.Session.StartNew();
                game.ApplyCart(new CartDto { SessionId = game.Session.Current.SessionId, Status = "active" });
            }
            catch (ApiException e) when (e.Code == "PRICE_CHANGED")
            {
                game.UI.Toast("Tutar değişti, sepet yeniden hesaplanıyor");
                Quote = await game.Api.Quote(game.Session.Current);
                game.UI.ShowCheckout(Quote);
            }
            catch (Exception e) { game.UI.Toast("Ödeme başarısız: " + e.Message); }
            finally { busy = false; }
        }

        public void Cancel()
        {
            Quote = null;
            game.UI.HideCheckout();
            game.Flow.Enter(FlowState.Shopping);
        }
    }
}
