ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_num_teams_check";
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_num_teams_check" CHECK (num_teams >= 2 AND num_teams <= 5);
