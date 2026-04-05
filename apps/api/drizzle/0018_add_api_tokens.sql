CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`name` text NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`last_used_at` text,
	`expires_at` text,
	`created_at` text NOT NULL DEFAULT (datetime('now'))
);
