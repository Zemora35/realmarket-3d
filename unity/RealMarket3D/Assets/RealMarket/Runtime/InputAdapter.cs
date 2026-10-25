using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace RealMarket.Runtime
{
    public enum Act { Interact, AddToCart, ReturnItem, GrabCart, ToggleCart, Checkout, Back, CycleQuality, ToggleHeadBob }

    /** Dokunmatik denetimlerin (UIManager) yazdığı değerler. */
    public static class MobileInput
    {
        public static Vector2 Move;
        public static Vector2 LookDelta;
        static readonly bool[] pressed = new bool[16];
        public static void Press(Act a) => pressed[(int)a] = true;
        public static bool Consume(Act a) { bool v = pressed[(int)a]; pressed[(int)a] = false; return v; }
        public static void EndFrame() { LookDelta = Vector2.zero; }
    }

    /**
     * Yeni Input System ve eski Input Manager için tek giriş noktası (proje hangisiyle
     * derlenirse derlensin çalışır). Fare hareketi piksel cinsinden döner.
     */
    public static class InputAdapter
    {
        public static bool IsTouchDevice =>
#if ENABLE_INPUT_SYSTEM
            Touchscreen.current != null || Application.isMobilePlatform;
#else
            Input.touchSupported || Application.isMobilePlatform;
#endif

        public static Vector2 Move()
        {
            Vector2 v = Vector2.zero;
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            if (k != null)
            {
                if (k.wKey.isPressed || k.upArrowKey.isPressed) v.y += 1;
                if (k.sKey.isPressed || k.downArrowKey.isPressed) v.y -= 1;
                if (k.dKey.isPressed || k.rightArrowKey.isPressed) v.x += 1;
                if (k.aKey.isPressed || k.leftArrowKey.isPressed) v.x -= 1;
            }
#else
            v.x = Input.GetAxisRaw("Horizontal");
            v.y = Input.GetAxisRaw("Vertical");
#endif
            v += MobileInput.Move;
            return Vector2.ClampMagnitude(v, 1f);
        }

        public static bool Run()
        {
#if ENABLE_INPUT_SYSTEM
            return Keyboard.current != null && Keyboard.current.leftShiftKey.isPressed;
#else
            return Input.GetKey(KeyCode.LeftShift);
#endif
        }

        public static Vector2 LookDelta()
        {
            Vector2 d = MobileInput.LookDelta;
            if (Cursor.lockState == CursorLockMode.Locked)
            {
#if ENABLE_INPUT_SYSTEM
                if (Mouse.current != null) d += Mouse.current.delta.ReadValue();
#else
                d += new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * 10f;
#endif
            }
            return d;
        }

        /** İnceleme sırasında ürünü döndürmek için basılı fare sürüklemesi. */
        public static Vector2 DragDelta()
        {
#if ENABLE_INPUT_SYSTEM
            if (Mouse.current != null && (Mouse.current.leftButton.isPressed || Cursor.lockState == CursorLockMode.Locked)) return Mouse.current.delta.ReadValue();
#else
            if (Input.GetMouseButton(0) || Cursor.lockState == CursorLockMode.Locked) return new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * 10f;
#endif
            return MobileInput.LookDelta;
        }

        public static float Scroll()
        {
#if ENABLE_INPUT_SYSTEM
            return Mouse.current != null ? Mouse.current.scroll.ReadValue().y / 120f : 0f;
#else
            return Input.mouseScrollDelta.y;
#endif
        }

        public static bool PrimaryClick()
        {
#if ENABLE_INPUT_SYSTEM
            return Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame;
#else
            return Input.GetMouseButtonDown(0);
#endif
        }

        public static bool Down(Act a)
        {
            if (MobileInput.Consume(a)) return true;
#if ENABLE_INPUT_SYSTEM
            var k = Keyboard.current;
            if (k == null) return false;
            switch (a)
            {
                case Act.Interact: return k.eKey.wasPressedThisFrame;
                case Act.AddToCart: return k.gKey.wasPressedThisFrame;
                case Act.ReturnItem: return k.rKey.wasPressedThisFrame;
                case Act.GrabCart: return k.cKey.wasPressedThisFrame;
                case Act.ToggleCart: return k.tabKey.wasPressedThisFrame;
                case Act.Checkout: return k.enterKey.wasPressedThisFrame || k.numpadEnterKey.wasPressedThisFrame;
                case Act.Back: return k.escapeKey.wasPressedThisFrame || k.qKey.wasPressedThisFrame;
                case Act.CycleQuality: return k.f2Key.wasPressedThisFrame;
                case Act.ToggleHeadBob: return k.bKey.wasPressedThisFrame;
            }
            return false;
#else
            switch (a)
            {
                case Act.Interact: return Input.GetKeyDown(KeyCode.E);
                case Act.AddToCart: return Input.GetKeyDown(KeyCode.G);
                case Act.ReturnItem: return Input.GetKeyDown(KeyCode.R);
                case Act.GrabCart: return Input.GetKeyDown(KeyCode.C);
                case Act.ToggleCart: return Input.GetKeyDown(KeyCode.Tab);
                case Act.Checkout: return Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter);
                case Act.Back: return Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.Q);
                case Act.CycleQuality: return Input.GetKeyDown(KeyCode.F2);
                case Act.ToggleHeadBob: return Input.GetKeyDown(KeyCode.B);
            }
            return false;
#endif
        }
    }
}
