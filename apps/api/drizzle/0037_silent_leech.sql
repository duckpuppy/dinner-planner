PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_dinner_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_id` text NOT NULL,
	`family_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text DEFAULT 'assembled' NOT NULL,
	`custom_text` text,
	`custom_side_text` text,
	`restaurant_name` text,
	`restaurant_notes` text,
	`restaurant_id` text,
	`main_dish_id` text,
	`source_entry_id` text,
	`completed` integer DEFAULT false NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`scale` integer DEFAULT 1 NOT NULL,
	`side_scale` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`menu_id`) REFERENCES `weekly_menus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`main_dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_entry_id`) REFERENCES `dinner_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_dinner_entries`("id", "menu_id", "family_id", "date", "type", "custom_text", "custom_side_text", "restaurant_name", "restaurant_notes", "restaurant_id", "main_dish_id", "source_entry_id", "completed", "skipped", "scale", "side_scale", "created_at", "updated_at") SELECT "id", "menu_id", "family_id", "date", "type", "custom_text", "custom_side_text", "restaurant_name", "restaurant_notes", "restaurant_id", "main_dish_id", "source_entry_id", "completed", "skipped", "scale", "side_scale", "created_at", "updated_at" FROM `dinner_entries`;--> statement-breakpoint
DROP TABLE `dinner_entries`;--> statement-breakpoint
ALTER TABLE `__new_dinner_entries` RENAME TO `dinner_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `dinner_entries_family_date_unique` ON `dinner_entries` (`family_id`,`date`);