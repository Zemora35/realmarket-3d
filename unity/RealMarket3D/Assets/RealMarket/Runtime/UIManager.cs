using System;
using System.Collections.Generic;
using System.Text;
using RealMarket.Core;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem.UI;
#endif

namespace RealMarket.Runtime
{
    /**
     * Oyun içi arayüz (UGUI, tamamı kodla kurulur — prefab/sahne bağımlılığı yok):
     * yükleme ekranı, nişangâh, ürün kartı, inceleme paneli, sepet paneli, kasa/ödeme/fiş,
     * bildirimler, kalite düğmesi ve dokunmatik cihazlarda joystick + eylem düğmeleri.
     */
    public class UIManager : MonoBehaviour
    {
        static Font font;
        public static Font DefaultFont => font != null ? font : (font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));

        static readonly Color Ink = new Color(0.07f, 0.09f, 0.13f, 0.86f);
        static readonly Color Accent = new Color(0.11f, 0.3f, 0.85f, 1f);
        static readonly Color Good = new Color(0.09f, 0.55f, 0.3f, 1f);
        static readonly Color Muted = new Color(0.78f, 0.82f, 0.88f, 1f);

        GameManager game;
        RectTransform canvas;
        GameObject loading, crosshair, hover, inspect, cartPanel, checkoutHint, checkout, receipt, mobile, help, errorPanel;
        Text loadingText, hoverText, inspectText, cartText, cartSummary, checkoutText, receiptText, toastText, qualityLabel, hintText, errorText, statsText;
        Image loadingBar;
        RectTransform cartLines;
        float toastUntil;
        public bool ShowStats;

        public void Init(GameManager g)
        {
            game = g;
            var cgo = new GameObject("UI", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            cgo.transform.SetParent(transform, false);
            var c = cgo.GetComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = 10;
            var scaler = cgo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1600, 900);
            scaler.matchWidthOrHeight = 0.5f;
            canvas = (RectTransform)cgo.transform;
            if (FindAnyObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem));
#if ENABLE_INPUT_SYSTEM
                es.AddComponent<InputSystemUIInputModule>();
#else
                es.AddComponent<StandaloneInputModule>();
#endif
                es.transform.SetParent(transform, false);
            }
            Build();
        }

        // ---- yardımcılar -------------------------------------------------------------------

        static RectTransform Node(Transform parent, string name, Vector2 aMin, Vector2 aMax, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = aMin; rt.anchorMax = aMax; rt.pivot = pivot;
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            return rt;
        }

        static Image Panel(Transform parent, string name, Vector2 aMin, Vector2 aMax, Vector2 pivot, Vector2 pos, Vector2 size, Color color)
        {
            var rt = Node(parent, name, aMin, aMax, pivot, pos, size);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = color;
            return img;
        }

        static Text Label(Transform parent, string text, int size, TextAnchor align, Color color, Vector2? inset = null)
        {
            var rt = Node(parent, "Text", Vector2.zero, Vector2.one, new Vector2(0.5f, 0.5f), Vector2.zero, -(inset ?? new Vector2(24, 16)) * 2f);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = DefaultFont; t.fontSize = size; t.alignment = align; t.color = color; t.text = text;
            t.horizontalOverflow = HorizontalWrapMode.Wrap; t.verticalOverflow = VerticalWrapMode.Overflow;
            t.supportRichText = true;
            t.raycastTarget = false;
            return t;
        }

        static Button Btn(Transform parent, string label, Vector2 aMin, Vector2 aMax, Vector2 pivot, Vector2 pos, Vector2 size, Color color, Action onClick)
        {
            var img = Panel(parent, "Btn-" + label, aMin, aMax, pivot, pos, size, color);
            var b = img.gameObject.AddComponent<Button>();
            b.onClick.AddListener(() => onClick());
            Label(img.transform, label, 20, TextAnchor.MiddleCenter, Color.white, new Vector2(6, 4));
            return b;
        }

        static readonly Vector2 C = new Vector2(0.5f, 0.5f);

        void Build()
        {
            var lockArea = Panel(canvas, "PointerLockArea", Vector2.zero, Vector2.one, C, Vector2.zero, Vector2.zero, new Color(0, 0, 0, 0));
            lockArea.gameObject.AddComponent<PointerLockArea>().Clicked = () => game.Flow.TryLockPointer();

            crosshair = Panel(canvas, "Crosshair", C, C, C, Vector2.zero, new Vector2(6, 6), new Color(1, 1, 1, 0.9f)).gameObject;
            crosshair.GetComponent<Image>().raycastTarget = false;

            // üst çubuk: sepet özeti + kalite
            var top = Panel(canvas, "TopBar", new Vector2(0, 1), new Vector2(0, 1), new Vector2(0, 1), new Vector2(16, -16), new Vector2(520, 56), Ink);
            cartSummary = Label(top.transform, "Sepet boş", 22, TextAnchor.MiddleLeft, Color.white, new Vector2(16, 6));
            Btn(top.transform, "Sepet", new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-8, 0), new Vector2(110, 42), Accent, () => ToggleCart());
            var q = Btn(canvas, "Kalite", new Vector2(1, 1), new Vector2(1, 1), new Vector2(1, 1), new Vector2(-16, -16), new Vector2(200, 48), Ink, () => game.Quality.Cycle());
            qualityLabel = q.GetComponentInChildren<Text>();
            statsText = Label(Node(canvas, "Stats", new Vector2(1, 1), new Vector2(1, 1), new Vector2(1, 1), new Vector2(-16, -70), new Vector2(320, 120)), "", 15, TextAnchor.UpperRight, Muted, new Vector2(0, 0));

            hover = Panel(canvas, "HoverCard", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 150), new Vector2(560, 120), Ink).gameObject;
            hoverText = Label(hover.transform, "", 22, TextAnchor.MiddleLeft, Color.white);
            hover.GetComponent<Image>().raycastTarget = false;
            hover.SetActive(false);

            inspect = Panel(canvas, "Inspect", new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-16, 0), new Vector2(420, 460), Ink).gameObject;
            inspectText = Label(Node(inspect.transform, "Body", new Vector2(0, 0), new Vector2(1, 1), C, new Vector2(0, 50), new Vector2(0, -100)), "", 21, TextAnchor.UpperLeft, Color.white);
            Btn(inspect.transform, "Arabaya koy (G)", new Vector2(0, 0), new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(16, 16), new Vector2(-24, 56), Good, () => game.Interaction.AddHeldToCart());
            Btn(inspect.transform, "Rafa bırak (R)", new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(1, 0), new Vector2(-16, 16), new Vector2(-24, 56), new Color(0.35f, 0.38f, 0.45f), () => game.Interaction.ReturnHeld());
            inspect.SetActive(false);

            cartPanel = Panel(canvas, "Cart", new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(16, 0), new Vector2(520, 620), Ink).gameObject;
            Label(Node(cartPanel.transform, "Title", new Vector2(0, 1), new Vector2(1, 1), new Vector2(0.5f, 1), Vector2.zero, new Vector2(0, 60)), "<b>Sepetim</b>", 26, TextAnchor.MiddleLeft, Color.white);
            cartLines = Node(cartPanel.transform, "Lines", new Vector2(0, 0), new Vector2(1, 1), new Vector2(0.5f, 1), new Vector2(0, -60), new Vector2(-24, -200));
            var vl = cartLines.gameObject.AddComponent<VerticalLayoutGroup>();
            vl.spacing = 6; vl.childForceExpandHeight = false; vl.childControlHeight = false; vl.childControlWidth = true;
            cartText = Label(Node(cartPanel.transform, "Totals", new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 76), new Vector2(0, 70)), "", 22, TextAnchor.MiddleLeft, Color.white);
            Btn(cartPanel.transform, "Kapat (Tab)", new Vector2(0, 0), new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(16, 16), new Vector2(-24, 52), new Color(0.35f, 0.38f, 0.45f), () => ToggleCart());
            Btn(cartPanel.transform, "Kasaya git", new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(1, 0), new Vector2(-16, 16), new Vector2(-24, 52), Accent, () => { ToggleCart(); game.GoToCheckout(); });
            cartPanel.SetActive(false);

            checkoutHint = Panel(canvas, "CheckoutHint", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 290), new Vector2(520, 64), Accent).gameObject;
            var hintBtn = checkoutHint.AddComponent<Button>();
            hintBtn.onClick.AddListener(() => _ = game.Checkout.Begin());
            hintText = Label(checkoutHint.transform, "Ödeme için Enter", 22, TextAnchor.MiddleCenter, Color.white);
            checkoutHint.SetActive(false);

            checkout = Panel(canvas, "Checkout", C, C, C, Vector2.zero, new Vector2(620, 640), Ink).gameObject;
            checkoutText = Label(Node(checkout.transform, "Body", Vector2.zero, Vector2.one, C, new Vector2(0, 40), new Vector2(0, -80)), "", 21, TextAnchor.UpperLeft, Color.white);
            Btn(checkout.transform, "Vazgeç", new Vector2(0, 0), new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(16, 16), new Vector2(-24, 56), new Color(0.35f, 0.38f, 0.45f), () => game.Checkout.Cancel());
            Btn(checkout.transform, "Demo ödeme ile öde", new Vector2(0.5f, 0), new Vector2(1, 0), new Vector2(1, 0), new Vector2(-16, 16), new Vector2(-24, 56), Good, () => _ = game.Checkout.Pay());
            checkout.SetActive(false);

            receipt = Panel(canvas, "Receipt", C, C, C, Vector2.zero, new Vector2(560, 600), new Color(0.98f, 0.98f, 0.96f, 0.97f)).gameObject;
            receiptText = Label(Node(receipt.transform, "Body", Vector2.zero, Vector2.one, C, new Vector2(0, 40), new Vector2(0, -80)), "", 20, TextAnchor.UpperLeft, new Color(0.1f, 0.1f, 0.1f));
            Btn(receipt.transform, "Alışverişe devam", new Vector2(0, 0), new Vector2(1, 0), new Vector2(0.5f, 0), new Vector2(0, 16), new Vector2(-32, 56), Accent, () => { receipt.SetActive(false); game.Flow.Enter(FlowState.Shopping); });
            receipt.SetActive(false);

            var toast = Node(canvas, "Toast", new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -90), new Vector2(700, 60));
            toastText = Label(toast, "", 24, TextAnchor.MiddleCenter, Color.white);
            toastText.gameObject.AddComponent<Outline>().effectColor = new Color(0, 0, 0, 0.8f);

            help = Label(Node(canvas, "Help", new Vector2(0, 0), new Vector2(0, 0), new Vector2(0, 0), new Vector2(16, 12), new Vector2(900, 40)),
                "Tıkla: fareyi kilitle · WASD yürü · Shift koş · E al/incele · G arabaya koy · R rafa bırak · C arabayı tut · Tab sepet · B salınım · F2 kalite",
                16, TextAnchor.LowerLeft, Muted, Vector2.zero).gameObject;

            BuildMobile();

            errorPanel = Panel(canvas, "Error", Vector2.zero, Vector2.one, C, Vector2.zero, Vector2.zero, new Color(0.05f, 0.06f, 0.09f, 0.96f)).gameObject;
            errorText = Label(errorPanel.transform, "", 24, TextAnchor.MiddleCenter, Color.white, new Vector2(120, 140));
            Btn(errorPanel.transform, "Yeniden dene", new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(0, 120), new Vector2(260, 60), Accent, () => { errorPanel.SetActive(false); game.Restart(); });
            errorPanel.SetActive(false);

            loading = Panel(canvas, "Loading", Vector2.zero, Vector2.one, C, Vector2.zero, Vector2.zero, new Color(0.06f, 0.08f, 0.12f, 1f)).gameObject;
            Label(Node(loading.transform, "Title", C, C, C, new Vector2(0, 80), new Vector2(900, 80)), "<b>RealMarket 3D</b>", 48, TextAnchor.MiddleCenter, Color.white, Vector2.zero);
            loadingText = Label(Node(loading.transform, "Status", C, C, C, new Vector2(0, -10), new Vector2(900, 60)), "Başlatılıyor…", 22, TextAnchor.MiddleCenter, Muted, Vector2.zero);
            var barBg = Panel(loading.transform, "Bar", C, C, C, new Vector2(0, -60), new Vector2(520, 10), new Color(1, 1, 1, 0.15f));
            loadingBar = Panel(barBg.transform, "Fill", new Vector2(0, 0), new Vector2(0, 1), new Vector2(0, 0.5f), Vector2.zero, Vector2.zero, Accent);
        }

        void BuildMobile()
        {
            mobile = Node(canvas, "Mobile", Vector2.zero, Vector2.one, C, Vector2.zero, Vector2.zero).gameObject;
            var look = Panel(mobile.transform, "LookArea", new Vector2(0.45f, 0), new Vector2(1, 0.85f), C, Vector2.zero, Vector2.zero, new Color(0, 0, 0, 0));
            look.gameObject.AddComponent<LookArea>();
            var pad = Panel(mobile.transform, "Joystick", new Vector2(0, 0), new Vector2(0, 0), C, new Vector2(170, 170), new Vector2(220, 220), new Color(1, 1, 1, 0.12f));
            var knob = Panel(pad.transform, "Knob", C, C, C, Vector2.zero, new Vector2(90, 90), new Color(1, 1, 1, 0.45f));
            knob.raycastTarget = false;
            var js = pad.gameObject.AddComponent<VirtualJoystick>();
            js.Knob = knob.rectTransform;
            js.Radius = 80;
            void ActBtn(string label, Act a, Vector2 pos, Color col)
            {
                var img = Panel(mobile.transform, "Act-" + label, new Vector2(1, 0), new Vector2(1, 0), C, pos, new Vector2(124, 124), col);
                img.gameObject.AddComponent<ActionButton>().Action = a;
                Label(img.transform, label, 22, TextAnchor.MiddleCenter, Color.white, new Vector2(4, 4));
            }
            ActBtn("Al", Act.Interact, new Vector2(-110, 130), new Color(0.11f, 0.3f, 0.85f, 0.8f));
            ActBtn("Rafa", Act.ReturnItem, new Vector2(-250, 90), new Color(0.35f, 0.38f, 0.45f, 0.8f));
            ActBtn("Araba", Act.GrabCart, new Vector2(-110, 280), new Color(0.85f, 0.15f, 0.2f, 0.8f));
            ActBtn("Öde", Act.Checkout, new Vector2(-250, 240), new Color(0.09f, 0.55f, 0.3f, 0.8f));
            mobile.SetActive(InputAdapter.IsTouchDevice);
        }

        // ---- durumlar ----------------------------------------------------------------------

        public void SetLoading(string text, float progress)
        {
            loading.SetActive(progress < 1f);
            loadingText.text = text;
            loadingBar.rectTransform.anchorMax = new Vector2(Mathf.Clamp01(progress), 1);
        }

        public void ShowError(string message)
        {
            loading.SetActive(false);
            errorPanel.SetActive(true);
            errorText.text = "<b>Mağaza yüklenemedi</b>\n\n" + message + "\n\nAPI sunucusunun çalıştığından ve adresin doğru olduğundan emin olun.";
        }

        public void Toast(string text, float seconds = 2.6f)
        {
            toastText.text = text;
            toastUntil = Time.unscaledTime + seconds;
        }

        static string ProductLines(ProductInfo p, int remaining)
        {
            var d = p.Dto;
            var sb = new StringBuilder();
            sb.Append("<b>").Append(d.Name).Append("</b>\n");
            sb.Append(d.Brand);
            if (d.NetWeightG.HasValue) sb.Append(" · ").Append(d.NetWeightG.Value).Append(" g");
            if (d.VolumeMl.HasValue) sb.Append(" · ").Append(d.VolumeMl.Value).Append(" ml");
            sb.Append("\n<size=26><b>").Append(Money.FormatTl(d.PriceKurus)).Append("</b></size>");
            if (d.ListPriceKurus.HasValue && d.ListPriceKurus.Value > d.PriceKurus) sb.Append("  <color=#9aa3b2>").Append(Money.FormatTl(d.ListPriceKurus.Value)).Append("</color>");
            if (d.Promotion != null && !string.IsNullOrEmpty(d.Promotion.Label)) sb.Append("\n<color=#ffcf3f>").Append(d.Promotion.Label).Append("</color>");
            sb.Append("\n<color=#9aa3b2>Stok: ").Append(remaining).Append("</color>");
            return sb.ToString();
        }

        public void ShowHover(ProductInfo p, int remaining)
        {
            hover.SetActive(p != null && game.Flow.State == FlowState.Shopping);
            if (p == null) return;
            hoverText.text = ProductLines(p, remaining) + (InputAdapter.IsTouchDevice ? "   <color=#9aa3b2>[Al]</color>" : "   <color=#9aa3b2>[E] incele</color>");
        }

        public void ShowInspect(ProductInfo p, int remaining)
        {
            hover.SetActive(false);
            inspect.SetActive(true);
            var d = p.Dto;
            var sb = new StringBuilder(ProductLines(p, remaining));
            sb.Append("\n\n<color=#9aa3b2>Barkod: ").Append(d.Gtin).Append("\nKategori: ").Append(d.Subcategory ?? d.Category);
            if (d.Dimensions != null) sb.Append($"\nBoyut: {d.Dimensions.WidthMm:0}×{d.Dimensions.HeightMm:0}×{d.Dimensions.DepthMm:0} mm{(d.Dimensions.Verified ? "" : " (tahmini)")}");
            if (d.IsDemo) sb.Append("\nDemo ürün verisi");
            sb.Append("\n\nSürükle: döndür · Tekerlek: yakınlaştır</color>");
            inspectText.text = sb.ToString();
        }

        public void HideInspect() => inspect.SetActive(false);

        public void ToggleCart()
        {
            bool open = !cartPanel.activeSelf;
            if (open && game.Flow.State != FlowState.Shopping) return;
            cartPanel.SetActive(open);
            game.Flow.Enter(open ? FlowState.CartPanel : FlowState.Shopping);
            if (open) RenderCartLines(game.LastCart);
        }

        public void UpdateCart(CartDto cart)
        {
            int n = cart?.ItemCount ?? 0;
            cartSummary.text = n == 0 ? "Sepet boş" : $"Sepet: <b>{n}</b> ürün · <b>{Money.FormatTl(cart.TotalKurus)}</b>";
            if (cartPanel.activeSelf) RenderCartLines(cart);
        }

        void RenderCartLines(CartDto cart)
        {
            for (int i = cartLines.childCount - 1; i >= 0; i--) Destroy(cartLines.GetChild(i).gameObject);
            if (cart == null || cart.Lines.Count == 0)
            {
                cartText.text = "Sepetiniz boş. Raftan ürün alıp G ile arabaya koyun.";
                return;
            }
            foreach (var line in cart.Lines)
            {
                var row = Panel(cartLines, "Line", new Vector2(0, 1), new Vector2(1, 1), new Vector2(0.5f, 1), Vector2.zero, new Vector2(0, 58), new Color(1, 1, 1, 0.06f));
                row.gameObject.AddComponent<LayoutElement>().preferredHeight = 58;
                Label(Node(row.transform, "Name", new Vector2(0, 0), new Vector2(0.62f, 1), C, Vector2.zero, Vector2.zero), $"{line.Name}\n<color=#9aa3b2>{line.Quantity} × {Money.FormatTl(line.UnitPriceKurus)}</color>", 17, TextAnchor.MiddleLeft, Color.white, new Vector2(10, 2));
                Label(Node(row.transform, "Total", new Vector2(0.62f, 0), new Vector2(0.8f, 1), C, Vector2.zero, Vector2.zero), Money.FormatTl(line.LineTotalKurus), 17, TextAnchor.MiddleRight, Color.white, new Vector2(4, 2));
                string sp = line.StoreProductId;
                Btn(row.transform, "−", new Vector2(0.82f, 0.5f), new Vector2(0.82f, 0.5f), new Vector2(0, 0.5f), Vector2.zero, new Vector2(40, 40), new Color(0.6f, 0.2f, 0.2f), () => _ = game.RemoveFromCart(sp));
                Btn(row.transform, "+", new Vector2(0.91f, 0.5f), new Vector2(0.91f, 0.5f), new Vector2(0, 0.5f), Vector2.zero, new Vector2(40, 40), Good, () => _ = game.AddOneByStoreProduct(sp));
            }
            cartText.text = $"Ara toplam: {Money.FormatTl(cart.SubtotalKurus)}" + (cart.DiscountKurus > 0 ? $"   İndirim: −{Money.FormatTl(cart.DiscountKurus)}" : "") + $"\n<b>Toplam: {Money.FormatTl(cart.TotalKurus)}</b>";
        }

        public void ShowCheckoutHint(bool show, int items)
        {
            checkoutHint.SetActive(show);
            hintText.text = items > 0 ? (InputAdapter.IsTouchDevice ? "Kasa — ödemek için dokunun" : "Kasa — ödemek için Enter") : "Kasa — sepetiniz boş";
        }

        public void ShowCheckout(CartDto quote)
        {
            checkoutHint.SetActive(false);
            checkout.SetActive(true);
            var sb = new StringBuilder("<b><size=28>Ödeme</size></b>\n\n");
            foreach (var l in quote.Lines)
            {
                sb.Append(l.Quantity).Append(" × ").Append(l.Name).Append("   ").Append(Money.FormatTl(l.LineTotalKurus));
                if (l.DiscountKurus > 0) sb.Append("  <color=#ffcf3f>(−").Append(Money.FormatTl(l.DiscountKurus)).Append(")</color>");
                sb.Append('\n');
            }
            sb.Append("\nAra toplam: ").Append(Money.FormatTl(quote.SubtotalKurus));
            if (quote.DiscountKurus > 0) sb.Append("\nİndirim: −").Append(Money.FormatTl(quote.DiscountKurus));
            sb.Append("\n<size=28><b>Toplam: ").Append(Money.FormatTl(quote.TotalKurus)).Append("</b></size>");
            sb.Append("\n\n<color=#9aa3b2>Demo ödeme: gerçek para çekilmez.</color>");
            checkoutText.text = sb.ToString();
        }

        public void HideCheckout() => checkout.SetActive(false);

        public void ShowReceipt(OrderDto order)
        {
            checkout.SetActive(false);
            receipt.SetActive(true);
            var sb = new StringBuilder("<b><size=28>RealMarket Demo</size></b>\n");
            sb.Append("Fiş no: ").Append(order.OrderNumber).Append('\n').Append(order.CreatedAt).Append("\n\n");
            foreach (var i in order.Items) sb.Append(i.Quantity).Append(" × ").Append(i.Name).Append("   ").Append(Money.FormatTl(i.LineTotalKurus)).Append('\n');
            sb.Append("\nAra toplam: ").Append(Money.FormatTl(order.SubtotalKurus));
            if (order.DiscountKurus > 0) sb.Append("\nİndirim: −").Append(Money.FormatTl(order.DiscountKurus));
            sb.Append("\n<b>Toplam: ").Append(Money.FormatTl(order.TotalKurus)).Append("</b>\n\nÖdeme: ").Append(order.PaymentProvider).Append(" (demo)\nTeşekkür ederiz!");
            receiptText.text = sb.ToString();
        }

        public void SetQualityLabel(QualityProfile p, bool auto) => qualityLabel.text = "Kalite: " + p.Label + (auto ? " (oto)" : "");

        void Update()
        {
            if (toastText != null)
            {
                float a = Mathf.Clamp01((toastUntil - Time.unscaledTime) * 3f);
                toastText.color = new Color(1, 1, 1, a);
            }
            if (game == null || !game.Ready) return;
            var st = game.Flow.State;
            crosshair.SetActive(st == FlowState.Shopping);
            if (help != null) help.SetActive(!InputAdapter.IsTouchDevice && st == FlowState.Shopping);
            if (mobile != null && mobile.activeSelf != (InputAdapter.IsTouchDevice && (st == FlowState.Shopping || st == FlowState.Inspecting))) mobile.SetActive(!mobile.activeSelf);
            if (InputAdapter.Down(Act.ToggleCart) && (st == FlowState.Shopping || st == FlowState.CartPanel)) ToggleCart();
            if (ShowStats || Application.isEditor)
                statsText.text = $"{game.Quality.AverageFps:0} fps · {game.Products.DrawnInstances} ürün · {game.Products.DrawCalls} çağrı\nmodel: {game.Streaming.Loaded} yüklü, {game.Streaming.Pending} sırada";
        }
    }
}
