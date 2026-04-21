CREATE TABLE `app_events` (
	`id` text PRIMARY KEY NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`user_id` text,
	`created_at` text NOT NULL
);
