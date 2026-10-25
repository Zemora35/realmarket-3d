using System;
using System.IO;
using System.Linq;
using System.Reflection;
using RealMarket.Runtime;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace RealMarket.EditorTools
{
    /**
     * Unity projesini koddan kurar ve WebGL derler. Depoda yalnızca betikler tutulur; URP varlıkları,
     * malzeme şablonları, son işleme profili ve sahne bu betikle (CI'da GameCI içinde) üretilir.
     *
     *   Unity -batchmode -projectPath unity/RealMarket3D -executeMethod RealMarket.EditorTools.BuildScript.BuildWebGL
     *         [-customBuildPath build/WebGL] [-rmWebGPU] [-rmDecompressionFallback] -quit
     *
     * Kurulum idempotenttir: varlıklar varsa üzerine yazılmaz, yalnızca ayarlar yeniden uygulanır.
     */
    public static class BuildScript
    {
        const string Gen = "Assets/RealMarket/Generated";
        const string ScenePath = "Assets/Scenes/Market.unity";
        const string LibraryPath = "Assets/Resources/RealMarketMaterials.asset";

        [MenuItem("RealMarket/Projeyi kur")]
        public static void SetupProject()
        {
            Directory.CreateDirectory(Gen);
            Directory.CreateDirectory("Assets/Resources");
            Directory.CreateDirectory("Assets/Scenes");
            AssetDatabase.Refresh();

            ConfigurePlayer();
            var urp = SetupUrp();
            var library = SetupMaterials();
            var profile = SetupVolumeProfile();
            SetupScene(library, profile);
            AssetDatabase.SaveAssets();
            Debug.Log($"[RealMarket] proje kuruldu: URP={urp.name}, sahne={ScenePath}");
        }

        [MenuItem("RealMarket/WebGL derle")]
        public static void BuildWebGL()
        {
            SetupProject();
            string output = Arg("-customBuildPath") ?? Environment.GetEnvironmentVariable("RM_BUILD_PATH") ?? "Builds/WebGL";
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = BuildTarget.WebGL,
                targetGroup = BuildTargetGroup.WebGL,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(opts);
            var s = report.summary;
            Debug.Log($"[RealMarket] derleme: {s.result}, {s.totalSize / (1024f * 1024f):0.0} MB, {s.totalTime.TotalSeconds:0} sn, hata {s.totalErrors}, uyarı {s.totalWarnings} → {output}");
            File.WriteAllText(Path.Combine(output, "build-report.txt"),
                $"result={s.result}\nsizeBytes={s.totalSize}\nseconds={s.totalTime.TotalSeconds:0}\nerrors={s.totalErrors}\nwarnings={s.totalWarnings}\nunity={Application.unityVersion}\ncompression={PlayerSettings.WebGL.compressionFormat}\n");
            if (Application.isBatchMode) EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 1);
        }

        static string Arg(string name)
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
            return null;
        }

        static bool Flag(string name) => Environment.GetCommandLineArgs().Contains(name);

        static void ConfigurePlayer()
        {
            PlayerSettings.companyName = "RealMarket";
            PlayerSettings.productName = "RealMarket 3D";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.runInBackground = true;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            // Sunucu Content-Encoding başlığını doğru gönderiyorsa yedek açma gereksizdir (daha hızlı açılış).
            PlayerSettings.WebGL.decompressionFallback = Flag("-rmDecompressionFallback");
            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.nameFilesAsHashes = false;
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.ExplicitlyThrownExceptionsOnly;
            PlayerSettings.WebGL.template = "APPLICATION:Minimal";
            var webgl = NamedBuildTarget.WebGL;
            PlayerSettings.SetManagedStrippingLevel(webgl, ManagedStrippingLevel.Low);
            PlayerSettings.SetIl2CppCodeGeneration(webgl, UnityEditor.Build.Il2CppCodeGeneration.OptimizeSize);
            PlayerSettings.stripEngineCode = true;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            var apis = Flag("-rmWebGPU")
                ? new[] { GraphicsDeviceType.WebGPU, GraphicsDeviceType.OpenGLES3 } // deneysel: WebGPU yoksa WebGL2'ye düşer
                : new[] { GraphicsDeviceType.OpenGLES3 };
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, apis);
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL);
        }

        static T LoadOrCreate<T>(string path, Func<T> create) where T : UnityEngine.Object
        {
            var a = AssetDatabase.LoadAssetAtPath<T>(path);
            if (a != null) return a;
            a = create();
            AssetDatabase.CreateAsset(a, path);
            return a;
        }

        static void SetSerialized(UnityEngine.Object o, string prop, Action<SerializedProperty> set)
        {
            var so = new SerializedObject(o);
            var p = so.FindProperty(prop);
            if (p == null) { Debug.LogWarning($"[RealMarket] {o.GetType().Name}.{prop} bulunamadı (sürüm farkı) — atlandı"); return; }
            set(p);
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        static UniversalRenderPipelineAsset SetupUrp()
        {
            var renderer = LoadOrCreate($"{Gen}/URP-Renderer.asset", () => ScriptableObject.CreateInstance<UniversalRendererData>());
            // PostProcessData: URP sürümüne göre özellik farklı olabilir → yansıma ile ata
            var pp = AssetDatabase.LoadAssetAtPath<ScriptableObject>("Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
            var ppProp = renderer.GetType().GetProperty("postProcessData", BindingFlags.Public | BindingFlags.Instance);
            if (pp != null && ppProp != null && ppProp.CanWrite && ppProp.GetValue(renderer) == null)
            {
                try { ppProp.SetValue(renderer, pp); } catch (Exception e) { Debug.LogWarning("[RealMarket] postProcessData atanamadı: " + e.Message); }
            }
            AddSsao(renderer);
            EditorUtility.SetDirty(renderer);

            var urp = LoadOrCreate($"{Gen}/URP-Asset.asset", () => UniversalRenderPipelineAsset.Create(renderer));
            urp.renderScale = 1f;
            urp.msaaSampleCount = 2;
            urp.shadowDistance = 30f;
            urp.supportsHDR = true;
            SetSerialized(urp, "m_MainLightShadowsSupported", p => p.boolValue = true);
            SetSerialized(urp, "m_MainLightShadowmapResolution", p => p.intValue = 2048);
            SetSerialized(urp, "m_SoftShadowsSupported", p => p.boolValue = true);
            SetSerialized(urp, "m_ShadowCascadeCount", p => p.intValue = 2);
            SetSerialized(urp, "m_AdditionalLightsRenderingMode", p => p.intValue = 0); // ek ışık yok
            SetSerialized(urp, "m_SupportsCameraDepthTexture", p => p.boolValue = true);
            SetSerialized(urp, "m_UseSRPBatcher", p => p.boolValue = true);
            EditorUtility.SetDirty(urp);

            GraphicsSettings.defaultRenderPipeline = urp;
            int current = QualitySettings.GetQualityLevel();
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = urp;
            }
            QualitySettings.SetQualityLevel(current, false);
            EnsureUrpGlobalSettings();
            return urp;
        }

        static void AddSsao(UniversalRendererData renderer)
        {
            try
            {
                if (renderer.rendererFeatures.Any(f => f != null && f.GetType().Name.Contains("AmbientOcclusion"))) return;
                var type = typeof(UniversalRendererData).Assembly.GetType("UnityEngine.Rendering.Universal.ScreenSpaceAmbientOcclusion");
                if (type == null) { Debug.LogWarning("[RealMarket] SSAO türü bulunamadı"); return; }
                var feature = (ScriptableRendererFeature)ScriptableObject.CreateInstance(type);
                feature.name = "SSAO";
                AssetDatabase.AddObjectToAsset(feature, renderer);
                renderer.rendererFeatures.Add(feature);
                typeof(ScriptableRendererData).GetMethod("ValidateRendererFeatures", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)?.Invoke(renderer, null);
            }
            catch (Exception e) { Debug.LogWarning("[RealMarket] SSAO eklenemedi: " + e.Message); }
        }

        /** URP genel ayar varlığı yoksa oluşturur (Unity 6'da URP'nin iç Ensure yöntemi). */
        static void EnsureUrpGlobalSettings()
        {
            try
            {
                var type = typeof(UniversalRenderPipelineAsset).Assembly.GetType("UnityEngine.Rendering.Universal.UniversalRenderPipelineGlobalSettings");
                var ensure = type?.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic).FirstOrDefault(m => m.Name == "Ensure");
                if (ensure == null) { Debug.Log("[RealMarket] URP global settings: Ensure yok, Unity otomatik oluşturacak"); return; }
                var args = ensure.GetParameters().Select(p => p.ParameterType == typeof(bool) ? (object)true : p.DefaultValue).ToArray();
                ensure.Invoke(null, args);
            }
            catch (Exception e) { Debug.LogWarning("[RealMarket] URP global settings oluşturulamadı: " + e.Message); }
        }

        static Material Template(string path, Shader shader, Action<Material> setup)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = new Material(shader); AssetDatabase.CreateAsset(m, path); }
            m.shader = shader;
            setup(m);
            EditorUtility.SetDirty(m);
            return m;
        }

        static MaterialLibrary SetupMaterials()
        {
            var lit = Shader.Find("Universal Render Pipeline/Lit");
            var unlit = Shader.Find("Universal Render Pipeline/Unlit");
            if (lit == null || unlit == null) throw new Exception("URP gölgelendiricileri bulunamadı — URP paketi yüklenmemiş");
            var lib = LoadOrCreate(LibraryPath, () => ScriptableObject.CreateInstance<MaterialLibrary>());
            lib.Lit = Template($"{Gen}/M_Lit.mat", lit, m => { m.SetFloat("_Smoothness", 0.4f); m.enableInstancing = false; });
            lib.LitInstanced = Template($"{Gen}/M_LitInstanced.mat", lit, m => { m.SetFloat("_Smoothness", 0.4f); m.enableInstancing = true; });
            lib.LitTransparent = Template($"{Gen}/M_LitTransparent.mat", lit, m =>
            {
                m.SetFloat("_Surface", 1f);
                m.SetFloat("_Blend", 0f);
                m.SetOverrideTag("RenderType", "Transparent");
                m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
                m.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_ZWrite", 0f);
                m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                m.renderQueue = (int)RenderQueue.Transparent;
                m.SetColor("_BaseColor", new Color(0.85f, 0.95f, 1f, 0.2f));
            });
            lib.Emissive = Template($"{Gen}/M_Emissive.mat", lit, m =>
            {
                m.EnableKeyword("_EMISSION");
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
                m.SetColor("_EmissionColor", Color.white * 2f);
            });
            lib.Unlit = Template($"{Gen}/M_Unlit.mat", unlit, m => { });
            lib.TextMaterial = UIManager.DefaultFont != null ? UIManager.DefaultFont.material : null;
            EditorUtility.SetDirty(lib);
            return lib;
        }

        static VolumeProfile SetupVolumeProfile()
        {
            string path = $"{Gen}/PostFX.asset";
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(path);
            if (profile != null) return profile;
            profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, path);
            T Add<T>() where T : VolumeComponent
            {
                var c = profile.Add<T>(true);
                c.name = typeof(T).Name;
                AssetDatabase.AddObjectToAsset(c, profile);
                return c;
            }
            var tone = Add<Tonemapping>();
            tone.mode.Override(TonemappingMode.Neutral);
            var bloom = Add<Bloom>();
            bloom.threshold.Override(1.1f);
            bloom.intensity.Override(0.22f);
            bloom.scatter.Override(0.6f);
            var color = Add<ColorAdjustments>();
            color.postExposure.Override(0.15f);
            color.contrast.Override(6f);
            color.saturation.Override(4f);
            var vig = Add<Vignette>();
            vig.intensity.Override(0.16f);
            vig.smoothness.Override(0.5f);
            EditorUtility.SetDirty(profile);
            return profile;
        }

        static void SetupScene(MaterialLibrary library, VolumeProfile profile)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var gm = new GameObject("GameManager");
            var game = gm.AddComponent<GameManager>();
            var volGo = new GameObject("PostFX");
            var vol = volGo.AddComponent<Volume>();
            vol.isGlobal = true;
            vol.sharedProfile = profile;
            var so = new SerializedObject(game);
            so.FindProperty("materials").objectReferenceValue = library;
            so.FindProperty("postVolume").objectReferenceValue = vol;
            so.ApplyModifiedPropertiesWithoutUndo();

            // Sahne sis ayarı açık olmalı: aksi hâlde URP sis varyantları derlemede kırpılır.
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 22f;
            RenderSettings.fogEndDistance = 70f;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.skybox = null;

            // Yükleme anında boş ekran yerine düz arka plan
            var camGo = new GameObject("BootCamera");
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.06f, 0.08f, 0.12f);
            cam.depth = -10;
            camGo.AddComponent<BootCamera>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }
    }
}
