import { env } from 'cloudflare:workers';

export type ReservedInterval = { start: number; end: number };

function binding() {
  if (!env.DB) throw new Error('The reservations database is unavailable.');
  return env.DB;
}

async function ensureSchema() {
  const db = binding();
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS reservations (
      booking_date TEXT NOT NULL,
      slot INTEGER NOT NULL CHECK (slot >= 0 AND slot < 48),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (booking_date, slot)
    )`)
    .run();
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS reservation_minutes (
      booking_date TEXT NOT NULL,
      minute INTEGER NOT NULL CHECK (minute >= 0 AND minute < 1440),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (booking_date, minute)
    )`)
    .run();

  // Keep reservations made before minute precision was introduced.
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

export async function listReservedIntervals(date: string, today: string) {
  await ensureSchema();
  await binding().prepare('DELETE FROM reservation_minutes WHERE booking_date < ?').bind(today).run();
  await binding().prepare('DELETE FROM reservations WHERE booking_date < ?').bind(today).run();
  const result = await binding()
    .prepare('SELECT minute FROM reservation_minutes WHERE booking_date = ? ORDER BY minute')
    .bind(date)
    .all<{ minute: number }>();

  return result.results.reduce<ReservedInterval[]>((intervals, row) => {
    const previous = intervals[intervals.length - 1];
    if (previous?.end === row.minute) previous.end = row.minute + 1;
    else intervals.push({ start: row.minute, end: row.minute + 1 });
    return intervals;
  }, []);
}

export async function reserveInterval(date: string, start: number, end: number) {
  await ensureSchema();
  try {
    await binding()
      .prepare(`WITH digits(d) AS (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)),
        minutes(value) AS (
          SELECT ones.d + tens.d * 10 + hundreds.d * 100 + thousands.d * 1000
          FROM digits ones CROSS JOIN digits tens CROSS JOIN digits hundreds CROSS JOIN digits thousands
        )
        INSERT INTO reservation_minutes (booking_date, minute, created_at)
        SELECT ?, value, datetime('now') FROM minutes WHERE value >= ? AND value < ?`)
      .bind(date, start, end)
      .run();
    return true;
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) return false;
    throw error;
  }
}

export async function releaseInterval(date: string, start: number, end: number) {
  await ensureSchema();
  await binding()
    .prepare('DELETE FROM reservation_minutes WHERE booking_date = ? AND minute >= ? AND minute < ?')
    .bind(date, start, end)
    .run();
}
