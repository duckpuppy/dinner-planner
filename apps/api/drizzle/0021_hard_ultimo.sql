CREATE TABLE `restaurant_dish_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_dish_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stars` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`restaurant_dish_id`) REFERENCES `restaurant_dishes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `restaurant_dishes` (
	`id` text PRIMARY KEY NOT NULL,
	`restaurant_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `restaurants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cuisine_type` text,
	`location` text,
	`notes` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preparations` (
	`id` text PRIMARY KEY NOT NULL,
	`dish_id` text,
	`restaurant_id` text,
	`dinner_entry_id` text NOT NULL,
	`prepared_date` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dinner_entry_id`) REFERENCES `dinner_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_preparations`("id", "dish_id", "restaurant_id", "dinner_entry_id", "prepared_date", "notes", "created_at", "updated_at") SELECT "id", "dish_id", "restaurant_id", "dinner_entry_id", "prepared_date", "notes", "created_at", "updated_at" FROM `preparations`;--> statement-breakpoint
DROP TABLE `preparations`;--> statement-breakpoint
ALTER TABLE `__new_preparations` RENAME TO `preparations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `dinner_entries` ADD `restaurant_id` text REFERENCES restaurants(id);