CREATE TABLE `tool_policy` (
	`id` integer PRIMARY KEY NOT NULL,
	`policy_json` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `tool_policy_id_check` CHECK(`tool_policy`.`id` = 1)
);
