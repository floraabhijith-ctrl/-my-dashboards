CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`note` text,
	`client_feedback` text,
	`next_action` text,
	`follow_up_method` text,
	`data` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activities_enquiry_idx` ON `activities` (`enquiry_id`);--> statement-breakpoint
CREATE INDEX `activities_created_idx` ON `activities` (`created_at`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`uploaded_by_id` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`kind` text DEFAULT 'Supporting Document' NOT NULL,
	`content` blob NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attachments_enquiry_idx` ON `attachments` (`enquiry_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before` text,
	`after` text,
	`ip_address` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `enquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_ref` text NOT NULL,
	`property_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_by_id` text NOT NULL,
	`source` text NOT NULL,
	`enquiry_type` text NOT NULL,
	`priority` text DEFAULT 'Medium' NOT NULL,
	`company_name` text NOT NULL,
	`contact_person` text NOT NULL,
	`email` text,
	`phone` text,
	`country` text,
	`account_type` text DEFAULT 'New' NOT NULL,
	`client_remarks` text,
	`arrival_date` text NOT NULL,
	`departure_date` text NOT NULL,
	`nights` integer NOT NULL,
	`rooms` integer NOT NULL,
	`room_category` text,
	`guests` integer,
	`meal_plan` text,
	`additional_requirements` text,
	`stay_type` text NOT NULL,
	`requested_rate` integer,
	`proposed_rate` integer,
	`revised_rate` integer,
	`approved_rate` integer,
	`rate_basis` text DEFAULT 'Per Room Per Night' NOT NULL,
	`tax_inclusion` text DEFAULT 'Inclusive of taxes' NOT NULL,
	`rate_variance` integer,
	`discount_bps` integer,
	`total_room_nights` integer NOT NULL,
	`potential_revenue` integer DEFAULT 0 NOT NULL,
	`expected_booking_value` integer DEFAULT 0 NOT NULL,
	`probability` integer DEFAULT 50 NOT NULL,
	`nightly_equivalent_rate` integer,
	`status` text DEFAULT 'New Enquiry' NOT NULL,
	`confirmed_at` text,
	`closed_at` text,
	`lost_reason` text,
	`last_follow_up_at` text,
	`next_follow_up_at` text,
	`follow_up_method` text,
	`latest_client_response` text,
	`next_action` text,
	`sales_notes` text,
	`delay_reason` text,
	`last_activity_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`idempotency_key` text,
	`deleted_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enquiries_ref_idx` ON `enquiries` (`enquiry_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `enquiries_idempotency_idx` ON `enquiries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `enquiries_owner_idx` ON `enquiries` (`owner_id`);--> statement-breakpoint
CREATE INDEX `enquiries_property_idx` ON `enquiries` (`property_id`);--> statement-breakpoint
CREATE INDEX `enquiries_status_idx` ON `enquiries` (`status`);--> statement-breakpoint
CREATE INDEX `enquiries_arrival_idx` ON `enquiries` (`arrival_date`);--> statement-breakpoint
CREATE INDEX `enquiries_next_follow_up_idx` ON `enquiries` (`next_follow_up_at`);--> statement-breakpoint
CREATE INDEX `enquiries_created_idx` ON `enquiries` (`created_at`);--> statement-breakpoint
CREATE TABLE `enquiry_counters` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`enquiry_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`email_status` text DEFAULT 'PENDING' NOT NULL,
	`email_error` text,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_idx` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`city` text DEFAULT 'Dubai' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `properties_code_idx` ON `properties` (`code`);--> statement-breakpoint
CREATE TABLE `rate_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`requested_by_id` text NOT NULL,
	`requested_rate` integer NOT NULL,
	`rate_basis` text NOT NULL,
	`reference_rate` integer,
	`discount_bps` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`decided_by_id` text,
	`decided_at` text,
	`decision_note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rate_approvals_enquiry_idx` ON `rate_approvals` (`enquiry_id`);--> statement-breakpoint
CREATE INDEX `rate_approvals_status_idx` ON `rate_approvals` (`status`);--> statement-breakpoint
CREATE TABLE `rate_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`enquiry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`field` text NOT NULL,
	`previous_value` integer,
	`new_value` integer,
	`rate_basis` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`enquiry_id`) REFERENCES `enquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rate_revisions_enquiry_idx` ON `rate_revisions` (`enquiry_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by_id` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`provider` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE INDEX `sync_outbox_status_idx` ON `sync_outbox` (`status`);--> statement-breakpoint
CREATE TABLE `user_properties` (
	`user_id` text NOT NULL,
	`property_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `property_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`manager_id` text,
	`approval_limit_bps` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`notify_by_email` integer DEFAULT true NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_manager_idx` ON `users` (`manager_id`);