import { listReservedIntervals, releaseInterval, reserveInterval } from '@/db/reservations';

const TIME_ZONE = 'Europe/Berlin';
const GITHUB_PAGES_ORIGIN = 'https://drag0sh7.github.io';

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
  const currentMinute = Number(parts.hour) * 60 + Number(parts.minute);
  return { today, tomorrow, currentMinute };
}

function dateIsBookable(date: string, today: string, tomorrow: string) {
  return date === today || date === tomorrow;
}

function intervalIsOpen(start: number, end: number) {
  return (start >= 0 && end <= 60) || (start >= 300 && end <= 1440);
}

function intervalIsValid(start: number, end: number, date: string, today: string, currentMinute: number, allowPast = false) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start) return false;
  if (!intervalIsOpen(start, end)) return false;
  if (!allowPast && date === today && start < currentMinute) return false;
  return true;
}

async function requestInterval(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  const body = (await request.json().catch(() => null)) as { date?: unknown; start?: unknown; end?: unknown } | null;
  return {
    date: typeof body?.date === 'string' ? body.date : '',
    start: Number(body?.start),
    end: Number(body?.end),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? '';
  const { today, tomorrow, currentMinute } = bookableWindow();
  if (!dateIsBookable(date, today, tomorrow)) {
    return json({ error: 'Choose today or tomorrow.' }, { status: 400 });
  }
  const reservedIntervals = await listReservedIntervals(date, today);
  return json({ reservedIntervals, today, tomorrow, currentMinute: date === today ? currentMinute : 0 });
}

export async function POST(request: Request) {
  const interval = await requestInterval(request);
  if (!interval) return json({ error: 'Invalid request.' }, { status: 415 });
  const { today, tomorrow, currentMinute } = bookableWindow();
  if (!dateIsBookable(interval.date, today, tomorrow) || !intervalIsValid(interval.start, interval.end, interval.date, today, currentMinute)) {
    return json({ error: 'That time is not available for booking.' }, { status: 400 });
  }
  const created = await reserveInterval(interval.date, interval.start, interval.end);
  if (!created) {
    return json({ error: 'Part of that time was just reserved. Please choose another.' }, { status: 409 });
  }
  return json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const interval = await requestInterval(request);
  if (!interval) return json({ error: 'Invalid request.' }, { status: 415 });
  const { today, tomorrow, currentMinute } = bookableWindow();
  if (!dateIsBookable(interval.date, today, tomorrow) || !intervalIsValid(interval.start, interval.end, interval.date, today, currentMinute, true)) {
    return json({ error: 'That time cannot be released.' }, { status: 400 });
  }
  await releaseInterval(interval.date, interval.start, interval.end);
  return json({ ok: true });
}
