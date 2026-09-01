import { listReservedSlots, releaseSlots, reserveSlots } from '@/db/reservations';

const TIME_ZONE = 'Europe/Berlin';
const GITHUB_PAGES_ORIGIN = 'https://drag0sh7.github.io';
const OPEN_SLOTS = new Set([
  0,
  1,
  ...Array.from({ length: 38 }, (_, index) => index + 10),
]);

function json(data: unknown, init?: ResponseInit) {
  const response = Response.json(data, init);
  response.headers.set('Access-Control-Allow-Origin', GITHUB_PAGES_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  response.headers.set('Vary', 'Origin');
  return response;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': GITHUB_PAGES_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

function berlinParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function bookableWindow() {
  const parts = berlinParts();
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const tomorrowInstant = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, 12));
  const tomorrowParts = berlinParts(tomorrowInstant);
  const tomorrow = `${tomorrowParts.year}-${tomorrowParts.month}-${tomorrowParts.day}`;
  const currentSlot = Math.ceil((Number(parts.hour) * 60 + Number(parts.minute)) / 30);
  return { today, tomorrow, currentSlot };
}

function dateIsBookable(date: string, today: string, tomorrow: string) {
  return date === today || date === tomorrow;
}

function slotsAreValid(slots: number[], date: string, today: string, currentSlot: number, allowPast = false) {
  if (!slots.length || slots.length > 40 || new Set(slots).size !== slots.length) return false;
  const ordered = [...slots].sort((a, b) => a - b);
  if (!ordered.every((slot) => Number.isInteger(slot) && OPEN_SLOTS.has(slot))) return false;
  if (ordered.some((slot, index) => index > 0 && slot !== ordered[index - 1] + 1)) return false;
  if (!allowPast && date === today && ordered[0] < currentSlot) return false;
  return true;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? '';
  const { today, tomorrow, currentSlot } = bookableWindow();
  if (!dateIsBookable(date, today, tomorrow)) {
    return json({ error: 'Choose today or tomorrow.' }, { status: 400 });
  }
  const reservedSlots = await listReservedSlots(date, today);
  return json({ reservedSlots, today, tomorrow, currentSlot: date === today ? currentSlot : 0 });
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Invalid request.' }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as { date?: unknown; slots?: unknown } | null;
  const date = typeof body?.date === 'string' ? body.date : '';
  const slots = Array.isArray(body?.slots) ? body.slots.map(Number) : [];
  const { today, tomorrow, currentSlot } = bookableWindow();
  if (!dateIsBookable(date, today, tomorrow) || !slotsAreValid(slots, date, today, currentSlot)) {
    return json({ error: 'That time is not available for booking.' }, { status: 400 });
  }
  const created = await reserveSlots(date, slots);
  if (!created) {
    return json({ error: 'Part of that time was just reserved. Please choose another.' }, { status: 409 });
  }
  return json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Invalid request.' }, { status: 415 });
  }
  const body = (await request.json().catch(() => null)) as { date?: unknown; slots?: unknown } | null;
  const date = typeof body?.date === 'string' ? body.date : '';
  const slots = Array.isArray(body?.slots) ? body.slots.map(Number) : [];
  const { today, tomorrow, currentSlot } = bookableWindow();
  if (!dateIsBookable(date, today, tomorrow) || !slotsAreValid(slots, date, today, currentSlot, true)) {
    return json({ error: 'That time cannot be released.' }, { status: 400 });
  }
  await releaseSlots(date, slots);
  return json({ ok: true });
}
