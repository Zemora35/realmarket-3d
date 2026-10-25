CREATE TABLE "aisles" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"store_id" text,
	"cursor" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"report" jsonb,
	"input" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"store_product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_positive" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"store_product_id" uuid PRIMARY KEY NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_consistent" CHECK ("inventory"."reserved" >= 0 and "inventory"."on_hand" >= 0 and "inventory"."reserved" <= "inventory"."on_hand")
);
--> statement-breakpoint
CREATE TABLE "model_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"pipeline" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"store_product_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gtin" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_kurus" integer NOT NULL,
	"discount_kurus" integer NOT NULL,
	"line_total_kurus" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"session_id" uuid NOT NULL,
	"store_id" text NOT NULL,
	"user_id" uuid,
	"status" text NOT NULL,
	"subtotal_kurus" integer NOT NULL,
	"discount_kurus" integer NOT NULL,
	"total_kurus" integer NOT NULL,
	"payment_provider" text NOT NULL,
	"payment_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "planogram_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"planogram_id" text NOT NULL,
	"gtin" text NOT NULL,
	"product_id" uuid,
	"level_index" integer NOT NULL,
	"facings" integer NOT NULL,
	"position_x_mm" real,
	"depth_count" integer,
	"stack_count" integer,
	"orientation" text DEFAULT 'front' NOT NULL,
	"quantity" integer
);
--> statement-breakpoint
CREATE TABLE "planograms" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"shelf_id" text NOT NULL,
	"aisle_id" text NOT NULL,
	"name" text,
	"version" integer DEFAULT 1 NOT NULL,
	"document" jsonb NOT NULL,
	"fill_ratio" real DEFAULT 0 NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planograms_shelf_id_unique" UNIQUE("shelf_id")
);
--> statement-breakpoint
CREATE TABLE "product_asset_licenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"asset_type" text NOT NULL,
	"license" text NOT NULL,
	"attribution" text,
	"source_url" text,
	"commercial_use_allowed" boolean,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_barcodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"gtin" text NOT NULL,
	"kind" text NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_barcodes_gtin_unique" UNIQUE("gtin")
);
--> statement-breakpoint
CREATE TABLE "product_data_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"license" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "product_dimensions" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"width_mm" real NOT NULL,
	"height_mm" real NOT NULL,
	"depth_mm" real NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_dimensions_positive" CHECK ("product_dimensions"."width_mm" > 0 and "product_dimensions"."height_mm" > 0 and "product_dimensions"."depth_mm" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"view" text NOT NULL,
	"width" integer,
	"height" integer,
	"content_hash" text,
	"mime_type" text,
	"license_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_models" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"quality" text NOT NULL,
	"format" text NOT NULL,
	"url" text,
	"params" jsonb,
	"triangle_count" integer,
	"lod_levels" integer DEFAULT 2 NOT NULL,
	"generated_by" text NOT NULL,
	"job_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"net_weight_g" integer,
	"volume_ml" integer,
	"packaging_type" text NOT NULL,
	"manufacturer" text,
	"gross_weight_g" integer,
	"model_quality" text DEFAULT 'PLACEHOLDER' NOT NULL,
	"verification" text DEFAULT 'UNVERIFIED' NOT NULL,
	"appearance" jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelf_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"shelf_id" text NOT NULL,
	"level_index" integer NOT NULL,
	"height_from_base_mm" integer NOT NULL,
	"clearance_mm" integer NOT NULL,
	"depth_mm" integer NOT NULL,
	"z_offset_mm" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelf_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"shelf_id" text NOT NULL,
	"planogram_id" text,
	"store_product_id" uuid NOT NULL,
	"level_index" integer NOT NULL,
	"x_mm" real NOT NULL,
	"y_mm" real NOT NULL,
	"z_mm" real NOT NULL,
	"unit_width_mm" real NOT NULL,
	"unit_height_mm" real NOT NULL,
	"unit_depth_mm" real NOT NULL,
	"facings" integer NOT NULL,
	"depth_count" integer NOT NULL,
	"stack_count" integer NOT NULL,
	"capacity" integer NOT NULL,
	"dimensions_verified" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelves" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"aisle_id" text NOT NULL,
	"layout_id" integer NOT NULL,
	"fixture_key" text NOT NULL,
	"kind" text NOT NULL,
	"width_mm" integer NOT NULL,
	"depth_mm" integer NOT NULL,
	"height_mm" integer NOT NULL,
	"position" jsonb NOT NULL,
	"rotation_y" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" text NOT NULL,
	"user_id" uuid,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"address" text
);
--> statement-breakpoint
CREATE TABLE "store_layouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"version" integer NOT NULL,
	"params" jsonb NOT NULL,
	"layout" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_objects" (
	"id" serial PRIMARY KEY NOT NULL,
	"layout_id" integer NOT NULL,
	"object_key" text NOT NULL,
	"type" text NOT NULL,
	"position" jsonb NOT NULL,
	"rotation_y" real NOT NULL,
	"size" jsonb NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "store_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_product_id" uuid NOT NULL,
	"price_kurus" integer NOT NULL,
	"list_price_kurus" integer,
	"promotion" jsonb,
	"is_current" boolean DEFAULT true NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	CONSTRAINT "store_prices_nonnegative" CHECK ("store_prices"."price_kurus" >= 0)
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"store_sku" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"chain" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"store_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "aisles" ADD CONSTRAINT "aisles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_import_jobs" ADD CONSTRAINT "asset_import_jobs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_session_id_shopping_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."shopping_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_generation_jobs" ADD CONSTRAINT "model_generation_jobs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_shopping_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."shopping_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planogram_items" ADD CONSTRAINT "planogram_items_planogram_id_planograms_id_fk" FOREIGN KEY ("planogram_id") REFERENCES "public"."planograms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planogram_items" ADD CONSTRAINT "planogram_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planograms" ADD CONSTRAINT "planograms_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planograms" ADD CONSTRAINT "planograms_shelf_id_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_asset_licenses" ADD CONSTRAINT "product_asset_licenses_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_data_sources" ADD CONSTRAINT "product_data_sources_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_dimensions" ADD CONSTRAINT "product_dimensions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_license_id_product_asset_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."product_asset_licenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_models" ADD CONSTRAINT "product_models_job_id_model_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."model_generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_levels" ADD CONSTRAINT "shelf_levels_shelf_id_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_slots" ADD CONSTRAINT "shelf_slots_shelf_id_shelves_id_fk" FOREIGN KEY ("shelf_id") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_slots" ADD CONSTRAINT "shelf_slots_planogram_id_planograms_id_fk" FOREIGN KEY ("planogram_id") REFERENCES "public"."planograms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_slots" ADD CONSTRAINT "shelf_slots_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_aisle_id_aisles_id_fk" FOREIGN KEY ("aisle_id") REFERENCES "public"."aisles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_layout_id_store_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."store_layouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_branches" ADD CONSTRAINT "store_branches_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_layouts" ADD CONSTRAINT "store_layouts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_objects" ADD CONSTRAINT "store_objects_layout_id_store_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."store_layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_prices" ADD CONSTRAINT "store_prices_store_product_id_store_products_id_fk" FOREIGN KEY ("store_product_id") REFERENCES "public"."store_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aisles_store_code" ON "aisles" USING btree ("store_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_items_session_product" ON "cart_items" USING btree ("session_id","store_product_id");--> statement-breakpoint
CREATE INDEX "products_category" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "shelf_slots_store_product" ON "shelf_slots" USING btree ("store_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shelves_store_fixture" ON "shelves" USING btree ("store_id","fixture_key");--> statement-breakpoint
CREATE UNIQUE INDEX "store_layouts_store_version" ON "store_layouts" USING btree ("store_id","version");--> statement-breakpoint
CREATE INDEX "store_prices_current" ON "store_prices" USING btree ("store_product_id","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "store_products_store_product" ON "store_products" USING btree ("store_id","product_id");