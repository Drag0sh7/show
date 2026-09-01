CREATE TABLE `reservations` (
	`booking_date` text NOT NULL,
	`slot` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`booking_date`, `slot`)
);
