CREATE TABLE `preparation_preparers` (
	`preparation_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`preparation_id`, `user_id`),
	FOREIGN KEY (`preparation_id`) REFERENCES `preparations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `preparation_preparers` (`preparation_id`, `user_id`)
SELECT `id`, `prepared_by_id` FROM `preparations` WHERE `prepared_by_id` IS NOT NULL;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preparations` (
	`id` text PRIMARY KEY NOT NULL,
	`dish_id` text NOT NULL,
	`dinner_entry_id` text NOT NULL,
	`prepared_date` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dinner_entry_id`) REFERENCES `dinner_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_preparations`("id", "dish_id", "dinner_entry_id", "prepared_date", "notes", "created_at", "updated_at") SELECT "id", "dish_id", "dinner_entry_id", "prepared_date", "notes", "created_at", "updated_at" FROM `preparations`;--> statement-breakpoint
DROP TABLE `preparations`;--> statement-breakpoint
ALTER TABLE `__new_preparations` RENAME TO `preparations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;