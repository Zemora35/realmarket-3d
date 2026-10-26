using System;
using UnityEngine;

namespace RealMarket.Runtime
{
    public enum FlowState { Booting, Loading, Shopping, Inspecting, CartPanel, Checkout, Receipt, Error }

    /**
     * Oyun akışı (tek Unity sahnesi içinde): yükleme → alışveriş ↔ inceleme / sepet paneli →
     * ödeme → fiş. Durum değişince oyuncu girişi ve işaretçi kilidi buna göre ayarlanır.
     * (UnityEngine.SceneManagement ile karışmaması için bu sınıf yalnızca RealMarket.Runtime içindedir.)
     */
    public class SceneManager
    {
        public FlowState State { get; private set; } = FlowState.Booting;
        public event Action<FlowState, FlowState> Changed;
        readonly GameManager game;

        public SceneManager(GameManager game) { this.game = game; }

        public bool AllowsWalking => State == FlowState.Shopping;
        public bool AllowsLook => State == FlowState.Shopping;

        public void Enter(FlowState next)
        {
            if (next == State) return;
            var prev = State;
            State = next;
            if (game.Player != null)
            {
                game.Player.InputEnabled = AllowsLook;
                if (!AllowsWalking) game.Player.SpeedMultiplier = game.Cart != null && game.Cart.Grabbed ? 0.85f : 1f;
            }
            if (!AllowsLook && Cursor.lockState == CursorLockMode.Locked && next != FlowState.Inspecting) Cursor.lockState = CursorLockMode.None;
            Changed?.Invoke(prev, next);
        }

        /** Masaüstünde oyun alanına tıklanınca işaretçi kilitlenir (tarayıcı kullanıcı hareketi ister). */
        public void TryLockPointer()
        {
            if (InputAdapter.IsTouchDevice || State != FlowState.Shopping) return;
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
        }
    }
}
