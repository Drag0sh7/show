import { Clock3 } from 'lucide-react';
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
      <div className="mx-auto max-w-4xl px-4 py-5 sm:px-7 sm:py-8">
        <header className="mb-12 flex items-center justify-between sm:mb-16">
          <a className="flex items-center gap-2.5" href="#booking" aria-label="Roomtime home">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Clock3 className="size-4" aria-hidden="true" />
            </span>
            <strong className="text-sm tracking-[-0.01em]">roomtime.</strong>
          </a>
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400" /> live
          </span>
        </header>

        <div className="mb-7 sm:mb-9">
          <h1 className="font-heading text-4xl leading-none tracking-[-0.045em] sm:text-6xl">pick a time.</h1>
          <p className="mt-3 text-sm text-muted-foreground">today or tomorrow. no lore.</p>
        </div>

        <BookingClient initialToday={today} initialTomorrow={tomorrow} />
      </div>
    </main>
  );
}
