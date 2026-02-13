CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`week_start_day` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dinner_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_id` text NOT NULL,
	`date` text NOT NULL,
	`type` text DEFAULT 'assembled' NOT NULL,
	`custom_text` text,
	`main_dish_id` text,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`menu_id`) REFERENCES `weekly_menus`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`main_dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `dish_tags` (
	`dish_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `dishes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`prep_time` integer,
	`cook_time` integer,
	`servings` integer,
	`source_url` text,
	`video_url` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_by_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `entry_side_dishes` (
	`entry_id` text NOT NULL,
	`dish_id` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `dinner_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`dish_id` text NOT NULL,
	`quantity` real,
	`unit` text,
	`name` text NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preparations` (
	`id` text PRIMARY KEY NOT NULL,
	`dish_id` text NOT NULL,
	`dinner_entry_id` text NOT NULL,
	`prepared_by_id` text NOT NULL,
	`prepared_date` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dinner_entry_id`) REFERENCES `dinner_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prepared_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`preparation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`stars` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`preparation_id`) REFERENCES `preparations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`theme` text DEFAULT 'light' NOT NULL,
	`home_view` text DEFAULT 'today' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `weekly_menus` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start_date` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_menus_week_start_date_unique` ON `weekly_menus` (`week_start_date`);