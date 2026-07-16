ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "photo_url" text;
