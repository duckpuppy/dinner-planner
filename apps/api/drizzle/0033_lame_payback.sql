ALTER TABLE `video_jobs` ADD `family_id` text REFERENCES families(id);--> statement-breakpoint
ALTER TABLE `video_jobs` ADD `extraction_status` text;--> statement-breakpoint
ALTER TABLE `video_jobs` ADD `extraction_error` text;--> statement-breakpoint
ALTER TABLE `video_jobs` ADD `warning` text;