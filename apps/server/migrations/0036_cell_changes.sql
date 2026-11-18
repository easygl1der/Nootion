CREATE TABLE `cell_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`database_id` text NOT NULL,
	`row_id` text NOT NULL,
	`property_id` text NOT NULL,
	`before` text,
	`after` text,
	`user_id` text,
	`agent` text,
	`restored_from` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`database_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`row_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `cell_changes_row_idx` ON `cell_changes` (`row_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cell_changes_db_idx` ON `cell_changes` (`database_id`,`created_at`);