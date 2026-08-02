PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_dishes` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`prep_time` integer,
	`cook_time` integer,
	`servings` integer,
	`calories` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`source_url` text,
	`video_url` text,
	`local_video_filename` text,
	`video_thumbnail_filename` text,
	`video_size` integer,
	`video_duration` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_dishes`("id", "family_id", "name", "description", "type", "instructions", "prep_time", "cook_time", "servings", "calories", "protein_g", "carbs_g", "fat_g", "source_url", "video_url", "local_video_filename", "video_thumbnail_filename", "video_size", "video_duration", "archived", "created_by_id", "created_at", "updated_at") SELECT "id", "family_id", "name", "description", "type", "instructions", "prep_time", "cook_time", "servings", "calories", "protein_g", "carbs_g", "fat_g", "source_url", "video_url", "local_video_filename", "video_thumbnail_filename", "video_size", "video_duration", "archived", "created_by_id", "created_at", "updated_at" FROM `dishes`;--> statement-breakpoint
DROP TABLE `dishes`;--> statement-breakpoint
ALTER TABLE `__new_dishes` RENAME TO `dishes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`cuisine_type` text,
	`location` text,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_restaurants`("id", "family_id", "name", "cuisine_type", "location", "notes", "archived", "created_by_id", "created_at", "updated_at") SELECT "id", "family_id", "name", "cuisine_type", "location", "notes", "archived", "created_by_id", "created_at", "updated_at" FROM `restaurants`;--> statement-breakpoint
DROP TABLE `restaurants`;--> statement-breakpoint
ALTER TABLE `__new_restaurants` RENAME TO `restaurants`;--> statement-breakpoint
CREATE TABLE `__new_weekly_menus` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`week_start_date` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_weekly_menus`("id", "family_id", "week_start_date", "created_at", "updated_at") SELECT "id", "family_id", "week_start_date", "created_at", "updated_at" FROM `weekly_menus`;--> statement-breakpoint
DROP TABLE `weekly_menus`;--> statement-breakpoint
ALTER TABLE `__new_weekly_menus` RENAME TO `weekly_menus`;--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_menus_family_week_unique` ON `weekly_menus` (`family_id`,`week_start_date`);