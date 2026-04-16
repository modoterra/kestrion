CREATE TABLE `conversation_worker_transcript` (
	`conversation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`direction` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`sequence` integer NOT NULL,
	`turn_id` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_conversation_worker_transcript_created` ON `conversation_worker_transcript` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_conversation_worker_transcript_turn_sequence` ON `conversation_worker_transcript` (`conversation_id`,`turn_id`,`sequence`);
