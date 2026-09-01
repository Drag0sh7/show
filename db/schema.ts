import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const reservations = sqliteTable(
  'reservations',
  {
    bookingDate: text('booking_date').notNull(),
    slot: integer('slot').notNull(),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.bookingDate, table.slot] })],
);
