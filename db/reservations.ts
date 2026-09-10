import { env } from 'cloudflare:workers';

export type ReservedInterval = { start: number; end: number };
export type Room = 'left' | 'right';

function binding() {
  if (!env.DB) throw new Error('The reservations database is unavailable.');
  return env.DB;
}

function roomTable(room: Room) {
  return room === 'right' ? 'right_reservation_minutes' : 'reservation_minutes';
}

async function migrateLegacyReservations() {
  const db = binding();
  await db
    .prepare(`WITH digits(d) AS (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)),
      offsets(n) AS (
        SELECT ones.d + tens.d * 10 FROM digits ones CROSS JOIN digits tens
        WHERE ones.d + tens.d * 10 < 30
      )
      INSERT OR IGNORE INTO reservation_minutes (booking_date, minute, created_at)
      SELECT reservations.booking_date, reservations.slot * 30 + offsets.n, reservations.created_at
      FROM reservations CROSS JOIN offsets`)
    .run();
  await db.prepare('DELETE FROM reservations').run();
}

export async function listReservedIntervals(date: string, today: string, room: Room) {
  await migrateLegacyReservations();
  const table = roomTable(room);
  await binding().prepare(`DELETE FROM ${table} WHERE booking_date < ?`).bind(today).run();
  await binding().prepare('DELETE FROM reservations WHERE booking_date < ?').bind(today).run();
  const result = await binding()
    .prepare(`SELECT minute FROM ${table} WHERE booking_date = ? ORDER BY minute`)
    .bind(date)
    .all<{ minute: number }>();

  return result.results.reduce<ReservedInterval[]>((intervals, row) => {
    const previous = intervals[intervals.length - 1];
    if (previous?.end === row.minute) previous.end = row.minute + 1;
    else intervals.push({ start: row.minute, end: row.minute + 1 });
    return intervals;
  }, []);
}

export async function reserveInterval(date: string, start: number, end: number, room: Room) {
  await migrateLegacyReservations();
  const table = roomTable(room);
  try {
    await binding()
      .prepare(`WITH digits(d) AS (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)),
        minutes(value) AS (
          SELECT ones.d + tens.d * 10 + hundreds.d * 100 + thousands.d * 1000
          FROM digits ones CROSS JOIN digits tens CROSS JOIN digits hundreds CROSS JOIN digits thousands
        )
        INSERT INTO ${table} (booking_date, minute, created_at)
        SELECT ?, value, datetime('now') FROM minutes WHERE value >= ? AND value < ?`)
      .bind(date, start, end)
      .run();
    return true;
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) return false;
    throw error;
  }
}

export async function releaseInterval(date: string, start: number, end: number, room: Room) {
  await migrateLegacyReservations();
  const table = roomTable(room);
  await binding()
    .prepare(`DELETE FROM ${table} WHERE booking_date = ? AND minute >= ? AND minute < ?`)
    .bind(date, start, end)
    .run();
}
