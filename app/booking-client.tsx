'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';

type ReservedInterval = { start: number; end: number };
type Selection = ReservedInterval;
type Availability = {
  reservedIntervals: ReservedInterval[];
  today: string;
  tomorrow: string;
  currentMinute: number;
};

const OPEN_PERIODS = [
  { start: 0, end: 60, ticks: [0, 60] },
  { start: 300, end: 1440, ticks: [300, 480, 660, 840, 1020, 1200, 1380, 1440] },
];

function minuteTime(minute: number) {
  if (minute === 1440) return '24:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function inputTime(minute: number) {
  return minute === 1440 ? '00:00' : minuteTime(minute);
}

function parsedTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return hour * 60 + minute;
}

function dateLabel(date: string, fallback: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(parsed);
}

function openPeriod(start: number, end = start + 1) {
  return OPEN_PERIODS.find((period) => start >= period.start && end <= period.end);
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function BookingClient({ initialToday, initialTomorrow, apiBase = '' }: { initialToday: string; initialTomorrow: string; apiBase?: string }) {
  const [date, setDate] = useState(initialToday);
  const [availability, setAvailability] = useState<Availability>({ reservedIntervals: [], today: initialToday, tomorrow: initialTomorrow, currentMinute: 0 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selectionState = useMemo(() => {
    if (!selection) return { mode: null as 'reserve' | 'release' | null, valid: false };
    const containing = availability.reservedIntervals.find((item) => selection.start >= item.start && selection.end <= item.end);
    if (containing) return { mode: 'release' as const, valid: true };
    const overlaps = availability.reservedIntervals.some((item) => selection.start < item.end && selection.end > item.start);
    const past = date === availability.today && selection.start < availability.currentMinute;
    return { mode: 'reserve' as const, valid: !overlaps && !past && Boolean(openPeriod(selection.start, selection.end)) };
  }, [availability, date, selection]);

  async function loadAvailability(targetDate = date, keepMessage = false) {
    setLoading(true);
    if (!keepMessage) setMessage('');
    try {
      const response = await fetch(`${apiBase}/api/reservations?date=${encodeURIComponent(targetDate)}`, { cache: 'no-store' });
      const data = (await response.json()) as Availability & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'could not load. awkward.');
      setAvailability(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'could not load. awkward.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAvailability(date); }, [date]);

  function minuteFromPointer(event: ReactPointerEvent<HTMLDivElement>, period: (typeof OPEN_PERIODS)[number]) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    return Math.round(period.start + ratio * (period.end - period.start));
  }

  function startAxisSelection(event: ReactPointerEvent<HTMLDivElement>, period: (typeof OPEN_PERIODS)[number]) {
    const pointedMinute = Math.min(period.end - 1, minuteFromPointer(event, period));
    const reservedInterval = availability.reservedIntervals.find((item) => pointedMinute >= item.start && pointedMinute < item.end);
    setMessage('');
    if (reservedInterval) {
      setSelection({ ...reservedInterval });
      setDragStart(null);
      return;
    }
    if (date === availability.today && pointedMinute < availability.currentMinute) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(pointedMinute);
    setSelection({ start: pointedMinute, end: pointedMinute + 1 });
  }

  function moveAxisSelection(event: ReactPointerEvent<HTMLDivElement>, period: (typeof OPEN_PERIODS)[number]) {
    if (dragStart === null) return;
    const pointedMinute = minuteFromPointer(event, period);
    if (pointedMinute >= dragStart) {
      setSelection({ start: dragStart, end: Math.min(period.end, Math.max(dragStart + 1, pointedMinute)) });
    } else {
      setSelection({ start: Math.max(period.start, pointedMinute), end: dragStart + 1 });
    }
  }

  function finishAxisSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragStart(null);
  }

  function changeStart(value: string) {
    const start = parsedTime(value);
    if (start === null) return;
    const period = OPEN_PERIODS.find((item) => start >= item.start && start < item.end);
    if (!period) {
      setMessage('not available.');
      return;
    }
    const end = selection && selection.end > start && selection.end <= period.end ? selection.end : Math.min(period.end, start + 30);
    setSelection({ start, end });
    setMessage('');
  }

  function changeEnd(value: string) {
    if (!selection) return;
    let end = parsedTime(value);
    if (end === 0 && selection.start >= 300) end = 1440;
    if (end === null || end <= selection.start || !openPeriod(selection.start, end)) {
      setMessage('not available.');
      return;
    }
    setSelection({ ...selection, end });
    setMessage('');
  }

  async function submitReservation() {
    if (!selection || !selectionState.valid || !selectionState.mode || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${apiBase}/api/reservations`, {
        method: selectionState.mode === 'release' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, start: selection.start, end: selection.end }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'that did not work.');
      const label = `${minuteTime(selection.start)}–${minuteTime(selection.end)}`;
      const completedMode = selectionState.mode;
      setSelection(null);
      setMessage(`${label}. ${completedMode === 'release' ? 'released.' : 'booked.'}`);
      await loadAvailability(date, true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'that did not work.');
      await loadAvailability(date, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="booking" aria-label="Reservation times" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border p-3 sm:p-4">
        <div className="flex rounded-xl bg-secondary p-1 text-sm font-medium">
          {[availability.today, availability.tomorrow].map((item, index) => (
            <button
              key={item}
              type="button"
              onClick={() => { setSelection(null); setDate(item); }}
              className={`min-h-11 rounded-lg px-3 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-32 ${date === item ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
              aria-pressed={date === item}
            >
              <span className="mr-1.5">{index === 0 ? 'today' : 'tomorrow'}</span>
              <span className="hidden opacity-55 sm:inline">{dateLabel(item, '')}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => loadAvailability(date)} className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Refresh availability">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-3 sm:p-4">
        {loading ? (
          <div className="grid min-h-72 place-items-center text-xs text-muted-foreground" role="status">
            <span className="sr-only">Loading availability</span>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            <div className="interval-fields">
              <label>
                <span>from</span>
                <input type="time" step="60" value={selection ? inputTime(selection.start) : ''} onChange={(event) => changeStart(event.target.value)} aria-label="Reservation start time" />
              </label>
              <ArrowRight className="mb-3 size-4 text-muted-foreground" aria-hidden="true" />
              <label>
                <span>to</span>
                <input type="time" step="60" value={selection ? inputTime(selection.end) : ''} onChange={(event) => changeEnd(event.target.value)} disabled={!selection} aria-label="Reservation end time" />
              </label>
            </div>

            <div className="mt-7 space-y-7" aria-label="Time axis">
              {OPEN_PERIODS.map((period) => {
                const length = period.end - period.start;
                return (
                  <div key={period.start} className="axis-wrap">
                    <div className="axis-labels" aria-hidden="true">
                      {period.ticks.map((tick) => (
                        <span key={tick} style={{ left: `${((tick - period.start) / length) * 100}%` }}>{minuteTime(tick)}</span>
                      ))}
                    </div>
                    <div
                      className="interval-axis"
                      onPointerDown={(event) => startAxisSelection(event, period)}
                      onPointerMove={(event) => moveAxisSelection(event, period)}
                      onPointerUp={finishAxisSelection}
                      onPointerCancel={finishAxisSelection}
                      aria-label={`Select a time between ${minuteTime(period.start)} and ${minuteTime(period.end)}`}
                    >
                      {date === availability.today && availability.currentMinute > period.start && availability.currentMinute < period.end ? (
                        <span className="axis-past" style={{ width: `${((availability.currentMinute - period.start) / length) * 100}%` }} />
                      ) : null}
                      {availability.reservedIntervals.map((item) => {
                        const start = Math.max(item.start, period.start);
                        const end = Math.min(item.end, period.end);
                        if (end <= start) return null;
                        return <span key={`${item.start}-${item.end}`} className="axis-reserved" style={{ left: `${((start - period.start) / length) * 100}%`, width: `${((end - start) / length) * 100}%` }} />;
                      })}
                      {selection && selection.start < period.end && selection.end > period.start ? (
                        <span
                          className={`axis-choice ${selectionState.mode === 'release' ? 'axis-choice-release' : ''} ${!selectionState.valid ? 'axis-choice-invalid' : ''}`}
                          style={{
                            left: `${((Math.max(selection.start, period.start) - period.start) / length) * 100}%`,
                            width: `${((Math.min(selection.end, period.end) - Math.max(selection.start, period.start)) / length) * 100}%`,
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-secondary/45 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="font-heading text-lg tracking-tight">
            {selection ? `${minuteTime(selection.start)}–${minuteTime(selection.end)}` : 'nothing picked.'}
            {selection ? <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{durationLabel(selection.end - selection.start)}</span> : null}
          </p>
          <p aria-live="polite" aria-atomic="true" className="mt-1 min-h-4 text-xs leading-4 text-muted-foreground">
            {selection && !selectionState.valid && !message ? 'that interval is not available.' : message}
          </p>
        </div>
        <button type="button" onClick={submitReservation} disabled={!selection || !selectionState.valid || saving || loading} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:pointer-events-none disabled:opacity-35">
          {saving ? <Loader2 className="animate-spin" /> : <>{selectionState.mode === 'release' ? 'unreserve' : 'reserve'} <ArrowRight /></>}
        </button>
      </div>
    </section>
  );
}
