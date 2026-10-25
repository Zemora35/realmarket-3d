using System.Collections.Generic;
using RealMarket.Core;

namespace RealMarket.Runtime
{
    /**
     * Raf ↔ sepet stok tutarlılığı. Sunucu sepeti tek doğruluk kaynağıdır: her sepet yanıtında
     * rafta "alınmış" görünen birim sayısı sepetteki adetle eşitlenir. Böylece başka sekmeden /
     * web sitesinden yapılan sepet değişiklikleri de rafa yansır.
     */
    public class InventoryManager
    {
        readonly ShelfManager shelves;
        readonly PlanogramManager planogram;
        readonly ProductManager products;
        /** productId → raftan alınmış birimler (son alınan en sonda) */
        readonly Dictionary<string, List<int>> taken = new Dictionary<string, List<int>>();
        /** Animasyon sürerken uzlaştırmanın dokunmaması gereken birimler */
        readonly HashSet<int> inFlight = new HashSet<int>();

        public InventoryManager(ShelfManager shelves, PlanogramManager planogram, ProductManager products)
        {
            this.shelves = shelves; this.planogram = planogram; this.products = products;
        }

        public int TakenCount(string productId) => taken.TryGetValue(productId, out var l) ? l.Count : 0;

        /** Kalan raf stoğu: sunucu stoğu − sepette olanlar (görsel birim sayısından bağımsız). */
        public int Remaining(ProductInfo p, CartDto cart)
        {
            int inCart = 0;
            if (cart != null) foreach (var l in cart.Lines) if (l.StoreProductId == p.Dto.StoreProductId) inCart += l.Quantity;
            return System.Math.Max(0, p.Dto.Available - inCart);
        }

        public void BeginTake(int unit) { inFlight.Add(unit); shelves.SetTaken(unit, true); }

        /** Animasyon bitti: birim artık sepette sayılır. */
        public void CommitTake(int unit)
        {
            inFlight.Remove(unit);
            var u = shelves.Unit(unit);
            if (u == null) return;
            if (!taken.TryGetValue(u.ProductId, out var list)) taken[u.ProductId] = list = new List<int>();
            if (!list.Contains(unit)) list.Add(unit);
        }

        /** Geri bırakma/red: birim rafa döner. */
        public void Release(int unit)
        {
            inFlight.Remove(unit);
            var u = shelves.Unit(unit);
            if (u == null) return;
            if (taken.TryGetValue(u.ProductId, out var list)) list.Remove(unit);
            shelves.SetTaken(unit, false);
        }

        /** Sepetten bir adet çıkarıldı: en son alınan birim rafa döner; birim indeksini verir. */
        public int ReturnOne(string productId)
        {
            if (!taken.TryGetValue(productId, out var list) || list.Count == 0) return -1;
            int unit = list[list.Count - 1];
            list.RemoveAt(list.Count - 1);
            shelves.SetTaken(unit, false);
            return unit;
        }

        public void Reconcile(CartDto cart)
        {
            var want = new Dictionary<string, int>();
            if (cart != null)
                foreach (var l in cart.Lines)
                    if (products.ByStoreProduct.TryGetValue(l.StoreProductId, out var p)) want[p.Dto.Id] = (want.TryGetValue(p.Dto.Id, out var n) ? n : 0) + l.Quantity;
            var ids = new HashSet<string>(taken.Keys);
            foreach (var k in want.Keys) ids.Add(k);
            foreach (var id in ids)
            {
                int target = want.TryGetValue(id, out var w) ? w : 0;
                if (!taken.TryGetValue(id, out var list)) taken[id] = list = new List<int>();
                while (list.Count > target)
                {
                    int u = list[list.Count - 1];
                    list.RemoveAt(list.Count - 1);
                    if (!inFlight.Contains(u)) shelves.SetTaken(u, false);
                }
                while (list.Count < target)
                {
                    int u = planogram.BackmostFree(id);
                    if (u < 0) break; // rafta görünür birimden fazla adet: kalan arka stoktan
                    shelves.SetTaken(u, true);
                    list.Add(u);
                }
            }
        }

        /** Ödeme sonrası: satın alınanlar raftan kalıcı olarak düşer, yeni sepet boş başlar. */
        public void ForgetPurchased() { taken.Clear(); inFlight.Clear(); }
    }
}
