CREATE TABLE `dish_dietary_tags` (
	`dish_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`dish_id`, `tag`),
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `dietary_preferences` text DEFAULT '[]' NOT NULL;