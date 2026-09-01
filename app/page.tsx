import { BookingClient } from './booking-client';

function bookingDates() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const next = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, 12));
  const nextParts = Object.fromEntries(formatter.formatToParts(next).map((part) => [part.type, part.value]));
  return { today, tomorrow: `${nextParts.year}-${nextParts.month}-${nextParts.day}` };
}

export default function Home() {
  const { today, tomorrow } = bookingDates();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-3 py-3 sm:px-7 sm:py-10">
        <h1 className="sr-only">Reservations</h1>
        <BookingClient initialToday={today} initialTomorrow={tomorrow} />
      </div>
    </main>
  );
}
