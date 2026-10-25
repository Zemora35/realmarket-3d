import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  ModelQuality,
  PackagingType,
  Planogram,
  PlanogramIssue,
  ProductAppearance,
  Promotion,
  StoreLayout,
  StoreLayoutParams,
  UserRole,
} from '@realmarket/shared';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// --- Kullanıcılar ve mağazalar -------------------------------------------------

export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  chain: text('chain').notNull(),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').$type<UserRole>().notNull(),
  /** store_manager rolü yalnızca bu mağazayı yönetebilir. */
  storeId: text('store_id').references(() => stores.id),
  createdAt: createdAt(),
});

export const storeBranches = pgTable('store_branches', {
  id: serial('id').primaryKey(),
  storeId: text('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  city: text('city'),
  address: text('address'),
});

export const storeLayouts = pgTable(
  'store_layouts',
  {
    id: serial('id').primaryKey(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    params: jsonb('params').$type<StoreLayoutParams>().notNull(),
    layout: jsonb('layout').$type<StoreLayout>().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('store_layouts_store_version').on(t.storeId, t.version)],
);

export const storeObjects = pgTable('store_objects', {
  id: serial('id').primaryKey(),
  layoutId: integer('layout_id')
    .notNull()
    .references(() => storeLayouts.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  type: text('type').notNull(),
  position: jsonb('position').$type<{ x: number; z: number }>().notNull(),
  rotationY: real('rotation_y').notNull(),
  size: jsonb('size').$type<{ x: number; y: number; z: number }>().notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
});

export const aisles = pgTable(
  'aisles',
  {
    id: text('id').primaryKey(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
  },
  (t) => [uniqueIndex('aisles_store_code').on(t.storeId, t.code)],
);

export const shelves = pgTable(
  'shelves',
  {
    /** `${storeId}/${fixtureId}` */
    id: text('id').primaryKey(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    aisleId: text('aisle_id')
      .notNull()
      .references(() => aisles.id),
    layoutId: integer('layout_id')
      .notNull()
      .references(() => storeLayouts.id),
    fixtureKey: text('fixture_key').notNull(),
    kind: text('kind').notNull(),
    widthMm: integer('width_mm').notNull(),
    depthMm: integer('depth_mm').notNull(),
    heightMm: integer('height_mm').notNull(),
    position: jsonb('position').$type<{ x: number; z: number }>().notNull(),
    rotationY: real('rotation_y').notNull(),
  },
  (t) => [uniqueIndex('shelves_store_fixture').on(t.storeId, t.fixtureKey)],
);

export const shelfLevels = pgTable('shelf_levels', {
  id: serial('id').primaryKey(),
  shelfId: text('shelf_id')
    .notNull()
    .references(() => shelves.id, { onDelete: 'cascade' }),
  levelIndex: integer('level_index').notNull(),
  heightFromBaseMm: integer('height_from_base_mm').notNull(),
  clearanceMm: integer('clearance_mm').notNull(),
  depthMm: integer('depth_mm').notNull(),
  zOffsetMm: integer('z_offset_mm').notNull().default(0),
});

// --- Ürün kataloğu (mağazadan bağımsız) ----------------------------------------

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    brand: text('brand').notNull(),
    category: text('category').notNull(),
    subcategory: text('subcategory'),
    netWeightG: integer('net_weight_g'),
    volumeMl: integer('volume_ml'),
    packagingType: text('packaging_type').$type<PackagingType>().notNull(),
    manufacturer: text('manufacturer'),
    grossWeightG: integer('gross_weight_g'),
    modelQuality: text('model_quality').$type<ModelQuality>().notNull().default('PLACEHOLDER'),
    verification: text('verification').notNull().default('UNVERIFIED'),
    appearance: jsonb('appearance').$type<ProductAppearance>().notNull(),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('products_category').on(t.category)],
);

export const productBarcodes = pgTable('product_barcodes', {
  id: serial('id').primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  gtin: text('gtin').notNull().unique(),
  kind: text('kind').notNull(),
  isPrimary: boolean('is_primary').notNull().default(true),
});

export const productDimensions = pgTable(
  'product_dimensions',
  {
    productId: uuid('product_id')
      .primaryKey()
      .references(() => products.id, { onDelete: 'cascade' }),
    widthMm: real('width_mm').notNull(),
    heightMm: real('height_mm').notNull(),
    depthMm: real('depth_mm').notNull(),
    verified: boolean('verified').notNull().default(false),
    source: text('source').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [check('product_dimensions_positive', sql`${t.widthMm} > 0 and ${t.heightMm} > 0 and ${t.depthMm} > 0`)],
);

export const productDataSources = pgTable('product_data_sources', {
  id: serial('id').primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  sourceRef: text('source_ref'),
  license: text('license'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  rawData: jsonb('raw_data'),
});

export const productAssetLicenses = pgTable('product_asset_licenses', {
  id: serial('id').primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  assetType: text('asset_type').notNull(),
  license: text('license').notNull(),
  attribution: text('attribution'),
  sourceUrl: text('source_url'),
  commercialUseAllowed: boolean('commercial_use_allowed'),
  notes: text('notes'),
  createdAt: createdAt(),
});

export const productImages = pgTable('product_images', {
  id: serial('id').primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  view: text('view').notNull(),
  width: integer('width'),
  height: integer('height'),
  contentHash: text('content_hash'),
  mimeType: text('mime_type'),
  licenseId: integer('license_id').references(() => productAssetLicenses.id),
  createdAt: createdAt(),
});

export const modelGenerationJobs = pgTable('model_generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  pipeline: text('pipeline').notNull(),
  status: text('status').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  createdAt: createdAt(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const productModels = pgTable('product_models', {
  id: serial('id').primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  quality: text('quality').$type<ModelQuality>().notNull(),
  format: text('format').notNull(),
  url: text('url'),
  params: jsonb('params'),
  triangleCount: integer('triangle_count'),
  lodLevels: integer('lod_levels').notNull().default(2),
  generatedBy: text('generated_by').notNull(),
  jobId: uuid('job_id').references(() => modelGenerationJobs.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

// --- Mağaza satış verisi -------------------------------------------------------

export const storeProducts = pgTable(
  'store_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeSku: text('store_sku'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('store_products_store_product').on(t.storeId, t.productId)],
);

export const storePrices = pgTable(
  'store_prices',
  {
    id: serial('id').primaryKey(),
    storeProductId: uuid('store_product_id')
      .notNull()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    priceKurus: integer('price_kurus').notNull(),
    listPriceKurus: integer('list_price_kurus'),
    promotion: jsonb('promotion').$type<Promotion | null>(),
    isCurrent: boolean('is_current').notNull().default(true),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),
  },
  (t) => [
    check('store_prices_nonnegative', sql`${t.priceKurus} >= 0`),
    index('store_prices_current').on(t.storeProductId, t.isCurrent),
  ],
);

export const inventory = pgTable(
  'inventory',
  {
    storeProductId: uuid('store_product_id')
      .primaryKey()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    onHand: integer('on_hand').notNull().default(0),
    /** Aktif sepetlerde ayrılmış adet. */
    reserved: integer('reserved').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [check('inventory_consistent', sql`${t.reserved} >= 0 and ${t.onHand} >= 0 and ${t.reserved} <= ${t.onHand}`)],
);

export const planograms = pgTable('planograms', {
  id: text('id').primaryKey(),
  storeId: text('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  shelfId: text('shelf_id')
    .notNull()
    .references(() => shelves.id, { onDelete: 'cascade' })
    .unique(),
  aisleId: text('aisle_id').notNull(),
  name: text('name'),
  version: integer('version').notNull().default(1),
  document: jsonb('document').$type<Planogram>().notNull(),
  fillRatio: real('fill_ratio').notNull().default(0),
  issues: jsonb('issues').$type<PlanogramIssue[]>().notNull().default([]),
  source: text('source').notNull(),
  updatedAt: updatedAt(),
});

export const planogramItems = pgTable('planogram_items', {
  id: serial('id').primaryKey(),
  planogramId: text('planogram_id')
    .notNull()
    .references(() => planograms.id, { onDelete: 'cascade' }),
  gtin: text('gtin').notNull(),
  productId: uuid('product_id').references(() => products.id),
  levelIndex: integer('level_index').notNull(),
  facings: integer('facings').notNull(),
  positionXMm: real('position_x_mm'),
  depthCount: integer('depth_count'),
  stackCount: integer('stack_count'),
  orientation: text('orientation').notNull().default('front'),
  quantity: integer('quantity'),
});

export const shelfSlots = pgTable(
  'shelf_slots',
  {
    id: text('id').primaryKey(),
    shelfId: text('shelf_id')
      .notNull()
      .references(() => shelves.id, { onDelete: 'cascade' }),
    planogramId: text('planogram_id').references(() => planograms.id, { onDelete: 'cascade' }),
    storeProductId: uuid('store_product_id')
      .notNull()
      .references(() => storeProducts.id),
    levelIndex: integer('level_index').notNull(),
    xMm: real('x_mm').notNull(),
    yMm: real('y_mm').notNull(),
    zMm: real('z_mm').notNull(),
    unitWidthMm: real('unit_width_mm').notNull(),
    unitHeightMm: real('unit_height_mm').notNull(),
    unitDepthMm: real('unit_depth_mm').notNull(),
    facings: integer('facings').notNull(),
    depthCount: integer('depth_count').notNull(),
    stackCount: integer('stack_count').notNull(),
    capacity: integer('capacity').notNull(),
    dimensionsVerified: boolean('dimensions_verified').notNull(),
  },
  (t) => [index('shelf_slots_store_product').on(t.storeProductId)],
);

// --- Alışveriş ve siparişler ---------------------------------------------------

export const shoppingSessions = pgTable('shopping_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: text('store_id')
    .notNull()
    .references(() => stores.id),
  userId: uuid('user_id').references(() => users.id),
  /** Oturum anahtarının SHA-256 özeti; ham anahtar yalnızca istemcide. */
  tokenHash: text('token_hash').notNull(),
  status: text('status').$type<'active' | 'checked_out' | 'abandoned'>().notNull().default('active'),
  createdAt: createdAt(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => shoppingSessions.id, { onDelete: 'cascade' }),
    storeProductId: uuid('store_product_id')
      .notNull()
      .references(() => storeProducts.id),
    quantity: integer('quantity').notNull(),
    addedAt: createdAt(),
  },
  (t) => [
    uniqueIndex('cart_items_session_product').on(t.sessionId, t.storeProductId),
    check('cart_items_positive', sql`${t.quantity} > 0`),
  ],
);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: text('order_number').notNull().unique(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => shoppingSessions.id)
    .unique(),
  storeId: text('store_id')
    .notNull()
    .references(() => stores.id),
  userId: uuid('user_id').references(() => users.id),
  status: text('status').notNull(),
  subtotalKurus: integer('subtotal_kurus').notNull(),
  discountKurus: integer('discount_kurus').notNull(),
  totalKurus: integer('total_kurus').notNull(),
  paymentProvider: text('payment_provider').notNull(),
  paymentRef: text('payment_ref'),
  createdAt: createdAt(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  storeProductId: uuid('store_product_id')
    .notNull()
    .references(() => storeProducts.id),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  name: text('name').notNull(),
  gtin: text('gtin').notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceKurus: integer('unit_price_kurus').notNull(),
  discountKurus: integer('discount_kurus').notNull(),
  lineTotalKurus: integer('line_total_kurus').notNull(),
});

export const assetImportJobs = pgTable('asset_import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  storeId: text('store_id').references(() => stores.id),
  cursor: integer('cursor').notNull().default(0),
  total: integer('total').notNull().default(0),
  report: jsonb('report'),
  input: jsonb('input'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
