PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stores` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_stores`("id", "family_id", "name", "created_at") SELECT "id", "family_id", "name", "created_at" FROM `stores`;--> statement-breakpoint
DROP TABLE `stores`;--> statement-breakpoint
ALTER TABLE `__new_stores` RENAME TO `stores`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `stores_family_name_unique` ON `stores` (`family_id`,`name`);--> statement-breakpoint
CREATE TABLE `__new_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_tags`("id", "family_id", "name") SELECT "id", "family_id", "name" FROM `tags`;--> statement-breakpoint
DROP TABLE `tags`;--> statement-breakpoint
ALTER TABLE `__new_tags` RENAME TO `tags`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_family_name_unique` ON `tags` (`family_id`,`name`);--> statement-breakpoint
CREATE TABLE `__new_grocery_checks` (
	`family_id` text NOT NULL,
	`week_date` text NOT NULL,
	`item_key` text NOT NULL,
	`item_name` text NOT NULL,
	`checked_by_user_id` text NOT NULL,
	`checked_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`family_id`, `week_date`, `item_key`),
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`checked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_grocery_checks`("family_id", "week_date", "item_key", "item_name", "checked_by_user_id", "checked_at") SELECT "family_id", "week_date", "item_key", "item_name", "checked_by_user_id", "checked_at" FROM `grocery_checks`;--> statement-breakpoint
DROP TABLE `grocery_checks`;--> statement-breakpoint
ALTER TABLE `__new_grocery_checks` RENAME TO `grocery_checks`;--> statement-breakpoint
CREATE TABLE `__new_custom_grocery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`week_date` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`store_id` text,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_custom_grocery_items`("id", "family_id", "week_date", "name", "quantity", "unit", "sort_order", "created_at", "store_id") SELECT "id", "family_id", "week_date", "name", "quantity", "unit", "sort_order", "created_at", "store_id" FROM `custom_grocery_items`;--> statement-breakpoint
DROP TABLE `custom_grocery_items`;--> statement-breakpoint
ALTER TABLE `__new_custom_grocery_items` RENAME TO `custom_grocery_items`;--> statement-breakpoint
CREATE TABLE `__new_pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`ingredient_name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_pantry_items`("id", "family_id", "ingredient_name", "quantity", "unit", "expires_at", "created_at") SELECT "id", "family_id", "ingredient_name", "quantity", "unit", "expires_at", "created_at" FROM `pantry_items`;--> statement-breakpoint
DROP TABLE `pantry_items`;--> statement-breakpoint
ALTER TABLE `__new_pantry_items` RENAME TO `pantry_items`;--> statement-breakpoint
CREATE TABLE `__new_recurring_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`label` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`type` text DEFAULT 'assembled' NOT NULL,
	`main_dish_id` text,
	`custom_text` text,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`main_dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_recurring_patterns`("id", "family_id", "label", "day_of_week", "type", "main_dish_id", "custom_text", "created_by_id", "created_at") SELECT "id", "family_id", "label", "day_of_week", "type", "main_dish_id", "custom_text", "created_by_id", "created_at" FROM `recurring_patterns`;--> statement-breakpoint
DROP TABLE `recurring_patterns`;--> statement-breakpoint
ALTER TABLE `__new_recurring_patterns` RENAME TO `recurring_patterns`;--> statement-breakpoint
CREATE TABLE `__new_standing_items` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`category` text DEFAULT 'Other' NOT NULL,
	`store_id` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_standing_items`("id", "family_id", "name", "quantity", "unit", "category", "store_id", "created_by", "created_at") SELECT "id", "family_id", "name", "quantity", "unit", "category", "store_id", "created_by", "created_at" FROM `standing_items`;--> statement-breakpoint
DROP TABLE `standing_items`;--> statement-breakpoint
ALTER TABLE `__new_standing_items` RENAME TO `standing_items`;