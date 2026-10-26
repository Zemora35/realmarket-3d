using UnityEngine;
using UnityEngine.EventSystems;

namespace RealMarket.Runtime
{
    /** Sol alt sanal joystick: sürükleme vektörü MobileInput.Move'a yazılır. */
    public class VirtualJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        public RectTransform Knob;
        public float Radius = 80f;
        RectTransform rt;

        void Awake() { rt = (RectTransform)transform; }

        public void OnPointerDown(PointerEventData e) => OnDrag(e);

        public void OnDrag(PointerEventData e)
        {
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(rt, e.position, e.pressEventCamera, out var local)) return;
            var v = Vector2.ClampMagnitude(local, Radius);
            if (Knob != null) Knob.anchoredPosition = v;
            MobileInput.Move = v / Radius;
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (Knob != null) Knob.anchoredPosition = Vector2.zero;
            MobileInput.Move = Vector2.zero;
        }

        void OnDisable() { MobileInput.Move = Vector2.zero; }
    }

    /** Sağ yarı ekran: parmak sürüklemesi bakış (veya inceleme sırasında döndürme) olur. */
    public class LookArea : MonoBehaviour, IDragHandler
    {
        public void OnDrag(PointerEventData e) { MobileInput.LookDelta += e.delta; }
    }

    /** Dokunmatik eylem düğmesi. */
    public class ActionButton : MonoBehaviour, IPointerDownHandler
    {
        public Act Action;
        public void OnPointerDown(PointerEventData e) { MobileInput.Press(Action); }
    }

    /** Oyun alanına (boş bölgeye) tıklanınca işaretçi kilidi ister. */
    public class PointerLockArea : MonoBehaviour, IPointerClickHandler
    {
        public System.Action Clicked;
        public void OnPointerClick(PointerEventData e) { Clicked?.Invoke(); }
    }
}
