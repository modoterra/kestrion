CREATE TABLE IF NOT EXISTS `conversation_compaction` (
	`conversation_id` text PRIMARY KEY NOT NULL REFERENCES conversations(`id`) ON DELETE cascade,
	`compacted_through_message_id` text NOT NULL,
	`summary` text NOT NULL,
	`updated_at` text NOT NULL
);
