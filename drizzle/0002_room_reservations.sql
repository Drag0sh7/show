CREATE TABLE `right_reservation_minutes` (
	`booking_date` text NOT NULL,
	`minute` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`booking_date`, `minute`)
);
