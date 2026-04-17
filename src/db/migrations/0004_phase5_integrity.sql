ALTER TABLE `tool_memory_entries` ADD COLUMN `integrity_state` text DEFAULT 'unsigned' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_memory_entries` ADD COLUMN `last_validated_at` text;
--> statement-breakpoint
ALTER TABLE `tool_memory_entries` ADD COLUMN `origin_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_memory_entries` ADD COLUMN `signature` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_memory_entries` ADD COLUMN `signer_key_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_memory_entries` ADD COLUMN `stale_after` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_scratch_memory` ADD COLUMN `created_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_scratch_memory` ADD COLUMN `integrity_state` text DEFAULT 'unsigned' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_scratch_memory` ADD COLUMN `last_validated_at` text;
--> statement-breakpoint
ALTER TABLE `tool_scratch_memory` ADD COLUMN `origin_json` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_scratch_memory` ADD COLUMN `signature` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_scratch_memory` ADD COLUMN `signer_key_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tool_scratch_memory` ADD COLUMN `stale_after` text DEFAULT '' NOT NULL;
