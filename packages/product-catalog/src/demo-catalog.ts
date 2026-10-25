import { makeDemoGtin, type PackagingType, type ProductAppearance, type Promotion } from '@realmarket/shared';

/**
 * ÖRNEK (DEMO) ÜRÜN KATALOĞU
 * --------------------------------------------------------------
 * Buradaki markalar KURGUSALDIR; gerçek bir marka, ürün veya Migros kataloğunu
 * temsil etmez. Barkodlar GS1'in mağaza içi kullanıma ayırdığı "29" önekiyle
 * üretilir (gerçek ürünlerle çakışmaz). Ölçüler tipik ambalaj boyutlarına yakın
 * tahminlerdir ve "doğrulanmamış" olarak işaretlenir.
 */
export interface DemoProduct {
  key: string;
  gtin: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  packagingType: PackagingType;
  /** genişlik × yükseklik × derinlik (mm) */
  dims: [number, number, number];
  netWeightG?: number;
  volumeMl?: number;
  priceKurus: number;
  listPriceKurus?: number;
  promotion?: Promotion;
  appearance: ProductAppearance;
  stock: number;
}

type Row = Omit<DemoProduct, 'gtin'>;

const rows: Row[] = [
  // --- Süt ürünleri -------------------------------------------------------
  {
    key: 'sut-tam-1l', name: 'Tam Yağlı Süt 1 L', brand: 'Yaylapınarı', category: 'SUT_URUNLERI', subcategory: 'Süt',
    packagingType: 'milk_carton', dims: [70, 245, 70], volumeMl: 1000, priceKurus: 3450, stock: 120,
    appearance: { primaryColor: '#f4f8ff', secondaryColor: '#1d5fbf', accentColor: '#8fc1ff', capColor: '#1d5fbf', tagline: 'Günlük taze' },
  },
  {
    key: 'sut-yarim-1l', name: 'Yarım Yağlı Süt 1 L', brand: 'Yaylapınarı', category: 'SUT_URUNLERI', subcategory: 'Süt',
    packagingType: 'milk_carton', dims: [70, 245, 70], volumeMl: 1000, priceKurus: 3350, stock: 120,
    appearance: { primaryColor: '#f4fbf6', secondaryColor: '#2e8b57', accentColor: '#a8e0bd', capColor: '#2e8b57', tagline: '%1,5 yağ' },
  },
  {
    key: 'yogurt-suzme-750', name: 'Süzme Yoğurt 750 g', brand: 'Köy Kaymağı', category: 'SUT_URUNLERI', subcategory: 'Yoğurt',
    packagingType: 'yogurt_cup', dims: [118, 92, 118], netWeightG: 750, priceKurus: 6990, stock: 80,
    appearance: { primaryColor: '#ffffff', secondaryColor: '#123e7c', accentColor: '#f2c94c', capColor: '#d9dde3', tagline: 'Kremamsı' },
  },
  {
    key: 'yogurt-cilek-125', name: 'Çilekli Yoğurt 125 g', brand: 'Köy Kaymağı', category: 'SUT_URUNLERI', subcategory: 'Yoğurt',
    packagingType: 'yogurt_cup', dims: [70, 62, 70], netWeightG: 125, priceKurus: 1450, stock: 150,
    promotion: { type: 'multibuy', buy: 4, pay: 3 },
    appearance: { primaryColor: '#ffe4ec', secondaryColor: '#d6336c', accentColor: '#ffffff', capColor: '#f8bbd0', tagline: 'Meyve parçacıklı' },
  },
  {
    key: 'ayran-1l', name: 'Ayran 1 L', brand: 'Yaylapınarı', category: 'SUT_URUNLERI', subcategory: 'Ayran',
    packagingType: 'pet_bottle', dims: [82, 232, 82], volumeMl: 1000, priceKurus: 2950, stock: 90,
    appearance: { primaryColor: '#ffffff', secondaryColor: '#0f4c81', accentColor: '#5aa9e6', capColor: '#0f4c81', bodyColor: '#f6f6f2', tagline: 'Köpüklü' },
  },
  {
    key: 'kasar-400', name: 'Kaşar Peyniri 400 g', brand: 'Köy Kaymağı', category: 'SUT_URUNLERI', subcategory: 'Peynir',
    packagingType: 'carton_box', dims: [150, 40, 105], netWeightG: 400, priceKurus: 14950, stock: 60,
    appearance: { primaryColor: '#ffd65a', secondaryColor: '#7a4b00', accentColor: '#ffffff', tagline: 'Taze kaşar' },
  },
  // --- İçecek --------------------------------------------------------------
  {
    key: 'su-1-5l', name: 'Doğal Kaynak Suyu 1,5 L', brand: 'Berrasu', category: 'ICECEK', subcategory: 'Su',
    packagingType: 'pet_bottle', dims: [88, 320, 88], volumeMl: 1500, priceKurus: 1250, stock: 300,
    appearance: { primaryColor: '#e6f4ff', secondaryColor: '#0077c8', accentColor: '#7fd1ff', capColor: '#0077c8', bodyColor: '#cfe8f7', tagline: 'Doğal kaynak' },
  },
  {
    key: 'su-0-5l', name: 'Doğal Kaynak Suyu 0,5 L', brand: 'Berrasu', category: 'ICECEK', subcategory: 'Su',
    packagingType: 'pet_bottle', dims: [65, 205, 65], volumeMl: 500, priceKurus: 650, stock: 300,
    appearance: { primaryColor: '#e6f4ff', secondaryColor: '#0077c8', accentColor: '#7fd1ff', capColor: '#4fb0ff', bodyColor: '#cfe8f7', tagline: 'Doğal kaynak' },
  },
  {
    key: 'kola-1l', name: 'Kola Gazlı İçecek 1 L', brand: 'Fizzo', category: 'ICECEK', subcategory: 'Gazlı içecek',
    packagingType: 'pet_bottle', dims: [82, 295, 82], volumeMl: 1000, priceKurus: 4250, stock: 200,
    appearance: { primaryColor: '#c8102e', secondaryColor: '#ffffff', accentColor: '#1a1a1a', capColor: '#c8102e', bodyColor: '#3b1a0e', tagline: 'Ferahlatıcı' },
  },
  {
    key: 'gazoz-kutu-330', name: 'Limonlu Gazoz Kutu 330 ml', brand: 'Fizzo', category: 'ICECEK', subcategory: 'Gazlı içecek',
    packagingType: 'beverage_can', dims: [66, 122, 66], volumeMl: 330, priceKurus: 2750, stock: 240,
    promotion: { type: 'multibuy', buy: 3, pay: 2 },
    appearance: { primaryColor: '#9ad94b', secondaryColor: '#1f5f1a', accentColor: '#fff36b', tagline: 'Limon aromalı' },
  },
  {
    key: 'portakal-suyu-1l', name: 'Portakal Meyve Suyu 1 L', brand: 'Bahçeden', category: 'ICECEK', subcategory: 'Meyve suyu',
    packagingType: 'carton_box', dims: [65, 195, 95], volumeMl: 1000, priceKurus: 5450, stock: 110,
    appearance: { primaryColor: '#ff9f1c', secondaryColor: '#ffffff', accentColor: '#2d6a4f', capColor: '#2d6a4f', tagline: '%100 meyve' },
  },
  {
    key: 'maden-suyu-200', name: 'Maden Suyu 200 ml', brand: 'Kayakaynak', category: 'ICECEK', subcategory: 'Maden suyu',
    packagingType: 'glass_bottle', dims: [56, 168, 56], volumeMl: 200, priceKurus: 900, stock: 260,
    appearance: { primaryColor: '#0b6e4f', secondaryColor: '#ffffff', accentColor: '#c9a227', capColor: '#c0c4c8', bodyColor: '#2f8f5b', tagline: 'Doğal mineralli' },
  },
  {
    key: 'enerji-250', name: 'Enerji İçeceği 250 ml', brand: 'Voltra', category: 'ICECEK', subcategory: 'Enerji içeceği',
    packagingType: 'beverage_can', dims: [53, 135, 53], volumeMl: 250, priceKurus: 4900, stock: 150,
    appearance: { primaryColor: '#14213d', secondaryColor: '#fca311', accentColor: '#e5e5e5', tagline: 'Enerji' },
  },
  // --- Temel gıda -----------------------------------------------------------
  {
    key: 'makarna-burgu-500', name: 'Burgu Makarna 500 g', brand: 'Başak Sofrası', category: 'GIDA', subcategory: 'Makarna',
    packagingType: 'pasta_pack', dims: [150, 230, 55], netWeightG: 500, priceKurus: 2750, stock: 180,
    appearance: { primaryColor: '#1e4fa3', secondaryColor: '#f5d76e', accentColor: '#ffffff', tagline: 'Durum buğdayı' },
  },
  {
    key: 'spagetti-500', name: 'Spagetti 500 g', brand: 'Başak Sofrası', category: 'GIDA', subcategory: 'Makarna',
    packagingType: 'pasta_pack', dims: [95, 275, 40], netWeightG: 500, priceKurus: 2650, stock: 180,
    appearance: { primaryColor: '#1e4fa3', secondaryColor: '#f5d76e', accentColor: '#e63946', tagline: 'Durum buğdayı' },
  },
  {
    key: 'salca-830', name: 'Domates Salçası 830 g', brand: 'Güneşli Tarla', category: 'GIDA', subcategory: 'Salça',
    packagingType: 'tin_can', dims: [100, 118, 100], netWeightG: 830, priceKurus: 7450, stock: 90,
    appearance: { primaryColor: '#d62828', secondaryColor: '#ffffff', accentColor: '#2a9d8f', tagline: 'Güneşte olgunlaşmış' },
  },
  {
    key: 'nohut-400', name: 'Haşlanmış Nohut 400 g', brand: 'Güneşli Tarla', category: 'GIDA', subcategory: 'Konserve',
    packagingType: 'tin_can', dims: [74, 110, 74], netWeightG: 400, priceKurus: 3250, stock: 120,
    appearance: { primaryColor: '#e9c46a', secondaryColor: '#264653', accentColor: '#ffffff', tagline: 'Pratik' },
  },
  {
    key: 'aycicek-1l', name: 'Ayçiçek Yağı 1 L', brand: 'Altın Tarla', category: 'GIDA', subcategory: 'Yağ',
    packagingType: 'pet_bottle', dims: [86, 290, 86], volumeMl: 1000, priceKurus: 8950, stock: 100,
    appearance: { primaryColor: '#ffd000', secondaryColor: '#006837', accentColor: '#ffffff', capColor: '#006837', bodyColor: '#f2c230', tagline: 'Saf ayçiçek' },
  },
  {
    key: 'pirinc-1kg', name: 'Baldo Pirinç 1 kg', brand: 'Başak Sofrası', category: 'GIDA', subcategory: 'Bakliyat',
    packagingType: 'pouch', dims: [160, 245, 70], netWeightG: 1000, priceKurus: 8950, stock: 90,
    appearance: { primaryColor: '#f1faee', secondaryColor: '#457b9d', accentColor: '#e63946', capColor: '#d8e2dc', tagline: 'Baldo' },
  },
  // --- Kahvaltılık ----------------------------------------------------------
  {
    key: 'recel-cilek-380', name: 'Çilek Reçeli 380 g', brand: 'Bahçeden', category: 'KAHVALTILIK', subcategory: 'Reçel',
    packagingType: 'jar', dims: [76, 118, 76], netWeightG: 380, priceKurus: 6450, stock: 80,
    appearance: { primaryColor: '#fff1e6', secondaryColor: '#b5179e', accentColor: '#d00000', capColor: '#d00000', bodyColor: '#8b0a1a', tagline: 'Ev usulü' },
  },
  {
    key: 'bal-460', name: 'Çiçek Balı 460 g', brand: 'Arıkovanı', category: 'KAHVALTILIK', subcategory: 'Bal',
    packagingType: 'jar', dims: [82, 128, 82], netWeightG: 460, priceKurus: 15900, stock: 50,
    appearance: { primaryColor: '#fff8e1', secondaryColor: '#8d5b00', accentColor: '#f4a300', capColor: '#c99700', bodyColor: '#e09b10', tagline: 'Süzme bal' },
  },
  {
    key: 'misir-gevregi-375', name: 'Mısır Gevreği 375 g', brand: 'Sabah Neşesi', category: 'KAHVALTILIK', subcategory: 'Kahvaltılık gevrek',
    packagingType: 'carton_box', dims: [195, 285, 70], netWeightG: 375, priceKurus: 8900, stock: 70,
    promotion: { type: 'percent', percent: 15 },
    appearance: { primaryColor: '#ffb703', secondaryColor: '#023047', accentColor: '#fb8500', tagline: 'Çıtır mısır' },
  },
  {
    key: 'findik-kremasi-400', name: 'Kakaolu Fındık Kreması 400 g', brand: 'Sabah Neşesi', category: 'KAHVALTILIK', subcategory: 'Krema',
    packagingType: 'jar', dims: [80, 112, 80], netWeightG: 400, priceKurus: 11900, stock: 60,
    appearance: { primaryColor: '#ffffff', secondaryColor: '#5e3023', accentColor: '#e07a5f', capColor: '#ffffff', bodyColor: '#4a2511', tagline: 'Fındıklı' },
  },
  // --- Atıştırmalık ---------------------------------------------------------
  {
    key: 'cips-klasik-150', name: 'Klasik Patates Cipsi 150 g', brand: 'Kıtırca', category: 'ATISTIRMALIK', subcategory: 'Cips',
    packagingType: 'chips_bag', dims: [190, 270, 75], netWeightG: 150, priceKurus: 4250, stock: 140,
    promotion: { type: 'percent', percent: 20 },
    appearance: { primaryColor: '#ffd23f', secondaryColor: '#d62828', accentColor: '#ffffff', tagline: 'Tuzlu' },
  },
  {
    key: 'cips-baharat-150', name: 'Baharatlı Patates Cipsi 150 g', brand: 'Kıtırca', category: 'ATISTIRMALIK', subcategory: 'Cips',
    packagingType: 'chips_bag', dims: [190, 270, 75], netWeightG: 150, priceKurus: 4250, stock: 140,
    appearance: { primaryColor: '#e85d04', secondaryColor: '#370617', accentColor: '#ffba08', tagline: 'Acı baharatlı' },
  },
  {
    key: 'biskuvi-kakao-300', name: 'Kakaolu Bisküvi 300 g', brand: 'Fırından', category: 'ATISTIRMALIK', subcategory: 'Bisküvi',
    packagingType: 'biscuit_pack', dims: [215, 58, 58], netWeightG: 300, priceKurus: 2950, stock: 160,
    appearance: { primaryColor: '#6f1d1b', secondaryColor: '#ffe6a7', accentColor: '#bb9457', capColor: '#432818', tagline: 'Kakaolu' },
  },
  {
    key: 'cikolata-sutlu-80', name: 'Sütlü Çikolata 80 g', brand: 'Kakaova', category: 'ATISTIRMALIK', subcategory: 'Çikolata',
    packagingType: 'carton_box', dims: [80, 165, 18], netWeightG: 80, priceKurus: 3450, stock: 200,
    appearance: { primaryColor: '#5b2a86', secondaryColor: '#ffffff', accentColor: '#a06cd5', tagline: 'Sütlü' },
  },
  {
    key: 'kraker-120', name: 'Tuzlu Kraker 120 g', brand: 'Fırından', category: 'ATISTIRMALIK', subcategory: 'Kraker',
    packagingType: 'carton_box', dims: [130, 200, 45], netWeightG: 120, priceKurus: 2250, stock: 120,
    appearance: { primaryColor: '#ee9b00', secondaryColor: '#005f73', accentColor: '#ffffff', tagline: 'Çıtır kraker' },
  },
  // --- Temizlik -------------------------------------------------------------
  {
    key: 'deterjan-sivi-2500', name: 'Sıvı Çamaşır Deterjanı 2,5 L', brand: 'Parlak', category: 'TEMIZLIK', subcategory: 'Çamaşır',
    packagingType: 'detergent_bottle', dims: [175, 300, 110], volumeMl: 2500, priceKurus: 18900, stock: 50,
    appearance: { primaryColor: '#3a86ff', secondaryColor: '#ffffff', accentColor: '#ff006e', capColor: '#ff006e', bodyColor: '#3a86ff', tagline: 'Renkliler için' },
  },
  {
    key: 'bulasik-750', name: 'Bulaşık Deterjanı 750 ml', brand: 'Parlak', category: 'TEMIZLIK', subcategory: 'Bulaşık',
    packagingType: 'shampoo_bottle', dims: [88, 245, 52], volumeMl: 750, priceKurus: 5450, stock: 80,
    appearance: { primaryColor: '#80ed99', secondaryColor: '#14532d', accentColor: '#ffffff', capColor: '#14532d', bodyColor: '#57cc99', tagline: 'Limon' },
  },
  {
    key: 'yuzey-temizleyici-1l', name: 'Yüzey Temizleyici 1 L', brand: 'Parlak', category: 'TEMIZLIK', subcategory: 'Yüzey',
    packagingType: 'detergent_bottle', dims: [110, 260, 70], volumeMl: 1000, priceKurus: 6950, stock: 70,
    appearance: { primaryColor: '#ffbe0b', secondaryColor: '#3d348b', accentColor: '#ffffff', capColor: '#3d348b', bodyColor: '#ffbe0b', tagline: 'Çam ferahlığı' },
  },
  {
    key: 'oda-spreyi-300', name: 'Oda Spreyi 300 ml', brand: 'Esinti', category: 'TEMIZLIK', subcategory: 'Oda kokusu',
    packagingType: 'spray', dims: [66, 205, 66], volumeMl: 300, priceKurus: 6450, stock: 60,
    appearance: { primaryColor: '#cdb4db', secondaryColor: '#3c096c', accentColor: '#ffffff', capColor: '#ffffff', tagline: 'Lavanta' },
  },
  // --- Kişisel bakım -------------------------------------------------------
  {
    key: 'sampuan-500', name: 'Şampuan 500 ml', brand: 'Saçsever', category: 'KISISEL_BAKIM', subcategory: 'Saç bakım',
    packagingType: 'shampoo_bottle', dims: [92, 225, 56], volumeMl: 500, priceKurus: 9450, stock: 70,
    promotion: { type: 'percent', percent: 25 },
    appearance: { primaryColor: '#0d3b66', secondaryColor: '#faf0ca', accentColor: '#f4d35e', capColor: '#faf0ca', bodyColor: '#0d3b66', tagline: 'Onarıcı bakım' },
  },
  {
    key: 'dis-macunu-75', name: 'Diş Macunu 75 ml', brand: 'Beyazdiş', category: 'KISISEL_BAKIM', subcategory: 'Ağız bakım',
    packagingType: 'tube', dims: [185, 40, 48], volumeMl: 75, priceKurus: 4450, stock: 100,
    appearance: { primaryColor: '#ffffff', secondaryColor: '#d00000', accentColor: '#3a86ff', capColor: '#d00000', tagline: 'Ferah nane' },
  },
  {
    key: 'deodorant-150', name: 'Deodorant 150 ml', brand: 'Esinti', category: 'KISISEL_BAKIM', subcategory: 'Deodorant',
    packagingType: 'spray', dims: [50, 170, 50], volumeMl: 150, priceKurus: 7950, stock: 80,
    appearance: { primaryColor: '#111111', secondaryColor: '#48cae4', accentColor: '#ffffff', capColor: '#48cae4', tagline: '48 saat' },
  },
  {
    key: 'sivi-sabun-500', name: 'Sıvı Sabun 500 ml', brand: 'Saçsever', category: 'KISISEL_BAKIM', subcategory: 'El bakım',
    packagingType: 'shampoo_bottle', dims: [82, 200, 60], volumeMl: 500, priceKurus: 4950, stock: 80,
    appearance: { primaryColor: '#ffc8dd', secondaryColor: '#7b2cbf', accentColor: '#ffffff', capColor: '#ffffff', bodyColor: '#ffafcc', tagline: 'Gül' },
  },
  // --- Meyve & sebze (adet fiyatı, ~kg fiyatından türetilmiş) ---------------
  {
    key: 'elma-kirmizi', name: 'Kırmızı Elma (adet)', brand: 'Yerli Üretim', category: 'MEYVE_SEBZE', subcategory: 'Meyve',
    packagingType: 'fruit', dims: [80, 76, 80], netWeightG: 180, priceKurus: 950, stock: 400,
    appearance: { primaryColor: '#b5121b', secondaryColor: '#e9a23b', accentColor: '#4a2f1a', capColor: '#5b3a1e', shapeVariant: 'apple' },
  },
  {
    key: 'portakal', name: 'Portakal (adet)', brand: 'Yerli Üretim', category: 'MEYVE_SEBZE', subcategory: 'Meyve',
    packagingType: 'fruit', dims: [82, 80, 82], netWeightG: 200, priceKurus: 750, stock: 400,
    appearance: { primaryColor: '#f77f00', secondaryColor: '#fcbf49', accentColor: '#3a5a40', capColor: '#3a5a40', shapeVariant: 'orange' },
  },
  {
    key: 'muz', name: 'Muz (adet)', brand: 'Yerli Üretim', category: 'MEYVE_SEBZE', subcategory: 'Meyve',
    packagingType: 'fruit', dims: [190, 45, 42], netWeightG: 160, priceKurus: 1150, stock: 300,
    appearance: { primaryColor: '#f6d743', secondaryColor: '#c9b037', accentColor: '#3b2f1a', capColor: '#3b2f1a', shapeVariant: 'banana' },
  },
  {
    key: 'limon', name: 'Limon (adet)', brand: 'Yerli Üretim', category: 'MEYVE_SEBZE', subcategory: 'Meyve',
    packagingType: 'fruit', dims: [72, 58, 58], netWeightG: 110, priceKurus: 550, stock: 400,
    appearance: { primaryColor: '#f5e663', secondaryColor: '#d9c63a', accentColor: '#556b2f', capColor: '#556b2f', shapeVariant: 'lemon' },
  },
  {
    key: 'domates', name: 'Domates (adet)', brand: 'Yerli Üretim', category: 'MEYVE_SEBZE', subcategory: 'Sebze',
    packagingType: 'vegetable', dims: [78, 62, 78], netWeightG: 150, priceKurus: 650, stock: 400,
    appearance: { primaryColor: '#e63946', secondaryColor: '#c1121f', accentColor: '#2d6a4f', capColor: '#2d6a4f', shapeVariant: 'tomato' },
  },
  {
    key: 'salatalik', name: 'Salatalık (adet)', brand: 'Yerli Üretim', category: 'MEYVE_SEBZE', subcategory: 'Sebze',
    packagingType: 'vegetable', dims: [200, 46, 46], netWeightG: 180, priceKurus: 600, stock: 300,
    appearance: { primaryColor: '#2d6a4f', secondaryColor: '#52b788', accentColor: '#1b4332', capColor: '#95d5b2', shapeVariant: 'cucumber' },
  },
];

export const DEMO_CATALOG: DemoProduct[] = rows.map((r, i) => ({ ...r, gtin: makeDemoGtin(1001 + i) }));
