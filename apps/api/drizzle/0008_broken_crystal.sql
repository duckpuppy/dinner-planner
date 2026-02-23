CREATE TABLE `pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`ingredient_name` text NOT NULL,
	`quantity` real,
	`unit` text,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
