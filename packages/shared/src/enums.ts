/** Desteklenen ambalaj geometrileri (parametrik şablonlar). */
export const PACKAGING_TYPES = [
  'carton_box',
  'biscuit_pack',
  'chips_bag',
  'pet_bottle',
  'glass_bottle',
  'beverage_can',
  'yogurt_cup',
  'tin_can',
  'jar',
  'shampoo_bottle',
  'detergent_bottle',
  'milk_carton',
  'pasta_pack',
  'spray',
  'tube',
  'pouch',
  'fruit',
  'vegetable',
  'custom',
] as const;
export type PackagingType = (typeof PACKAGING_TYPES)[number];

export const PACKAGING_LABELS_TR: Record<PackagingType, string> = {
  carton_box: 'Karton kutu',
  biscuit_pack: 'Bisküvi paketi',
  chips_bag: 'Cips poşeti',
  pet_bottle: 'PET şişe',
  glass_bottle: 'Cam şişe',
  beverage_can: 'İçecek kutusu',
  yogurt_cup: 'Yoğurt kabı',
  tin_can: 'Konserve',
  jar: 'Kavanoz',
  shampoo_bottle: 'Şampuan şişesi',
  detergent_bottle: 'Deterjan şişesi',
  milk_carton: 'Süt kutusu',
  pasta_pack: 'Makarna paketi',
  spray: 'Sprey',
  tube: 'Tüp',
  pouch: 'Poşet',
  fruit: 'Meyve',
  vegetable: 'Sebze',
  custom: 'Özel geometri',
};

/** 3D model kalite durumu — veritabanında ve admin panelinde gösterilir. */
export const MODEL_QUALITY = [
  'VERIFIED_3D',
  'MULTIVIEW_GENERATED',
  'SINGLE_IMAGE_APPROXIMATION',
  'PLACEHOLDER',
  'NEEDS_REVIEW',
] as const;
export type ModelQuality = (typeof MODEL_QUALITY)[number];

/** Ürün verisinin doğrulama durumu. */
export const DATA_VERIFICATION = [
  'VERIFIED', // yetkili kaynak / fiziksel ölçüm ile doğrulandı
  'SOURCE_REPORTED', // açık veri kaynağının bildirdiği, bağımsız doğrulanmadı
  'HEURISTIC', // sistem tarafından tahmin edildi (AI/heuristik)
  'DEMO_SAMPLE', // gerçek olmayan örnek içerik
  'UNVERIFIED',
] as const;
export type DataVerification = (typeof DATA_VERIFICATION)[number];

export const DATA_SOURCES = ['DEMO_SAMPLE', 'OPEN_FOOD_FACTS', 'MANUAL', 'GS1', 'RETAILER_FEED', 'CSV_IMPORT'] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const USER_ROLES = ['admin', 'store_manager', 'customer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const FIXTURE_KINDS = ['gondola', 'cooler', 'open_chiller', 'produce_table', 'promo_stand'] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export const ASSET_LICENSES = [
  'DEMO_GENERATED', // sistemin kendi ürettiği örnek içerik
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-3.0', // Open Food Facts görselleri
  'ODbL-1.0', // Open Food Facts veritabanı
  'OWNER_PERMISSION', // marka/perakendeci yazılı izni
  'UNVERIFIED', // lisansı doğrulanmadı — ticari kullanım yasak
] as const;
export type AssetLicense = (typeof ASSET_LICENSES)[number];

export const IMAGE_VIEWS = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;
export type ImageView = (typeof IMAGE_VIEWS)[number];
