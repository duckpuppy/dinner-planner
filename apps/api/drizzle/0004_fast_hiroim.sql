CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`preparation_id` text NOT NULL,
	`uploaded_by_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`preparation_id`) REFERENCES `preparations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
