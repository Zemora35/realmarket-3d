using System;
using System.Collections;
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

        /** URP renderer özelliğini (ör. SSAO) adına göre aç/kapat. Liste iç alan olduğundan yansıma kullanılır. */
        static void SetRendererFeature(UniversalRenderPipelineAsset urp, string nameContains, bool on)
        {
            try
            {
                var field = typeof(UniversalRenderPipelineAsset).GetField("m_RendererDataList", BindingFlags.Instance | BindingFlags.NonPublic);
                if (!(field?.GetValue(urp) is ScriptableRendererData[] list)) return;
                foreach (var data in list)
                {
                    if (data == null) continue;
                    foreach (var f in data.rendererFeatures)
                        if (f != null && (f.name.Contains(nameContains) || f.GetType().Name.Contains("AmbientOcclusion"))) f.SetActive(on);
                }
            }
            catch (Exception e) { Debug.LogWarning("[RealMarket] renderer özelliği değiştirilemedi: " + e.Message); }
        }

        void Update()
        {
            accum += Time.unscaledDeltaTime;
            frames++;
            if (accum < 2f) return;
            AverageFps = frames / accum;
            accum = 0; frames = 0;
            if (!AutoAdjust || Profile.Tier == QualityTier.Low || Time.unscaledTime - lastChange < 8f) return;
            if (game == null || !game.Ready || game.Flow.State != FlowState.Shopping) return;
            if (AverageFps < Profile.TargetFrameRate * 0.72f)
            {
                Debug.Log($"[RealMarket] ortalama {AverageFps:0} fps → kalite düşürülüyor");
                Apply((QualityTier)((int)Profile.Tier - 1));
            }
        }
    }
}
