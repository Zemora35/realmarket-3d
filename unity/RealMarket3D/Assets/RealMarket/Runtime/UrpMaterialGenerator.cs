using GLTFast;
using GLTFast.Logging;
using GLTFast.Materials;
using GLTFast.Schema;
using UnityEngine;
using Material = UnityEngine.Material;

namespace RealMarket.Runtime
{
    /**
     * glTFast için malzeme üretici: glTF PBR malzemesini MaterialLibrary'deki URP Lit (instancing
     * açık) şablonunun kopyasına çevirir. glTFast'in kendi Shader Graph gölgelendiricilerine
     * ihtiyaç kalmaz; derlemede eksik gölgelendirici riski ortadan kalkar.
     */
    public class UrpMaterialGenerator : IMaterialGenerator
    {
        readonly MaterialLibrary library;
        ICodeLogger logger;

        public UrpMaterialGenerator(MaterialLibrary library) { this.library = library; }

        public void SetLogger(ICodeLogger logger) { this.logger = logger; }

        public Material GetDefaultMaterial(bool pointsSupport = false) => new Material(library.LitInstanced) { name = "gltf-default" };

        public Material GenerateMaterial(MaterialBase gltfMaterial, IGltfReadable gltf, bool pointsSupport = false)
        {
            var m = new Material(library.LitInstanced) { name = string.IsNullOrEmpty(gltfMaterial.name) ? "gltf" : gltfMaterial.name };
            var pbr = gltfMaterial.PbrMetallicRoughness;
            if (pbr != null)
            {
                MaterialLibrary.SetBase(m, pbr.BaseColor);
                m.SetFloat("_Metallic", pbr.metallicFactor);
                m.SetFloat("_Smoothness", 1f - pbr.roughnessFactor);
                var info = pbr.BaseColorTexture;
                if (info != null && info.index >= 0 && info.index < gltf.TextureCount)
                {
                    var tex = gltf.GetTexture(info.index);
                    if (tex != null)
                    {
                        tex.anisoLevel = 4;
                        m.SetTexture("_BaseMap", tex);
                    }
                }
            }
            var em = gltfMaterial.Emissive;
            if (em.maxColorComponent > 0.01f)
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", em);
            }
            return m;
        }
    }
}
