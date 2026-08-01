DROP INDEX `weekly_menus_week_start_date_unique`;--> statement-breakpoint
ALTER TABLE `weekly_menus` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_menus_family_week_unique` ON `weekly_menus` (`family_id`,`week_start_date`);--> statement-breakpoint
ALTER TABLE `dishes` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
ALTER TABLE `restaurants` ADD `family_id` text REFERENCES families(id);
--> statement-breakpoint
-- DATA BACKFILL (hand-added, not schema DDL -- see dinner-7pt.4, same pattern
-- as 0025_breezy_smasher.sql / dinner-7pt.1). family_id is added nullable
-- above because SQLite refuses to add a REFERENCES column with a non-NULL
-- default to a non-empty table. This backfills every pre-existing anchor row
-- (dishes/weekly_menus/restaurants) onto the single "Default Family" seeded
-- in migration 0025, so upgrading an existing single-tenant install is a
-- no-op from the user's perspective. Migration 0028 (fully generated) then
-- tightens all three columns to NOT NULL now that no NULLs remain.
UPDATE `dishes` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;
--> statement-breakpoint
UPDATE `weekly_menus` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;
--> statement-breakpoint
UPDATE `restaurants` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;