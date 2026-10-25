using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace RealMarket.Core
{
    // RealMarket API JSON sözleşmesi (packages/shared/src/api.ts, layout.ts, product.ts ile birebir).
    // Ölçüler: yerleşim metre, ürün/yuva milimetre, fiyat kuruş (tamsayı).

    public class Vec2Dto { public float X; public float Z; }

    public class Size3Dto { public float X; public float Y; public float Z; }

    public class RectDto
    {
        public float MinX; public float MinZ; public float MaxX; public float MaxZ;
        public bool Contains(float x, float z, float pad = 0f) =>
            x >= MinX - pad && x <= MaxX + pad && z >= MinZ - pad && z <= MaxZ + pad;
    }

    public class LayoutParamsDto
    {
        public float WidthM; public float LengthM; public float CeilingHeightM;
        public int GondolaCount; public int BayCount; public float BayWidthM; public float AisleWidthM;
        public int CheckoutCount; public int Seed;
    }

    public class LayoutObjectDto
    {
        public string Id; public string Type; public Vec2Dto Position; public float RotationY;
        public Size3Dto Size; public string DepartmentCode;
        public Dictionary<string, object> Meta;

        public string MetaString(string key, string fallback = "") =>
            Meta != null && Meta.TryGetValue(key, out var v) && v != null ? v.ToString() : fallback;

        public float MetaFloat(string key, float fallback = 0f) =>
            Meta != null && Meta.TryGetValue(key, out var v) && v != null && float.TryParse(v.ToString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var f) ? f : fallback;
    }

    public class ShelfLevelDto { public int Index; public float HeightM; public float ClearanceM; public float DepthM; public float ZOffsetM; }

    public class ShelfDto
    {
        public string Id; public string Kind; public string DepartmentCode; public string ParentId;
        public Vec2Dto Position; public float RotationY; public float WidthM; public float DepthM; public float HeightM;
        public List<ShelfLevelDto> Levels = new List<ShelfLevelDto>();
        public Vec2Dto AccessPoint;
    }

    public class DepartmentDto { public string Code; public string Name; public string Color; public RectDto Area; }

    public class CheckoutLaneDto { public string Id; public string CounterId; public RectDto Zone; public Vec2Dto ScannerPosition; }

    public class SpawnDto { public Vec2Dto Position; public float RotationY; }

    public class LayoutDto
    {
        public LayoutParamsDto Params;
        public List<LayoutObjectDto> Objects = new List<LayoutObjectDto>();
        public List<ShelfDto> Shelves = new List<ShelfDto>();
        public List<DepartmentDto> Departments = new List<DepartmentDto>();
        public List<CheckoutLaneDto> Checkouts = new List<CheckoutLaneDto>();
        public List<RectDto> Obstacles = new List<RectDto>();
        public SpawnDto Spawn; public SpawnDto CartSpawn;
    }

    public class DimensionsDto { public float WidthMm; public float HeightMm; public float DepthMm; public bool Verified; public string Source; }

    public class AppearanceDto
    {
        public string PrimaryColor; public string SecondaryColor; public string AccentColor;
        public string CapColor; public string BodyColor; public string ShapeVariant; public string Tagline;
    }

    public class PromotionDto { public string Type; public float Percent; public int Buy; public int Pay; public string Label; }

    public class ProductImageDto { public int Id; public string Url; public string View; public string License; }

    public class ProductDto
    {
        public string Id; public string Gtin; public string Name; public string Brand; public string Category; public string Subcategory;
        public int? NetWeightG; public int? VolumeMl; public string PackagingType; public DimensionsDto Dimensions;
        public string DataSource; public string Verification; public string ModelQuality; public string ModelUrl;
        public AppearanceDto Appearance; public List<ProductImageDto> Images = new List<ProductImageDto>(); public bool IsDemo;
        public string StoreProductId; public int PriceKurus; public int? ListPriceKurus; public PromotionDto Promotion;
        public int Available; public bool IsActive;
    }

    public class SlotDto
    {
        public string SlotId; public string ShelfId; public string Gtin; public int LevelIndex;
        public float XMm; public float YMm; public float ZMm;
        public float UnitWidthMm; public float UnitHeightMm; public float UnitDepthMm;
        public int Facings; public int DepthCount; public int StackCount; public int Capacity;
        public bool DimensionsVerified; public string ProductId; public string StoreProductId; public int VisibleUnits;
    }

    public class StoreInfoDto { public string Id; public string Name; public bool IsDemo; }

    public class SceneDataDto
    {
        public StoreInfoDto Store; public int LayoutVersion; public LayoutDto Layout;
        public List<ProductDto> Products = new List<ProductDto>(); public List<SlotDto> Slots = new List<SlotDto>();
    }

    public class SessionDto { public string SessionId; public string Token; public string StoreId; }

    public class CartLineDto
    {
        public string StoreProductId; public string ProductId; public string Name; public string Gtin; public int Quantity;
        public int UnitPriceKurus; public int LineSubtotalKurus; public int DiscountKurus; public int LineTotalKurus; public string PromotionLabel;
    }

    public class CartDto
    {
        public string SessionId; public string Status; public List<CartLineDto> Lines = new List<CartLineDto>();
        public int ItemCount; public int SubtotalKurus; public int DiscountKurus; public int TotalKurus;
    }

    public class OrderItemDto { public string Name; public string Gtin; public int Quantity; public int UnitPriceKurus; public int DiscountKurus; public int LineTotalKurus; }

    public class OrderDto
    {
        public string Id; public string OrderNumber; public string StoreId; public string Status;
        public int SubtotalKurus; public int DiscountKurus; public int TotalKurus; public string PaymentProvider; public string PaymentRef; public string CreatedAt;
        public List<OrderItemDto> Items = new List<OrderItemDto>();
    }

    public class ApiErrorDto { public string Error; public string Message; }

    /** 3B model bildirimi: ürün başına LOD GLB dosyaları (asset pipeline üretir). */
    public class ModelManifestDto
    {
        public int Version; public string GeneratedAt;
        public Dictionary<string, ModelEntryDto> Products = new Dictionary<string, ModelEntryDto>();
    }

    /** Yollar /api/models/ köküne görelidir (ör. "p123/lod1.glb"). */
    public class ModelEntryDto
    {
        public string Lod0; public string Lod1; public string Lod2; public string Lod3;
        public int Triangles0; public int Triangles1; public int Triangles2; public int Triangles3; public int Bytes;

        public string PathFor(int lod) => lod <= 0 ? Lod0 : lod == 1 ? Lod1 : lod == 2 ? (Lod2 ?? Lod3) : (Lod3 ?? Lod2);
    }

    /** API ile aynı camelCase JSON. */
    public static class Json
    {
        public static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
            MissingMemberHandling = MissingMemberHandling.Ignore,
        };

        public static T Parse<T>(string json) => JsonConvert.DeserializeObject<T>(json, Settings);
        public static string Write(object value) => JsonConvert.SerializeObject(value, Settings);
    }
}
