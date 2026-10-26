using System.Collections.Generic;
using UnityEngine;

namespace RealMarket.Runtime
{
    public enum SoundKind { Pick, Place, CartDrop, Beep, Register, Error }

    /**
     * Uzamsal ses efektleri: klipler çalışma zamanında sentezlenir (ses dosyası indirmesi ve lisans
     * riski yok). 3B konumlu kaynaklar mesafeyle zayıflar. Mağaza ambiyansı düşük seviyeli
     * filtrelenmiş gürültüdür. Tarayıcılar ilk kullanıcı etkileşimine kadar sesi askıya alır.
     */
    public class AudioManager : MonoBehaviour
    {
        readonly Dictionary<SoundKind, AudioClip> clips = new Dictionary<SoundKind, AudioClip>();
        readonly List<AudioSource> pool = new List<AudioSource>();
        AudioSource ambience;
        public float Volume = 0.8f;

        void Awake()
        {
            clips[SoundKind.Pick] = Synth("pick", 0.12f, (t, d) => Noise(t) * Env(t, 0.004f, 0.08f) * 0.35f + Mathf.Sin(t * 2 * Mathf.PI * 420f) * Env(t, 0.002f, 0.05f) * 0.15f);
            clips[SoundKind.Place] = Synth("place", 0.14f, (t, d) => Mathf.Sin(t * 2 * Mathf.PI * 180f) * Env(t, 0.002f, 0.06f) * 0.4f + Noise(t) * Env(t, 0.001f, 0.03f) * 0.2f);
            clips[SoundKind.CartDrop] = Synth("drop", 0.25f, (t, d) => (Noise(t) * 0.5f + Mathf.Sin(t * 2 * Mathf.PI * 2600f) * 0.25f) * Env(t, 0.001f, 0.12f) * 0.45f);
            clips[SoundKind.Beep] = Synth("beep", 0.16f, (t, d) => Mathf.Sin(t * 2 * Mathf.PI * 2100f) * (t < 0.14f ? 0.25f : 0f));
            clips[SoundKind.Register] = Synth("register", 0.6f, (t, d) => (Mathf.Sin(t * 2 * Mathf.PI * 1320f) + Mathf.Sin(t * 2 * Mathf.PI * 1760f) * 0.6f) * Env(t, 0.005f, 0.45f) * 0.2f);
            clips[SoundKind.Error] = Synth("error", 0.3f, (t, d) => Mathf.Sign(Mathf.Sin(t * 2 * Mathf.PI * 220f)) * Env(t, 0.005f, 0.25f) * 0.12f);

            ambience = gameObject.AddComponent<AudioSource>();
            ambience.clip = Synth("ambience", 4f, (t, d) => Brown() * 0.05f + Mathf.Sin(t * 2 * Mathf.PI * 60f) * 0.006f, loopFade: true);
            ambience.loop = true;
            ambience.spatialBlend = 0f;
            ambience.volume = 0.5f * Volume;
            ambience.Play();
        }

        static readonly System.Random rng = new System.Random(7);
        static float brown;
        static float Noise(float t) => (float)rng.NextDouble() * 2f - 1f;
        static float Brown() { brown = Mathf.Clamp(brown + Noise(0) * 0.02f, -1f, 1f) * 0.998f; return brown * 3f; }
        static float Env(float t, float attack, float decay) => t < attack ? t / attack : Mathf.Exp(-(t - attack) / Mathf.Max(1e-4f, decay) * 3f);

        static AudioClip Synth(string name, float seconds, System.Func<float, float, float> f, bool loopFade = false)
        {
            const int rate = 22050;
            int n = Mathf.CeilToInt(seconds * rate);
            var data = new float[n];
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)rate;
                float v = f(t, seconds);
                if (loopFade) { float edge = Mathf.Min(t, seconds - t); if (edge < 0.2f) v *= edge / 0.2f; }
                data[i] = Mathf.Clamp(v, -1f, 1f);
            }
            var clip = AudioClip.Create(name, n, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        public void Play(SoundKind kind, Vector3 at)
        {
            if (!clips.TryGetValue(kind, out var clip)) return;
            AudioSource src = null;
            foreach (var s in pool) if (!s.isPlaying) { src = s; break; }
            if (src == null)
            {
                var go = new GameObject("Sfx");
                go.transform.SetParent(transform, false);
                src = go.AddComponent<AudioSource>();
                src.spatialBlend = 1f;
                src.rolloffMode = AudioRolloffMode.Logarithmic;
                src.minDistance = 0.8f;
                src.maxDistance = 25f;
                pool.Add(src);
            }
            src.transform.position = at;
            src.pitch = Random.Range(0.94f, 1.06f);
            src.PlayOneShot(clip, Volume);
        }
    }
}
