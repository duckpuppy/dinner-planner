PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`family_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`theme` text DEFAULT 'light' NOT NULL,
	`home_view` text DEFAULT 'today' NOT NULL,
	`dietary_preferences` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `families`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "display_name", "password_hash", "family_id", "role", "theme", "home_view", "dietary_preferences", "created_at", "updated_at") SELECT "id", "username", "display_name", "password_hash", "family_id", "role", "theme", "home_view", "dietary_preferences", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);