PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pattern_side_dishes` (
	`pattern_id` text NOT NULL,
	`dish_id` text NOT NULL,
	PRIMARY KEY(`pattern_id`, `dish_id`),
	FOREIGN KEY (`pattern_id`) REFERENCES `recurring_patterns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_pattern_side_dishes`("pattern_id", "dish_id") SELECT "pattern_id", "dish_id" FROM `pattern_side_dishes`;--> statement-breakpoint
DROP TABLE `pattern_side_dishes`;--> statement-breakpoint
ALTER TABLE `__new_pattern_side_dishes` RENAME TO `pattern_side_dishes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE `dinner_entries` SET `restaurant_name` = `custom_text` WHERE `type` = 'dining_out' AND `custom_text` IS NOT NULL AND `restaurant_name` IS NULL;