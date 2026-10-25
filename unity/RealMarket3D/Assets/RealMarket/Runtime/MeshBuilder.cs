using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace RealMarket.Runtime
{
    /**
     * Kodla geometri üretimi (kutu, silindir, eğimli kutu). Aynı malzemeyi paylaşan parçalar tek
     * meshte birleştirilir: her raf modülü birkaç çizim çağrısına iner.
     */
    public class MeshBuilder
    {
        readonly List<Vector3> v = new List<Vector3>();
        readonly List<Vector3> n = new List<Vector3>();
        readonly List<Vector2> uv = new List<Vector2>();
        readonly List<int> t = new List<int>();
        public int VertexCount => v.Count;

        /** Merkezi c, boyutu s olan kutu; rot ile döndürülür. uvScale>0 ise UV metre ölçeğinde döşenir. */
        public MeshBuilder Box(Vector3 c, Vector3 s, Quaternion rot, float uvScale = 0f)
        {
            Vector3 h = s * 0.5f;
            Face(c, rot, Vector3.forward, Vector3.right, Vector3.up, h.z, h.x, h.y, uvScale);
            Face(c, rot, Vector3.back, Vector3.left, Vector3.up, h.z, h.x, h.y, uvScale);
            Face(c, rot, Vector3.right, Vector3.back, Vector3.up, h.x, h.z, h.y, uvScale);
            Face(c, rot, Vector3.left, Vector3.forward, Vector3.up, h.x, h.z, h.y, uvScale);
            Face(c, rot, Vector3.up, Vector3.right, Vector3.back, h.y, h.x, h.z, uvScale);
            Face(c, rot, Vector3.down, Vector3.right, Vector3.forward, h.y, h.x, h.z, uvScale);
            return this;
        }

        public MeshBuilder Box(Vector3 c, Vector3 s) => Box(c, s, Quaternion.identity);

        void Face(Vector3 c, Quaternion rot, Vector3 normal, Vector3 right, Vector3 up, float dist, float hw, float hh, float uvScale)
        {
            int i = v.Count;
            Vector3 center = normal * dist;
            // Unity'de ön yüz saat yönünde sarılır: yüze bakan izleyicinin sağı = normal × yukarı
            right = Vector3.Cross(normal, up);
            Vector3 r = right * hw, u = up * hh;
            Vector3[] corners = { center - r - u, center - r + u, center + r + u, center + r - u };
            Vector3 wn = rot * normal;
            foreach (var p in corners) { v.Add(c + rot * p); n.Add(wn); }
            if (uvScale > 0f)
            {
                float w2 = hw * 2f / uvScale, h2 = hh * 2f / uvScale;
                uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(0, h2)); uv.Add(new Vector2(w2, h2)); uv.Add(new Vector2(w2, 0));
            }
            else
            {
                uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(0, 1)); uv.Add(new Vector2(1, 1)); uv.Add(new Vector2(1, 0));
            }
            t.Add(i); t.Add(i + 1); t.Add(i + 2);
            t.Add(i); t.Add(i + 2); t.Add(i + 3);
        }

        /** Y ekseninde silindir (taban merkezi c). */
        public MeshBuilder Cylinder(Vector3 c, float radiusBottom, float radiusTop, float height, int segments, bool caps = true, Quaternion? rotation = null)
        {
            Quaternion rot = rotation ?? Quaternion.identity;
            int start = v.Count;
            float slope = (radiusBottom - radiusTop) / Mathf.Max(1e-4f, height);
            for (int s = 0; s <= segments; s++)
            {
                float a = s / (float)segments * Mathf.PI * 2f;
                float ca = Mathf.Cos(a), sa = Mathf.Sin(a);
                Vector3 nn = new Vector3(ca, slope, sa).normalized;
                v.Add(c + rot * new Vector3(ca * radiusBottom, 0, sa * radiusBottom)); n.Add(rot * nn); uv.Add(new Vector2(s / (float)segments, 0));
                v.Add(c + rot * new Vector3(ca * radiusTop, height, sa * radiusTop)); n.Add(rot * nn); uv.Add(new Vector2(s / (float)segments, 1));
            }
            for (int s = 0; s < segments; s++)
            {
                int i = start + s * 2;
                t.Add(i); t.Add(i + 1); t.Add(i + 3);
                t.Add(i); t.Add(i + 3); t.Add(i + 2);
            }
            if (caps)
            {
                Disc(c + rot * new Vector3(0, height, 0), radiusTop, segments, rot * Vector3.up);
                Disc(c, radiusBottom, segments, rot * Vector3.down);
            }
            return this;
        }

        void Disc(Vector3 center, float r, int segments, Vector3 normal)
        {
            if (r <= 1e-4f) return;
            int ci = v.Count;
            v.Add(center); n.Add(normal); uv.Add(new Vector2(0.5f, 0.5f));
            Quaternion q = Quaternion.FromToRotation(Vector3.up, normal);
            for (int s = 0; s <= segments; s++)
            {
                float a = s / (float)segments * Mathf.PI * 2f;
                v.Add(center + q * new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r)); n.Add(normal);
                uv.Add(new Vector2(0.5f + Mathf.Cos(a) * 0.5f, 0.5f + Mathf.Sin(a) * 0.5f));
            }
            // yerel çerçevede (normal=+y) bu sıra dışarıdan saat yönündedir; döndürme sırayı korur
            for (int s = 0; s < segments; s++) { t.Add(ci); t.Add(ci + s + 2); t.Add(ci + s + 1); }
        }

        /** Dört köşesi verilen tek yüzlü dörtgen (saat yönünde, dışa bakan). */
        public MeshBuilder Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d)
        {
            int i = v.Count;
            Vector3 nn = Vector3.Cross(b - a, c - a).normalized;
            v.Add(a); v.Add(b); v.Add(c); v.Add(d);
            for (int k = 0; k < 4; k++) n.Add(nn);
            uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(0, 1)); uv.Add(new Vector2(1, 1)); uv.Add(new Vector2(1, 0));
            t.Add(i); t.Add(i + 1); t.Add(i + 2);
            t.Add(i); t.Add(i + 2); t.Add(i + 3);
            return this;
        }

        public Mesh ToMesh(string name)
        {
            var m = new Mesh { name = name };
            if (v.Count > 65000) m.indexFormat = IndexFormat.UInt32;
            m.SetVertices(v);
            m.SetNormals(n);
            m.SetUVs(0, uv);
            m.SetTriangles(t, 0);
            m.RecalculateBounds();
            m.RecalculateTangents();
            m.UploadMeshData(false);
            return m;
        }

        public bool IsEmpty => v.Count == 0;
    }
}
