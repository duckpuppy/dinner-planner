ALTER TABLE `grocery_checks` ADD `checked` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `grocery_checks` ADD `updated_at_ms` integer DEFAULT 0 NOT NULL;