CREATE TABLE `pattern_side_dishes` (
	`pattern_id` text NOT NULL,
	`dish_id` text NOT NULL,
	FOREIGN KEY (`pattern_id`) REFERENCES `recurring_patterns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recurring_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`type` text DEFAULT 'assembled' NOT NULL,
	`main_dish_id` text,
	`custom_text` text,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`main_dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `dinner_entries` ADD `restaurant_name` text;--> statement-breakpoint
ALTER TABLE `dinner_entries` ADD `restaurant_notes` text;