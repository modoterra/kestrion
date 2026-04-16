CREATE TABLE `conversation_tool_calls` (
	`conversation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`tool_calls_json` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_conversation_tool_calls_created` ON `conversation_tool_calls` (`conversation_id`,`created_at`);
