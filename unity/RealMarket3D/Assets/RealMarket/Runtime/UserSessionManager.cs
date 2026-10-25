using System;
using System.Threading.Tasks;
using RealMarket.Core;
using UnityEngine;

namespace RealMarket.Runtime
{
    /**
     * Alışveriş oturumu. Web sitesine gömülüyken oturumun sahibi sayfadır (localStorage): sayfa
     * SET_SESSION ile gönderir, Unity yeni oturum açarsa SESSION_READY ile sayfaya bildirir.
     * Tek başına açıldığında PlayerPrefs (WebGL'de IndexedDB) kullanılır. Böylece sepet ziyaretler
     * arasında korunur. Geçersiz/kapanmış oturumda yenisi açılır.
     */
    public class UserSessionManager
    {
        readonly APIClient api;
        readonly string storeId;
        public SessionDto Current { get; private set; }
        public event Action<SessionDto, bool> Ready; // session, isNew
        string PrefKey => "realmarket.session." + storeId;

        public UserSessionManager(APIClient api, string storeId) { this.api = api; this.storeId = storeId; }

        /** Doğrular ve sepeti döndürür; olmazsa yeni oturum açar. */
        public async Task<CartDto> Resume(SessionDto candidate)
        {
            candidate = candidate ?? LoadLocal();
            if (candidate != null && !string.IsNullOrEmpty(candidate.Token) && candidate.StoreId == storeId)
            {
                try
                {
                    var cart = await api.GetCart(candidate);
                    if (cart.Status == "active")
                    {
                        Current = candidate;
                        SaveLocal();
                        Ready?.Invoke(Current, false);
                        return cart;
                    }
                }
                catch (ApiException e) when (!e.IsNetwork) { /* geçersiz anahtar / silinmiş oturum → yenisi */ }
            }
            await StartNew();
            return new CartDto { SessionId = Current.SessionId, Status = "active" };
        }

        public async Task StartNew()
        {
            Current = await api.CreateSession(storeId);
            SaveLocal();
            Ready?.Invoke(Current, true);
        }

        /** Sayfa başka bir oturuma geçtiyse (ör. başka sekmede ödeme yapıldı) benimser. */
        public void Adopt(SessionDto s)
        {
            if (s == null || s.StoreId != storeId || string.IsNullOrEmpty(s.Token)) return;
            Current = s;
            SaveLocal();
        }

        SessionDto LoadLocal()
        {
            string json = PlayerPrefs.GetString(PrefKey, "");
            if (string.IsNullOrEmpty(json)) return null;
            try { return Json.Parse<SessionDto>(json); } catch (Exception) { return null; }
        }

        void SaveLocal()
        {
            PlayerPrefs.SetString(PrefKey, Json.Write(Current));
            PlayerPrefs.Save();
        }
    }
}
