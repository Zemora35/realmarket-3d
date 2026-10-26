using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using RealMarket.Core;
using UnityEngine;
using UnityEngine.Networking;

namespace RealMarket.Runtime
{
    public class ApiException : Exception
    {
        public readonly long Status; public readonly string Code;
        public ApiException(long status, string code, string message) : base(message) { Status = status; Code = code; }
        public bool IsNetwork => Status == 0;
    }

    /**
     * RealMarket REST API istemcisi (UnityWebRequest; WebGL'de tarayıcı fetch'i kullanır).
     * Oturum çağrıları x-session-token başlığı ile yetkilendirilir. Ağ hatalarında yalnızca
     * yan etkisiz (GET) istekler yeniden denenir; sepet yazma işlemleri asla tekrarlanmaz.
     */
    public class APIClient
    {
        readonly string baseUrl;
        public int TimeoutSeconds = 20;

        public APIClient(string baseUrl) { this.baseUrl = (baseUrl ?? "").TrimEnd('/'); }

        public string Url(string path) => path.StartsWith("http", StringComparison.Ordinal) ? path : baseUrl + path;

        public Task<SceneDataDto> GetScene(string storeId) => Send<SceneDataDto>("GET", $"/api/stores/{Uri.EscapeDataString(storeId)}/scene");
        public Task<SessionDto> CreateSession(string storeId) => Send<SessionDto>("POST", $"/api/stores/{Uri.EscapeDataString(storeId)}/sessions", new Dictionary<string, object>());
        public Task<CartDto> GetCart(SessionDto s) => Send<CartDto>("GET", $"/api/sessions/{s.SessionId}/cart", null, s.Token);
        public Task<CartDto> AddToCart(SessionDto s, string storeProductId, int quantity = 1) =>
            Send<CartDto>("POST", $"/api/sessions/{s.SessionId}/cart/add", new Dictionary<string, object> { ["storeProductId"] = storeProductId, ["quantity"] = quantity }, s.Token);
        public Task<CartDto> RemoveFromCart(SessionDto s, string storeProductId, int quantity = 1) =>
            Send<CartDto>("POST", $"/api/sessions/{s.SessionId}/cart/remove", new Dictionary<string, object> { ["storeProductId"] = storeProductId, ["quantity"] = quantity }, s.Token);
        public Task<CartDto> Quote(SessionDto s) => Send<CartDto>("POST", $"/api/sessions/{s.SessionId}/checkout/quote", new Dictionary<string, object>(), s.Token);
        public Task<OrderDto> Pay(SessionDto s, int expectedTotalKurus) =>
            Send<OrderDto>("POST", $"/api/sessions/{s.SessionId}/checkout/pay", new Dictionary<string, object> { ["paymentMethod"] = "demo", ["expectedTotalKurus"] = expectedTotalKurus }, s.Token);
        public Task<ModelManifestDto> GetModelManifest() => Send<ModelManifestDto>("GET", "/api/models/manifest.json");

        public async Task<T> Send<T>(string method, string path, object body = null, string token = null)
        {
            int attempts = method == "GET" ? 3 : 1;
            for (int attempt = 1; ; attempt++)
            {
                try
                {
                    string text = await SendRaw(method, path, body, token);
                    return Json.Parse<T>(text);
                }
                catch (ApiException e) when (e.IsNetwork && attempt < attempts)
                {
                    await Delay(400 * attempt);
                }
            }
        }

        async Task<string> SendRaw(string method, string path, object body, string token)
        {
            using (var req = new UnityWebRequest(Url(path), method))
            {
                req.downloadHandler = new DownloadHandlerBuffer();
                if (body != null)
                {
                    req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(Json.Write(body)));
                    req.SetRequestHeader("Content-Type", "application/json");
                }
                if (!string.IsNullOrEmpty(token)) req.SetRequestHeader("x-session-token", token);
                req.timeout = TimeoutSeconds;
                await Await(req.SendWebRequest());
                string text = req.downloadHandler != null ? req.downloadHandler.text : "";
                if (req.result == UnityWebRequest.Result.ConnectionError || req.result == UnityWebRequest.Result.DataProcessingError)
                    throw new ApiException(0, "NETWORK", "Sunucuya ulaşılamadı: " + req.error);
                if (req.responseCode >= 400)
                {
                    ApiErrorDto err = null;
                    try { err = Json.Parse<ApiErrorDto>(text); } catch (Exception) { }
                    throw new ApiException(req.responseCode, err?.Error ?? "HTTP_" + req.responseCode, err?.Message ?? req.error ?? "İstek başarısız");
                }
                return text;
            }
        }

        public static Task Await(AsyncOperation op)
        {
            var tcs = new TaskCompletionSource<bool>();
            if (op.isDone) tcs.SetResult(true);
            else op.completed += _ => tcs.TrySetResult(true);
            return tcs.Task;
        }

        /** WebGL tek iş parçacıklıdır: Task.Delay yerine Unity zamanlayıcısı ile bekler. */
        public static async Task Delay(int ms)
        {
            float until = Time.realtimeSinceStartup + ms / 1000f;
            while (Time.realtimeSinceStartup < until) await Awaitable.NextFrameAsync();
        }
    }
}
