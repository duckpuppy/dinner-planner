-- DATA MIGRATION (custom, dinner-9o1.2): backfill dinner_entries.family_id and
-- collapse duplicate (family_id, date) rows so migration 0037 can add the
-- unique index and tighten the column to NOT NULL.
--
-- Duplicates arose when the "week starts on" setting changed: the new week's
-- menu was generated with fresh entries for dates that already had entries in
-- an overlapping menu of the old week alignment.
--
-- Survivor precedence per (family_id, date), first difference wins:
--   1. has preparations (ratings and photos hang off preparations)
--   2. completed or skipped
--   3. has a plan: type != 'assembled', or main dish / custom text /
--      restaurant set
--   4. has side dishes, custom side text or prep tasks
--   5. most recent updated_at, then smallest id (deterministic)
-- Children of a removed row are moved onto the survivor (never silently
-- dropped): preparations (+ratings, photos), prep tasks, side dishes (union,
-- no repeats) and leftovers source_entry_id references.
--
-- Migrations run with foreign_keys=OFF (see db/migrate.ts), so no cascade
-- fires here; every child is handled explicitly.
UPDATE `dinner_entries` SET `family_id` = (SELECT `family_id` FROM `weekly_menus` WHERE `weekly_menus`.`id` = `dinner_entries`.`menu_id`) WHERE `family_id` IS NULL;
--> statement-breakpoint
CREATE TEMP TABLE `_de_ranked` AS
SELECT `id`, `family_id`, `date`, `menu_id`,
  ROW_NUMBER() OVER (
    PARTITION BY `family_id`, `date`
    ORDER BY `has_prep` DESC, `is_done` DESC, `has_plan` DESC, `has_extras` DESC, `updated_at` DESC, `id` ASC
  ) AS `rn`
FROM (
  SELECT e.`id`, e.`family_id`, e.`date`, e.`menu_id`, e.`updated_at`,
    EXISTS (SELECT 1 FROM `preparations` p WHERE p.`dinner_entry_id` = e.`id`) AS `has_prep`,
    (e.`completed` = 1 OR e.`skipped` = 1) AS `is_done`,
    (e.`type` != 'assembled' OR e.`main_dish_id` IS NOT NULL OR e.`custom_text` IS NOT NULL OR e.`restaurant_name` IS NOT NULL OR e.`restaurant_id` IS NOT NULL) AS `has_plan`,
    (EXISTS (SELECT 1 FROM `entry_side_dishes` s WHERE s.`entry_id` = e.`id`) OR e.`custom_side_text` IS NOT NULL OR EXISTS (SELECT 1 FROM `prep_tasks` t WHERE t.`entry_id` = e.`id`)) AS `has_extras`
  FROM `dinner_entries` e
);
--> statement-breakpoint
CREATE TEMP TABLE `_de_dups` AS
SELECT d.`id` AS `dup_id`, k.`id` AS `keep_id`, d.`menu_id` AS `dup_menu_id`
FROM `_de_ranked` d
JOIN `_de_ranked` k ON k.`family_id` = d.`family_id` AND k.`date` = d.`date` AND k.`rn` = 1
WHERE d.`rn` > 1;
--> statement-breakpoint
UPDATE `preparations` SET `dinner_entry_id` = (SELECT `keep_id` FROM `_de_dups` WHERE `dup_id` = `preparations`.`dinner_entry_id`) WHERE `dinner_entry_id` IN (SELECT `dup_id` FROM `_de_dups`);
--> statement-breakpoint
DELETE FROM `prep_tasks` WHERE `entry_id` IN (SELECT `dup_id` FROM `_de_dups`) AND EXISTS (SELECT 1 FROM `_de_dups` x JOIN `prep_tasks` kt ON kt.`entry_id` = x.`keep_id` WHERE x.`dup_id` = `prep_tasks`.`entry_id` AND kt.`description` = `prep_tasks`.`description`);
--> statement-breakpoint
UPDATE `prep_tasks` SET `entry_id` = (SELECT `keep_id` FROM `_de_dups` WHERE `dup_id` = `prep_tasks`.`entry_id`) WHERE `entry_id` IN (SELECT `dup_id` FROM `_de_dups`);
--> statement-breakpoint
INSERT INTO `entry_side_dishes` (`entry_id`, `dish_id`)
SELECT DISTINCT x.`keep_id`, sd.`dish_id`
FROM `entry_side_dishes` sd
JOIN `_de_dups` x ON x.`dup_id` = sd.`entry_id`
WHERE NOT EXISTS (SELECT 1 FROM `entry_side_dishes` ex WHERE ex.`entry_id` = x.`keep_id` AND ex.`dish_id` = sd.`dish_id`);
--> statement-breakpoint
DELETE FROM `entry_side_dishes` WHERE `entry_id` IN (SELECT `dup_id` FROM `_de_dups`);
--> statement-breakpoint
-- Leftovers sources: a source must not itself be a leftovers entry, and an entry
-- cannot be its own source. Re-point to the survivor when valid, else clear.
UPDATE `dinner_entries` SET `source_entry_id` = (
  SELECT CASE WHEN k.`type` = 'leftovers' OR k.`id` = `dinner_entries`.`id` THEN NULL ELSE k.`id` END
  FROM `_de_dups` x JOIN `dinner_entries` k ON k.`id` = x.`keep_id`
  WHERE x.`dup_id` = `dinner_entries`.`source_entry_id`
) WHERE `source_entry_id` IN (SELECT `dup_id` FROM `_de_dups`);
--> statement-breakpoint
-- A surviving leftovers entry with no source adopts the removed row's source.
UPDATE `dinner_entries` SET `source_entry_id` = (
  SELECT d.`source_entry_id` FROM `_de_dups` x JOIN `dinner_entries` d ON d.`id` = x.`dup_id`
  WHERE x.`keep_id` = `dinner_entries`.`id` AND d.`source_entry_id` IS NOT NULL
    AND d.`source_entry_id` != `dinner_entries`.`id`
    AND d.`source_entry_id` NOT IN (SELECT `dup_id` FROM `_de_dups`)
  LIMIT 1
) WHERE `type` = 'leftovers' AND `source_entry_id` IS NULL AND `id` IN (SELECT `keep_id` FROM `_de_dups`);
--> statement-breakpoint
DELETE FROM `dinner_entries` WHERE `id` IN (SELECT `dup_id` FROM `_de_dups`);
--> statement-breakpoint
DELETE FROM `weekly_menus` WHERE `id` IN (SELECT `dup_menu_id` FROM `_de_dups`) AND NOT EXISTS (SELECT 1 FROM `dinner_entries` e WHERE e.`menu_id` = `weekly_menus`.`id`);
--> statement-breakpoint
DROP TABLE `_de_dups`;
--> statement-breakpoint
DROP TABLE `_de_ranked`;
