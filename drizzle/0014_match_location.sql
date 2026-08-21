ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "location_name" text;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "location_lat" double precision;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "location_lng" double precision;
