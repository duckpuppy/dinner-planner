CREATE TABLE `dish_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`dish_id` text NOT NULL,
	`note` text NOT NULL,
	`created_by_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
