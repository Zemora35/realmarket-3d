using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using RealMarket.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace RealMarket.Runtime
{
    /**
     * Uygulama giriş noktası (sahnedeki tek nesne; BuildScript kurar). Yöneticileri oluşturur,
     * yükleme sırasını yürütür ve sepet işlemlerini (API + raf + araba + köprü) tek yerde toplar.
     *
     * Yükleme: yapılandırma → sahne verisi (GET /api/stores/:id/scene) + model bildirimi →
     * mağaza/raf/ürün kurulumu → oyuncu + araba → kalite profili → oturum (sayfadan veya yerel) →
     * sepet uzlaştırması → SCENE_LOADED / SESSION_READY.
     */
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [SerializeField] MaterialLibrary materials;
        [SerializeField] Volume postVolume;

        public MaterialLibrary Materials => materials;
        public RuntimeConfig Config { get; private set; }
        public APIClient Api { get; private set; }
        public SceneManager Flow { get; private set; }
        public WebBridge Bridge { get; private set; }
        public UIManager UI { get; private set; }
        public MarketGenerator Market { get; private set; }
        public ShelfManager Shelves { get; private set; }
        public PlanogramManager Planogram { get; private set; }
        public ProductManager Products { get; private set; }
        public AssetStreamingManager Streaming { get; private set; }
        public InventoryManager Inventory { get; private set; }
        public CheckoutManager Checkout { get; private set; }
        public GraphicsQualityManager Quality { get; private set; }
        public UserSessionManager Session { get; private set; }
        public ProductInteractionController Interaction { get; private set; }
        public FirstPersonController Player { get; private set; }
        public ShoppingCartController Cart { get; private set; }
        public AudioManager Audio { get; private set; }
        public SceneDataDto Scene { get; private set; }
        public CartDto LastCart { get; private set; }
        public bool Ready { get; private set; }

        SessionDto pageSession;
        bool pageSessionReceived;

        void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            if (materials == null) materials = Resources.Load<MaterialLibrary>("RealMarketMaterials");
            Application.runInBackground = true;

            Bridge = new GameObject(WebBridge.ObjectName).AddComponent<WebBridge>();
            Bridge.transform.SetParent(transform, false);
            Bridge.Received += OnBridge;
            Flow = new SceneManager(this);
            UI = gameObject.AddComponent<UIManager>();
            Market = gameObject.AddComponent<MarketGenerator>();
            Shelves = gameObject.AddComponent<ShelfManager>();
            Products = gameObject.AddComponent<ProductManager>();
            Streaming = gameObject.AddComponent<AssetStreamingManager>();
            Checkout = gameObject.AddComponent<CheckoutManager>();
            Quality = gameObject.AddComponent<GraphicsQualityManager>();
            Interaction = gameObject.AddComponent<ProductInteractionController>();
            Audio = gameObject.AddComponent<AudioManager>();
            Planogram = new PlanogramManager();
        }

        void Start()
        {
            UI.Init(this);
            Bridge.AnnounceReady();
            _ = Boot();
        }

        async Task Boot()
        {
            try
            {
                Flow.Enter(FlowState.Loading);
                Config = RuntimeConfig.FromEnvironment();
                Config.Embedded = Bridge.Embedded;
                Api = new APIClient(Config.ApiBase);
                Session = new UserSessionManager(Api, Config.StoreId);
                Session.Ready += (s, isNew) => Bridge.Emit(BridgeEvents.SessionReady, new Dictionary<string, object>
                {
                    ["sessionId"] = s.SessionId, ["token"] = s.Token, ["storeId"] = s.StoreId, ["isNew"] = isNew,
                });

                UI.SetLoading("Mağaza verisi alınıyor…", 0.1f);
                Streaming.Init(Api, materials);
                var manifestTask = Streaming.LoadManifest();
                Scene = await Api.GetScene(Config.StoreId);
                await manifestTask;

                UI.SetLoading("Mağaza kuruluyor…", 0.4f);
                await Awaitable.NextFrameAsync();
                Market.Init(materials);
                Market.Generate(Scene);
                Planogram.Build(Scene);
                Products.Init(materials, Streaming);
                Shelves.Build(Scene);
                Products.Build(Scene, Shelves.Index);
                Shelves.BuildTags(Scene, Products);
                Planogram.Bind(Shelves.Index);
                Inventory = new InventoryManager(Shelves, Planogram, Products);
                Checkout.Init(this, Scene.Layout);
                Interaction.Init(this);

                UI.SetLoading("Oyuncu hazırlanıyor…", 0.6f);
                var sp = Scene.Layout.Spawn;
                var playerGo = new GameObject("Player", typeof(CharacterController));
                Player = playerGo.AddComponent<FirstPersonController>();
                Player.Init(new Vector3(sp.Position.X, 0.02f, sp.Position.Z), PlanogramMath.YawDegrees(sp.RotationY));
                var cs = Scene.Layout.CartSpawn ?? sp;
                var cartGo = new GameObject("ShoppingCart", typeof(Rigidbody));
                Cart = cartGo.AddComponent<ShoppingCartController>();
                Cart.Init(Player, Products, materials, new Vector3(cs.Position.X, 0, cs.Position.Z + 0.4f), PlanogramMath.YawDegrees(cs.RotationY));

                Quality.Init(this, postVolume);
                Quality.Changed += (p, auto) => UI.SetQualityLabel(p, auto);
                Quality.Apply(Quality.Initial(Config.Quality));

                UI.SetLoading("Alışveriş oturumu açılıyor…", 0.8f);
                if (Config.Embedded)
                {
                    // sayfa oturumu SET_SESSION ile gönderir; en fazla 1.5 sn beklenir
                    float until = Time.realtimeSinceStartup + 1.5f;
                    while (!pageSessionReceived && Time.realtimeSinceStartup < until) await Awaitable.NextFrameAsync();
                }
                var cart = await Session.Resume(pageSession);
                ApplyCart(cart);

                Ready = true;
                UI.SetLoading("Hazır", 1f);
                Flow.Enter(FlowState.Shopping);
                Bridge.Emit(BridgeEvents.SceneLoaded, new Dictionary<string, object>
                {
                    ["storeId"] = Scene.Store.Id, ["products"] = Scene.Products.Count, ["units"] = Shelves.Index.Units.Count,
                    ["quality"] = Quality.Profile.Tier.ToString(), ["models"] = Streaming.HasModel(Scene.Products[0].Id),
                });
                UI.Toast(InputAdapter.IsTouchDevice ? "Sol: yürü · Sağ: bak · Al: ürünü al" : "Başlamak için oyun alanına tıklayın");
            }
            catch (Exception e)
            {
                Debug.LogException(e);
                Flow.Enter(FlowState.Error);
                UI.ShowError(e.Message);
                Bridge.Emit(BridgeEvents.Error, new Dictionary<string, object> { ["message"] = e.Message, ["stage"] = "boot" });
            }
        }

        public void Restart() => UnityEngine.SceneManagement.SceneManager.LoadScene(0);

        void Update()
        {
            if (!Ready) return;
            var st = Flow.State;
            if (st == FlowState.Shopping)
            {
                if (InputAdapter.Down(Act.GrabCart))
                {
                    bool was = Cart.Grabbed;
                    bool now = Cart.ToggleGrab();
                    if (!was && !now) UI.Toast("Arabayı tutmak için sapına yaklaşın");
                }
                if (InputAdapter.Down(Act.ToggleHeadBob)) { Player.HeadBob = !Player.HeadBob; UI.Toast("Yürüme salınımı " + (Player.HeadBob ? "açık" : "kapalı")); }
            }
            else if (st == FlowState.Checkout && InputAdapter.Down(Act.Back)) Checkout.Cancel();
            else if (st == FlowState.CartPanel && InputAdapter.Down(Act.Back)) UI.ToggleCart();
            if (InputAdapter.Down(Act.CycleQuality)) Quality.Cycle();
            MobileInput.EndFrame();
        }

        // ---- sepet işlemleri ----------------------------------------------------------------

        public ProductInfo InfoOf(int unit)
        {
            var u = Shelves.Unit(unit);
            return u != null && Products.Products.TryGetValue(u.ProductId, out var p) ? p : null;
        }

        public int Remaining(ProductInfo p) => p == null ? 0 : Inventory.Remaining(p, LastCart);

        /** Sunucu sepetini tüm görünümlere uygular (raf uzlaştırma, araba içeriği, arayüz). */
        public void ApplyCart(CartDto cart)
        {
            if (cart == null) return;
            LastCart = cart;
            Inventory.Reconcile(cart);
            Cart.SetContents(cart);
            UI.UpdateCart(cart);
        }

        void EmitCart(string type, ProductInfo p, int quantity)
        {
            if (p != null)
                Bridge.Emit(type, new Dictionary<string, object> { ["productId"] = p.Dto.Id, ["storeProductId"] = p.Dto.StoreProductId, ["quantity"] = quantity });
            Bridge.Emit(BridgeEvents.CartUpdated, LastCart);
        }

        /** Raftan alınan ürün için: sunucu onayı. Raf/araba güncellemesini çağıran yapar (animasyon sonrası). */
        public async Task<bool> AddToCart(ProductInfo p)
        {
            try
            {
                LastCart = await Api.AddToCart(Session.Current, p.Dto.StoreProductId, 1);
                UI.UpdateCart(LastCart);
                EmitCart(BridgeEvents.AddToCart, p, 1);
                UI.Toast(p.Dto.Name + " sepete eklendi");
                return true;
            }
            catch (ApiException e)
            {
                UI.Toast(e.Code == "OUT_OF_STOCK" ? "Bu üründen yeterli stok yok" : "Sepete eklenemedi: " + e.Message);
                Audio.Play(SoundKind.Error, Player.transform.position);
                if (e.Code == "SESSION_CLOSED") await RecoverSession();
                return false;
            }
        }

        public async Task AddOneByStoreProduct(string storeProductId)
        {
            if (!Products.ByStoreProduct.TryGetValue(storeProductId, out var p)) return;
            try
            {
                ApplyCart(await Api.AddToCart(Session.Current, storeProductId, 1));
                EmitCart(BridgeEvents.AddToCart, p, 1);
            }
            catch (ApiException e) { UI.Toast("Eklenemedi: " + e.Message); }
        }

        public async Task RemoveFromCart(string storeProductId)
        {
            if (!Products.ByStoreProduct.TryGetValue(storeProductId, out var p)) return;
            try
            {
                var cart = await Api.RemoveFromCart(Session.Current, storeProductId, 1);
                int unit = Inventory.ReturnOne(p.Dto.Id);
                if (unit >= 0) Interaction.AnimateCartToShelf(unit);
                ApplyCart(cart);
                EmitCart(BridgeEvents.RemoveFromCart, p, 1);
            }
            catch (ApiException e) { UI.Toast("Çıkarılamadı: " + e.Message); }
        }

        async Task RecoverSession()
        {
            await Session.StartNew();
            ApplyCart(new CartDto { SessionId = Session.Current.SessionId, Status = "active" });
        }

        public async Task RefreshCart()
        {
            try
            {
                ApplyCart(await Api.GetCart(Session.Current));
                // sayfa (başka sekme/site değişikliği) rozetini ve mini sepeti güncel tutsun
                Bridge.Emit(BridgeEvents.CartUpdated, LastCart);
            }
            catch (ApiException e) when (!e.IsNetwork) { await RecoverSession(); }
        }

        /** Sepet panelinden “Kasaya git”: en yakın kasa şeridine ışınlanır (araba ile birlikte). */
        public void GoToCheckout()
        {
            var lanes = Scene.Layout.Checkouts;
            if (lanes == null || lanes.Count == 0) return;
            var p = Player.transform.position;
            CheckoutLaneDto best = lanes[0];
            float bd = float.MaxValue;
            foreach (var l in lanes)
            {
                float cx = (l.Zone.MinX + l.Zone.MaxX) / 2, cz = (l.Zone.MinZ + l.Zone.MaxZ) / 2;
                float d = (cx - p.x) * (cx - p.x) + (cz - p.z) * (cz - p.z);
                if (d < bd) { bd = d; best = l; }
            }
            Cart.Release();
            var target = new Vector3((best.Zone.MinX + best.Zone.MaxX) / 2, 0.02f, (best.Zone.MinZ + best.Zone.MaxZ) / 2);
            Player.Teleport(target, 0f);
            Cart.transform.position = target + new Vector3(0, 0, 1.1f);
        }

        // ---- köprü komutları ----------------------------------------------------------------

        void OnBridge(string type, JObject payload)
        {
            switch (type)
            {
                case BridgeEvents.SetSession:
                    var s = payload.ToObject<SessionDto>(Newtonsoft.Json.JsonSerializer.Create(Json.Settings));
                    if (!Ready) { pageSession = s; pageSessionReceived = true; return; }
                    if (s != null && Session.Current != null && s.SessionId != Session.Current.SessionId)
                    {
                        Session.Adopt(s);
                        _ = RefreshCart();
                    }
                    break;
                case BridgeEvents.CartUpdated:
                    if (Ready) _ = RefreshCart();
                    break;
                case BridgeEvents.AddToCart:
                    if (Ready) _ = AddOneByStoreProduct((string)payload["storeProductId"] ?? "");
                    break;
                case BridgeEvents.RemoveFromCart:
                    if (Ready) _ = RemoveFromCart((string)payload["storeProductId"] ?? "");
                    break;
                case BridgeEvents.SetQuality:
                    if (Ready && Enum.TryParse((string)payload["tier"] ?? "", true, out QualityTier t)) Quality.Apply(t, true);
                    break;
                case BridgeEvents.NavigateTo:
                    if (Ready) NavigateToProduct((string)payload["productId"] ?? "");
                    break;
                case BridgeEvents.DebugState:
                    if (Config != null && Config.Debug) EmitDebugState();
                    break;
                case BridgeEvents.DebugLook:
                    if (Ready && Config.Debug) Player.SetLook((float?)payload["yaw"] ?? Player.Yaw, (float?)payload["pitch"] ?? Player.Pitch);
                    break;
                case BridgeEvents.DebugAct:
                    if (Ready && Config.Debug && Enum.TryParse((string)payload["act"] ?? "", true, out Act act)) MobileInput.Press(act);
                    break;
            }
        }

        /**
         * Sayfadan "rafta gör": ürünün raftaki ilk birimine 1 m mesafeye ışınlar ve kamerayı ürüne
         * çevirir (nişangâh doğrudan üründe; E ile hemen alınabilir).
         */
        void NavigateToProduct(string productId)
        {
            int unit = -1;
            if (Shelves.Index.ByProduct.TryGetValue(productId, out var list))
                foreach (int i in list) if (!Shelves.Index.Units[i].Taken) { unit = i; break; }
            if (unit < 0) { UI.Toast("Bu ürün rafta kalmadı"); return; }
            var u = Shelves.Index.Units[unit];
            var center = ShelfManager.ToUnity(u.Position) + Vector3.up * u.Half.Y;
            var n = new Vector3(u.NormalX, 0, u.NormalZ);
            var stand = center + n * 1.0f;
            stand.y = 0.02f;
            float yaw = Mathf.Atan2(-n.x, -n.z) * Mathf.Rad2Deg;
            var dir = center - (stand + Vector3.up * Player.EyeHeight);
            float pitch = -Mathf.Atan2(dir.y, new Vector2(dir.x, dir.z).magnitude) * Mathf.Rad2Deg;
            Cart.Release();
            Player.Teleport(stand, yaw);
            Player.SetLook(yaw, pitch);
            Flow.Enter(FlowState.Shopping);
            UI.Toast("Ürünün rafındasınız");
        }

        /** Test durumu (yalnızca ?debug=1): akış, nişangâh, eldeki ürün, konum, performans, sepet. */
        void EmitDebugState()
        {
            var d = new Dictionary<string, object> { ["ready"] = Ready, ["flow"] = Flow.State.ToString() };
            if (Ready)
            {
                var hovered = Interaction.Hovered >= 0 ? InfoOf(Interaction.Hovered) : null;
                var held = Interaction.Held >= 0 ? InfoOf(Interaction.Held) : null;
                var pos = Player.transform.position;
                d["hoveredProductId"] = hovered?.Dto.Id ?? "";
                d["heldProductId"] = held?.Dto.Id ?? "";
                d["heldState"] = Interaction.Held >= 0 ? Interaction.machine.Get(Interaction.Held).ToString() : "";
                d["x"] = pos.x; d["z"] = pos.z; d["yaw"] = Player.Yaw; d["pitch"] = Player.Pitch;
                d["fps"] = Quality.AverageFps; d["quality"] = Quality.Profile.Tier.ToString();
                d["units"] = Shelves.Index.Units.Count; d["drawn"] = Products.DrawnInstances; d["drawCalls"] = Products.DrawCalls;
                d["modelsLoaded"] = Streaming.Loaded; d["modelsFailed"] = Streaming.Failed;
                d["cartItems"] = LastCart?.ItemCount ?? 0; d["cartTotalKurus"] = LastCart?.TotalKurus ?? 0;
                d["cartGrabbed"] = Cart.Grabbed; d["sessionId"] = Session.Current?.SessionId ?? "";
            }
            Bridge.Emit(BridgeEvents.DebugState, d);
        }
    }
}
