CREATE TABLE `prep_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`description` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `dinner_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
