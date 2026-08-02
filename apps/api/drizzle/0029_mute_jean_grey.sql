ALTER TABLE `custom_grocery_items` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
ALTER TABLE `grocery_checks` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
ALTER TABLE `pantry_items` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
ALTER TABLE `recurring_patterns` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
ALTER TABLE `standing_items` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
ALTER TABLE `stores` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
ALTER TABLE `tags` ADD `family_id` text REFERENCES families(id);
--> statement-breakpoint
-- DATA BACKFILL (hand-added, not schema DDL -- see dinner-7pt.5, same
-- pattern as 0025_breezy_smasher.sql / 0027_furry_trauma.sql). family_id is
-- added nullable above because SQLite refuses to add a REFERENCES column
-- with a non-NULL default to a non-empty table. This backfills every
-- pre-existing row in these 7 orphan tables (no FK path to an anchor table)
-- onto the single "Default Family" seeded in migration 0025, so upgrading
-- an existing single-tenant install is a no-op from the user's perspective.
-- Migration 0030 (fully generated) then tightens all seven columns to
-- NOT NULL now that no NULLs remain.
UPDATE `custom_grocery_items` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;
--> statement-breakpoint
UPDATE `grocery_checks` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;
--> statement-breakpoint
UPDATE `pantry_items` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;
--> statement-breakpoint
UPDATE `recurring_patterns` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;
--> statement-breakpoint
UPDATE `standing_items` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;
--> statement-breakpoint
UPDATE `stores` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;
--> statement-breakpoint
UPDATE `tags` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;