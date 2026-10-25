using System.Collections.Generic;
using RealMarket.Core;

namespace RealMarket.Runtime
{
    /**
     * Planogram verisi: yuvalar, ürün → yuva eşlemesi ve birim seçimi kuralları.
     * Müşteri ön sıradan alır; sepetteki ürünler sahne açılırken raftan düşülürken arka sıradan
     * eksiltilir (raf önü dolu görünür). Geri bırakılan ürün aynı yuvanın en öndeki boş yerine döner.
     */
    public class PlanogramManager
    {
        public readonly Dictionary<string, SlotDto> Slots = new Dictionary<string, SlotDto>();
        public readonly Dictionary<string, List<SlotDto>> SlotsByProduct = new Dictionary<string, List<SlotDto>>();
        UnitIndex index;

        public void Build(SceneDataDto scene)
        {
            Slots.Clear();
            SlotsByProduct.Clear();
            foreach (var s in scene.Slots)
            {
                Slots[s.SlotId] = s;
                if (!SlotsByProduct.TryGetValue(s.ProductId, out var list)) SlotsByProduct[s.ProductId] = list = new List<SlotDto>();
                list.Add(s);
            }
        }

        public void Bind(UnitIndex unitIndex) { index = unitIndex; }

        /** Ürünün raftaki (alınmamış) birimlerinden en arkadaki — sahne açılış uzlaştırması için. */
        public int BackmostFree(string productId)
        {
            if (!index.ByProduct.TryGetValue(productId, out var list)) return -1;
            for (int i = list.Count - 1; i >= 0; i--) if (!index.Units[list[i]].Taken) return list[i];
            return -1;
        }

        /** Rafa geri koyma: tercihen aynı yuvadaki, yoksa ürünün herhangi bir yuvasındaki ilk boş yer. */
        public int FrontmostTaken(string productId, string preferredSlot)
        {
            if (!index.ByProduct.TryGetValue(productId, out var list)) return -1;
            int any = -1;
            foreach (int i in list)
            {
                var u = index.Units[i];
                if (!u.Taken) continue;
                if (u.SlotId == preferredSlot) return i;
                if (any < 0) any = i;
            }
            return any;
        }

        public int Capacity(string productId)
        {
            int n = 0;
            if (SlotsByProduct.TryGetValue(productId, out var list)) foreach (var s in list) n += s.Capacity;
            return n;
        }
    }
}
