CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `users` ADD `family_id` text REFERENCES families(id);
--> statement-breakpoint
-- DATA BACKFILL (hand-added, not schema DDL -- see dinner-7pt.1).
-- family_id is added nullable above because SQLite refuses to add a
-- REFERENCES column with a non-NULL default to a non-empty table. These two
-- statements backfill it instead: seed a "Default Family" and attach every
-- pre-existing user to it, so upgrading an existing single-tenant install is
-- a no-op from the user's perspective. Migration 0026 (fully generated)
-- then tightens the column to NOT NULL now that no NULLs remain.
INSERT INTO `families` (`id`, `name`) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Family');
--> statement-breakpoint
UPDATE `users` SET `family_id` = '00000000-0000-0000-0000-000000000001' WHERE `family_id` IS NULL;