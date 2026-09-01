import { env } from 'cloudflare:workers';

function binding() {
  if (!env.DB) throw new Error('The reservations database is unavailable.');
  return env.DB;
}

async function ensureSchema() {
  await binding()
    .prepare(`CREATE TABLE IF NOT EXISTS reservations (
      booking_date TEXT NOT NULL,
      slot INTEGER NOT NULL CHECK (slot >= 0 AND slot < 48),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (booking_date, slot)
    )`)
    .run();
}

export async function listReservedSlots(date: string, today: string) {
  await ensureSchema();
  await binding().prepare('DELETE FROM reservations WHERE booking_date < ?').bind(today).run();
  const result = await binding()
    .prepare('SELECT slot FROM reservations WHERE booking_date = ? ORDER BY slot')
    .bind(date)
    .all<{ slot: number }>();
  return result.results.map((row) => row.slot);
}

export async function reserveSlots(date: string, slots: number[]) {
  await ensureSchema();
  const values = slots.map(() => "(?, ?, datetime('now'))").join(', ');
  const parameters = slots.flatMap((slot) => [date, slot]);
  try {
    await binding()
      .prepare(`INSERT INTO reservations (booking_date, slot, created_at) VALUES ${values}`)
      .bind(...parameters)
      .run();
    return true;
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) return false;
    throw error;
  }
}
