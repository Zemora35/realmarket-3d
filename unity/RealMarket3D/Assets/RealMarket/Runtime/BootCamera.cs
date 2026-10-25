using UnityEngine;

namespace RealMarket.Runtime
{
    /** Yükleme ekranı sırasında arka planı çizer; oyuncu kamerası oluşunca kendini kapatır. */
    [RequireComponent(typeof(Camera))]
    public class BootCamera : MonoBehaviour
    {
        void Update()
        {
            var gm = GameManager.Instance;
            if (gm != null && gm.Player != null && gm.Player.Cam != null) gameObject.SetActive(false);
        }
    }
}
