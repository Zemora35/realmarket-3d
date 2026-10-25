import { z } from 'zod';
import {
  ASSET_LICENSES,
  DATA_SOURCES,
  DATA_VERIFICATION,
  IMAGE_VIEWS,
  MODEL_QUALITY,
  PACKAGING_TYPES,
} from './enums.js';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Renk #RRGGBB biçiminde olmalı');

/** Prosedürel model ve etiket üretimi için görünüm parametreleri. */
export const productAppearanceSchema = z.object({
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
  /** Kapak/kapak folyosu/sap gibi ikincil parça rengi. */
  capColor: hexColor.optional(),
  /** Gövde (etiket dışı) rengi: sıvı rengi, cam rengi vb. */
  bodyColor: hexColor.optional(),
  /** Meyve/sebze ya da özel geometrili ürünlerde şekil varyantı. */
  shapeVariant: z.string().max(40).optional(),
  /** Etiket üzerindeki kısa slogan / tür bilgisi. */
  tagline: z.string().max(60).optional(),
});
export type ProductAppearance = z.infer<typeof productAppearanceSchema>;

export const productDimensionsSchema = z.object({
  widthMm: z.number().positive().max(2000),
  heightMm: z.number().positive().max(2000),
  depthMm: z.number().positive().max(2000),
  /** true yalnızca fiziksel ölçüm / yetkili kaynak ile doğrulanan ölçüler için. */
  verified: z.boolean(),
  source: z.string().max(80),
});
export type ProductDimensions = z.infer<typeof productDimensionsSchema>;

export const productImageSchema = z.object({
  id: z.number().int(),
  url: z.string(),
  view: z.enum(IMAGE_VIEWS),
  license: z.enum(ASSET_LICENSES),
  attribution: z.string().nullable().optional(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

/** Mağazadan bağımsız katalog ürünü. */
export const catalogProductSchema = z.object({
  id: z.string(),
  gtin: z.string(),
  name: z.string(),
  brand: z.string(),
  category: z.string(),
  subcategory: z.string().nullable().optional(),
  netWeightG: z.number().nullable().optional(),
  volumeMl: z.number().nullable().optional(),
  packagingType: z.enum(PACKAGING_TYPES),
  dimensions: productDimensionsSchema.nullable(),
  grossWeightG: z.number().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  dataSource: z.enum(DATA_SOURCES),
  verification: z.enum(DATA_VERIFICATION),
  modelQuality: z.enum(MODEL_QUALITY),
  modelUrl: z.string().nullable().optional(),
  appearance: productAppearanceSchema,
  images: z.array(productImageSchema).default([]),
  isDemo: z.boolean(),
});
export type CatalogProduct = z.infer<typeof catalogProductSchema>;

/** İndirim kuralları — fiyatlar daima sunucuda hesaplanır. */
export const promotionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), percent: z.number().min(1).max(90), label: z.string().max(40).optional() }),
  z.object({
    type: z.literal('multibuy'),
    buy: z.number().int().min(2).max(10),
    pay: z.number().int().min(1).max(9),
    label: z.string().max(40).optional(),
  }),
]);
export type Promotion = z.infer<typeof promotionSchema>;

/** Mağazaya özgü satış verisi (fiyat, stok, raf kodu). */
export const storeProductSchema = z.object({
  storeProductId: z.string(),
  storeSku: z.string().nullable().optional(),
  priceKurus: z.number().int().nonnegative(),
  listPriceKurus: z.number().int().nonnegative().nullable().optional(),
  promotion: promotionSchema.nullable().optional(),
  available: z.number().int(),
  isActive: z.boolean(),
});
export type StoreProduct = z.infer<typeof storeProductSchema>;

export type SceneProduct = CatalogProduct & StoreProduct;
