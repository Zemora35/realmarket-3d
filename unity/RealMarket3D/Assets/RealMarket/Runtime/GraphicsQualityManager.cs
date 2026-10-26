using System;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using RealMarket.Core;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace RealMarket.Runtime
{
    /**
     * Grafik profili (Düşük/Orta/Yüksek/Ultra) ve canlı geçiş: URP render ölçeği, MSAA,
     * gölge mesafesi, son işleme (Volume), SSAO renderer özelliği, ürün LOD mesafeleri.
     * Ortalama kare süresi hedefin belirgin altında kalırsa bir kademe otomatik düşürülür
     * (kullanıcı elle seçtiyse otomatik ayar kapanır).
     */
    public class GraphicsQualityManager : MonoBehaviour
    {
        public QualityProfile Profile { get; private set; } = QualityProfile.For(QualityTier.High);
        public bool AutoAdjust = true;
        public float AverageFps { get; private set; }
        public event Action<QualityProfile, bool> Changed; // profil, otomatik mi

        GameManager game;
        Volume volume;
        float accum; int frames; float lastChange;
        const string PrefKey = "realmarket.quality";

        public void Init(GameManager g, Volume postVolume)
        {
            game = g;
            volume = postVolume;
        }

        public QualityTier Initial(string requested)
        {
            if (Enum.TryParse(requested ?? "", true, out QualityTier t)) { AutoAdjust = false; return t; }
            if (PlayerPrefs.HasKey(PrefKey)) { AutoAdjust = false; return (QualityTier)Mathf.Clamp(PlayerPrefs.GetInt(PrefKey), 0, 3); }
            return QualityProfile.Recommend(Application.isMobilePlatform || InputAdapter.IsTouchDevice, SystemInfo.graphicsDeviceName, SystemInfo.systemMemorySize);
        }

        public void Apply(QualityTier tier, bool user = false)
        {
            Profile = QualityProfile.For(tier);
            if (user) { AutoAdjust = false; PlayerPrefs.SetInt(PrefKey, (int)tier); PlayerPrefs.Save(); }
            var urp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
            if (urp != null)
            {
                urp.renderScale = Profile.RenderScale;
                urp.msaaSampleCount = Profile.Msaa;
                urp.shadowDistance = Profile.Shadows ? Profile.ShadowDistance : 0f;
                urp.supportsHDR = Profile.Tier >= QualityTier.Medium;
                SetRendererFeature(urp, "SSAO", Profile.Ssao);
            }
            if (game.Market != null && game.Market.Sun != null) game.Market.Sun.shadows = Profile.Shadows ? LightShadows.Soft : LightShadows.None;
            if (volume != null) volume.enabled = Profile.PostProcessing;
            var cam = game.Player != null ? game.Player.Cam : null;
            if (cam != null)
            {
                var data = cam.GetUniversalAdditionalCameraData();
                data.renderPostProcessing = Profile.PostProcessing;
                data.antialiasing = Profile.Tier >= QualityTier.High ? AntialiasingMode.SubpixelMorphologicalAntiAliasing : Profile.Tier == QualityTier.Medium ? AntialiasingMode.FastApproximateAntialiasing : AntialiasingMode.None;
                cam.farClipPlane = Profile.MaxProductDistance + 40f;
            }
            game.Products.SetProfile(Profile);
            game.Shelves.TagVisibleDistance = Profile.Tier >= QualityTier.High ? 8f : 5f;
            Application.targetFrameRate = Profile.TargetFrameRate;
            lastChange = Time.unscaledTime;
            accum = 0; frames = 0;
            Changed?.Invoke(Profile, !user);
        }

        public void Cycle() => Apply((QualityTier)(((int)Profile.Tier + 1) % 4), true);

        /**
         * URP renderer özelliğini (ör. SSAO) adına göre aç/kapat. Renderer verisi BuildScript'in malzeme
         * kütüphanesine bağladığı referanstan alınır (URP sürümleri arasında değişen iç alanlara bağımlı
         * değil); bulunamazsa eski yansıma yoluna düşer.
         */
        void SetRendererFeature(UniversalRenderPipelineAsset urp, string nameContains, bool on)
        {
            try
            {
                var lists = new List<ScriptableRendererData>();
                var lib = game != null ? game.Materials : null;
                if (lib != null && lib.Renderer != null) lists.Add(lib.Renderer);
                else
                {
                    var field = typeof(UniversalRenderPipelineAsset).GetField("m_RendererDataList", BindingFlags.Instance | BindingFlags.NonPublic);
                    if (field?.GetValue(urp) is ScriptableRendererData[] arr) lists.AddRange(arr);
                }
                int changed = 0;
                foreach (var data in lists)
                {
                    if (data == null) continue;
                    foreach (var f in data.rendererFeatures)
                        if (f != null && (f.name.Contains(nameContains) || f.GetType().Name.Contains("AmbientOcclusion"))) { f.SetActive(on); changed++; }
                }
                if (changed == 0) Debug.LogWarning($"[RealMarket] renderer özelliği bulunamadı: {nameContains}");
            }
            catch (Exception e) { Debug.LogWarning("[RealMarket] renderer özelliği değiştirilemedi: " + e.Message); }
        }

        readonly List<float> window = new List<float>(512);
        int badWindows;
        float readySince = -1f;

        /**
         * Otomatik kalite: 2 sn'lik pencerede en yavaş %10'luk dilimin (p90) kare süresine bakar.
         * Ortalama tek seferlik takılmalardan bozuluyordu; ortanca ise ağır görünümlerdeki sürekli
         * yavaşlamayı hiç görmüyordu. Açılıştan sonraki 10 sn yok sayılır; iki pencere üst üste
         * hedefin belirgin altındaysa bir kademe iner.
         */
        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            accum += dt;
            frames++;
            window.Add(dt);
            if (accum < 2f) return;
            AverageFps = frames / accum;
            window.Sort();
            float p90Fps = 1f / Mathf.Max(1e-4f, window[Mathf.Min(window.Count - 1, window.Count * 9 / 10)]);
            accum = 0; frames = 0; window.Clear();
            if (game == null || !game.Ready || game.Flow.State != FlowState.Shopping) { badWindows = 0; return; }
            if (readySince < 0f) readySince = Time.unscaledTime;
            if (!AutoAdjust || Profile.Tier == QualityTier.Low || Time.unscaledTime - lastChange < 8f || Time.unscaledTime - readySince < 10f) return;
            badWindows = p90Fps < Profile.TargetFrameRate * 0.6f ? badWindows + 1 : 0;
            if (badWindows >= 2)
            {
                badWindows = 0;
                Debug.Log($"[RealMarket] p90 {p90Fps:0} fps → kalite düşürülüyor");
                Apply((QualityTier)((int)Profile.Tier - 1));
            }
        }
    }
}
