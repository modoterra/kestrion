CREATE TABLE `conversations` (
	`created_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`provider` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_updated_at` ON `conversations` (`updated_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`content` text NOT NULL,
	`conversation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`model` text,
	`provider` text,
	`role` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation_created` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `provider_catalog` (
	`description` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_models` (
	`description` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`model_identifier` text NOT NULL,
	`provider_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_catalog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_provider_models_provider_model` ON `provider_models` (`provider_id`,`model_identifier`);--> statement-breakpoint
CREATE INDEX `idx_provider_models_provider_sort` ON `provider_models` (`provider_id`,`sort_order`);--> statement-breakpoint
INSERT INTO `provider_catalog` (`id`, `label`, `description`, `sort_order`)
VALUES ('fireworks', 'Fireworks', 'fireworks.ai', 1)
ON CONFLICT(`id`) DO UPDATE SET
	`label` = excluded.`label`,
	`description` = excluded.`description`,
	`sort_order` = excluded.`sort_order`;--> statement-breakpoint
INSERT INTO `provider_models` (`id`, `provider_id`, `label`, `description`, `model_identifier`, `sort_order`)
VALUES
	('forerunner-chat', 'fireworks', 'Kimi K2.5', 'Curated Kimi profile with automatic Instant and Thinking mode switching', 'accounts/fireworks/models/kimi-k2p5', 1)
ON CONFLICT(`id`) DO UPDATE SET
	`provider_id` = excluded.`provider_id`,
	`label` = excluded.`label`,
	`description` = excluded.`description`,
	`model_identifier` = excluded.`model_identifier`,
	`sort_order` = excluded.`sort_order`;--> statement-breakpoint
CREATE TABLE `tool_memory_entries` (
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`title` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tool_memory_entries_kind_created` ON `tool_memory_entries` (`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `tool_scratch_memory` (
	`content` text NOT NULL,
	`id` integer PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "tool_scratch_memory_id_check" CHECK("tool_scratch_memory"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `tool_todos` (
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`priority` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tool_todos_done_updated` ON `tool_todos` (`done`,`updated_at`);
