using System.Collections.Generic;

namespace RealMarket.Core
{
    public enum ItemState { Idle, Hovered, Selected, PickingUp, Inspecting, MovingToCart, InCart, ReturningToShelf }

    public enum ItemEvent { Hover, Unhover, Select, PickStart, PickDone, ToCart, CartArrived, CartRejected, TakeFromCart, Unload, ToShelf, ShelfArrived }

    /**
     * Ürün animasyon durum makinesi (web sürümündeki itemStateMachine.ts ile aynı tablo).
     * Geçersiz geçişler reddedilir: aynı anda başlatılan işlemler durumları karıştırmaz.
     */
    public class ItemStateMachine
    {
        static readonly Dictionary<ItemState, Dictionary<ItemEvent, ItemState>> Table = new Dictionary<ItemState, Dictionary<ItemEvent, ItemState>>
        {
            [ItemState.Idle] = new Dictionary<ItemEvent, ItemState> { [ItemEvent.Hover] = ItemState.Hovered, [ItemEvent.Select] = ItemState.Selected },
            [ItemState.Hovered] = new Dictionary<ItemEvent, ItemState> { [ItemEvent.Unhover] = ItemState.Idle, [ItemEvent.Select] = ItemState.Selected },
            [ItemState.Selected] = new Dictionary<ItemEvent, ItemState> { [ItemEvent.PickStart] = ItemState.PickingUp, [ItemEvent.Unhover] = ItemState.Idle },
            [ItemState.PickingUp] = new Dictionary<ItemEvent, ItemState> { [ItemEvent.PickDone] = ItemState.Inspecting },
            [ItemState.Inspecting] = new Dictionary<ItemEvent, ItemState> { [ItemEvent.ToCart] = ItemState.MovingToCart, [ItemEvent.ToShelf] = ItemState.ReturningToShelf },
            [ItemState.MovingToCart] = new Dictionary<ItemEvent, ItemState> { [ItemEvent.CartArrived] = ItemState.InCart, [ItemEvent.CartRejected] = ItemState.ReturningToShelf },
            [ItemState.InCart] = new Dictionary<ItemEvent, ItemState> { [ItemEvent.TakeFromCart] = ItemState.PickingUp, [ItemEvent.Unload] = ItemState.ReturningToShelf, [ItemEvent.CartRejected] = ItemState.ReturningToShelf },
            [ItemState.ReturningToShelf] = new Dictionary<ItemEvent, ItemState> { [ItemEvent.ShelfArrived] = ItemState.Idle },
        };

        readonly Dictionary<int, ItemState> states = new Dictionary<int, ItemState>();
        public int RejectedCount { get; private set; }

        public static ItemState? Next(ItemState s, ItemEvent e) =>
            Table[s].TryGetValue(e, out var n) ? n : (ItemState?)null;

        public ItemState Get(int unit) => states.TryGetValue(unit, out var s) ? s : ItemState.Idle;

        public bool Send(int unit, ItemEvent e)
        {
            var next = Next(Get(unit), e);
            if (next == null) { RejectedCount++; return false; }
            if (next.Value == ItemState.Idle) states.Remove(unit); else states[unit] = next.Value;
            return true;
        }

        public void Clear(int unit) => states.Remove(unit);
        public void Reset() { states.Clear(); RejectedCount = 0; }
    }
}
