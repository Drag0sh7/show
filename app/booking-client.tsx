'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';

type Room = 'left' | 'right';
type ReservedInterval = { start: number; end: number };
type Selection = ReservedInterval;
type AxisSection = { start: number; end: number; ticks: number[] };
type Availability = {
  reservedIntervals: ReservedInterval[];
  today: string;
  tomorrow: string;
  currentMinute: number;
  room?: Room;
};

const BOOKABLE_PERIODS = [
  { start: 0, end: 60 },
  { start: 300, end: 1440 },
];

const AXIS_SECTIONS: AxisSection[] = [
  { start: 0, end: 60, ticks: [0, 30, 60] },
  { start: 300, end: 720, ticks: [300, 420, 540, 660, 720] },
  { start: 720, end: 1080, ticks: [720, 840, 960, 1080] },
  { start: 1080, end: 1440, ticks: [1080, 1200, 1320, 1440] },
];

function minuteTime(minute: number) {
  if (minute === 1440) return '24:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function parsedTime(value: string, allowEndOfDay = false) {
  const normalized = value.trim();
  if (allowEndOfDay && normalized === '24:00') return 1440;
  const match = normalized.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function dateLabel(date: string, fallback: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(parsed);
}

function openPeriod(start: number, end = start + 1) {
  return BOOKABLE_PERIODS.find((period) => start >= period.start && end <= period.end);
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function TimeField({ label, value, disabled = false, onCommit }: { label: string; value: string; disabled?: boolean; onCommit: (value: string) => boolean }) {
  const [draft, setDraft] = useState(value);
  function commit() {
    if (!onCommit(draft)) setDraft(value);
  }
  return (
    <label>
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        placeholder="--:--"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { setDraft(value); event.currentTarget.blur(); }
        }}
        aria-label={`${label} time, 24-hour format`}
      />
    </label>
  );
}

export function BookingClient({ initialToday, initialTomorrow, apiBase = '' }: { initialToday: string; initialTomorrow: string; apiBase?: string }) {
  const [date, setDate] = useState(initialToday);
  const [room, setRoom] = useState<Room>('left');
  const [availability, setAvailability] = useState<Availability>({ reservedIntervals: [], today: initialToday, tomorrow: initialTomorrow, currentMinute: 0 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selectionState = useMemo(() => {
    if (!selection) return { mode: null as 'reserve' | 'release' | null, valid: false, reason: '' };
    const containing = availability.reservedIntervals.find((item) => selection.start >= item.start && selection.end <= item.end);
    if (containing) return { mode: 'release' as const, valid: true, reason: '' };
    if (!openPeriod(selection.start, selection.end)) {
      return { mode: 'reserve' as const, valid: false, reason: 'outside opening hours.' };
    }
    if (date === availability.today && selection.start < availability.currentMinute) {
      return { mode: 'reserve' as const, valid: false, reason: `already passed. now ${minuteTime(availability.currentMinute)}.` };
    }
    const collision = availability.reservedIntervals.find((item) => selection.start < item.end && selection.end > item.start);
    if (collision) {
      return { mode: 'reserve' as const, valid: false, reason: `${minuteTime(collision.start)}–${minuteTime(collision.end)} is occupied.` };
    }
    return { mode: 'reserve' as const, valid: true, reason: '' };
  }, [availability, date, selection]);

  async function loadAvailability(targetDate = date, targetRoom = room, keepMessage = false) {
    setLoading(true);
    if (!keepMessage) setMessage('');
    try {
      const query = new URLSearchParams({ date: targetDate, room: targetRoom });
      const response = await fetch(`${apiBase}/api/reservations?${query}`, { cache: 'no-store' });
      const data = (await response.json()) as Availability & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'could not load. awkward.');
      setAvailability(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'could not load. awkward.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAvailability(date, room); }, [date, room]);

  function switchDate(nextDate: string) {
    setSelection(null);
    setMessage('');
    setDate(nextDate);
  }

  function switchRoom(nextRoom: Room) {
    setSelection(null);
    setMessage('');
    setRoom(nextRoom);
  }

  function minuteFromPointer(event: ReactPointerEvent<HTMLElement>, section: AxisSection) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    return Math.round(section.start + ratio * (section.end - section.start));
  }

  function startAxisSelection(event: ReactPointerEvent<HTMLButtonElement>, section: AxisSection) {
    const pointedMinute = Math.min(section.end - 1, minuteFromPointer(event, section));
    const reservedInterval = availability.reservedIntervals.find((item) => pointedMinute >= item.start && pointedMinute < item.end);
    setMessage('');
    if (reservedInterval) {
      setSelection({ ...reservedInterval });
      setDragStart(null);
      return;
    }
    if (date === availability.today && pointedMinute < availability.currentMinute) {
      setSelection(null);
      setMessage(`already passed. now ${minuteTime(availability.currentMinute)}.`);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(pointedMinute);
    setSelection({ start: pointedMinute, end: pointedMinute + 1 });
  }

  function moveAxisSelection(event: ReactPointerEvent<HTMLButtonElement>, section: AxisSection) {
    if (dragStart === null) return;
    const pointedMinute = minuteFromPointer(event, section);
    if (pointedMinute >= dragStart) {
      setSelection({ start: dragStart, end: Math.min(section.end, Math.max(dragStart + 1, pointedMinute)) });
    } else {
      setSelection({ start: Math.max(section.start, pointedMinute), end: dragStart + 1 });
    }
  }

  function finishAxisSelection(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragStart(null);
  }

  function changeStart(value: string) {
    const start = parsedTime(value);
    if (start === null) {
      setMessage('use 24h format: 17:30.');
      return false;
    }
    const period = BOOKABLE_PERIODS.find((item) => start >= item.start && start < item.end);
    if (!period) {
      setMessage('outside opening hours.');
      return false;
    }
    if (date === availability.today && start < availability.currentMinute) {
      setMessage(`already passed. now ${minuteTime(availability.currentMinute)}.`);
      return false;
    }
    const end = selection && selection.end > start && selection.end <= period.end ? selection.end : Math.min(period.end, start + 30);
    setSelection({ start, end });
    setMessage('');
    return true;
  }

  function changeEnd(value: string) {
    if (!selection) return false;
    const end = parsedTime(value, true);
    if (end === null) {
      setMessage('use 24h format: 18:15.');
      return false;
    }
    if (end <= selection.start || !openPeriod(selection.start, end)) {
      setMessage('outside opening hours.');
      return false;
    }
    setSelection({ ...selection, end });
    setMessage('');
    return true;
  }

  function setDuration(minutes: number) {
    if (!selection) return;
    const end = selection.start + minutes;
    if (!openPeriod(selection.start, end)) {
      setMessage('outside opening hours.');
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
        body: JSON.stringify({ date, room, start: selection.start, end: selection.end }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'that did not work.');
      const label = `${minuteTime(selection.start)}–${minuteTime(selection.end)}`;
      const completedMode = selectionState.mode;
      setSelection(null);
      setMessage(`${label}. ${completedMode === 'release' ? 'released.' : 'booked.'}`);
      await loadAvailability(date, room, true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'that did not work.');
      await loadAvailability(date, room, true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="booking" aria-label="Reservation times" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="booking-toolbar">
        <div className="segmented-control" aria-label="Day">
          {[availability.today, availability.tomorrow].map((item, index) => (
            <button key={item} type="button" onClick={() => switchDate(item)} aria-pressed={date === item}>
              <span>{index === 0 ? 'today' : 'tomorrow'}</span>
              <small>{dateLabel(item, '')}</small>
            </button>
          ))}
        </div>
        <div className="segmented-control room-control" aria-label="Room">
          {(['left', 'right'] as const).map((item) => (
            <button key={item} type="button" onClick={() => switchRoom(item)} aria-pressed={room === item}>{item}</button>
          ))}
        </div>
        <button type="button" onClick={() => loadAvailability(date, room)} className="refresh-button" aria-label="Refresh availability">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-3 sm:p-4">
        {loading ? (
          <output className="grid min-h-72 place-items-center text-xs text-muted-foreground">
            <span className="sr-only">Loading availability</span>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </output>
        ) : (
          <>
            <div className="interval-fields">
              <TimeField key={`start-${selection?.start ?? 'empty'}`} label="from" value={selection ? minuteTime(selection.start) : ''} onCommit={changeStart} />
              <ArrowRight className="mb-3 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <TimeField key={`end-${selection?.end ?? 'empty'}`} label="to" value={selection ? minuteTime(selection.end) : ''} disabled={!selection} onCommit={changeEnd} />
            </div>

            <div className="quick-durations" aria-label="Quick duration">
              {[15, 30, 60, 120].map((minutes) => (
                <button key={minutes} type="button" onClick={() => setDuration(minutes)} disabled={!selection}>
                  {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                </button>
              ))}
            </div>

            <div className="axis-legend" aria-hidden="true">
              <span><i className="occupied-swatch" /> occupied</span>
              {date === availability.today ? <span><i className="past-swatch" /> past</span> : null}
            </div>

            <div className="axes" aria-label={`${room} room timetable`}>
              {AXIS_SECTIONS.map((section) => {
                const length = section.end - section.start;
                const pastMinutes = date === availability.today ? Math.max(0, Math.min(length, availability.currentMinute - section.start)) : 0;
                const hasNow = date === availability.today && availability.currentMinute >= section.start && availability.currentMinute < section.end;
                return (
                  <div key={section.start} className={`axis-wrap ${length === 60 ? 'axis-compact' : ''}`}>
                    <div className="axis-labels" aria-hidden="true">
                      {section.ticks.map((tick) => (
                        <span key={tick} style={{ left: `${((tick - section.start) / length) * 100}%` }}>{minuteTime(tick)}</span>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="interval-axis"
                      onPointerDown={(event) => startAxisSelection(event, section)}
                      onPointerMove={(event) => moveAxisSelection(event, section)}
                      onPointerUp={finishAxisSelection}
                      onPointerCancel={finishAxisSelection}
                      aria-label={`Choose a time between ${minuteTime(section.start)} and ${minuteTime(section.end)}`}
                    >
                      {pastMinutes > 0 ? <span className="axis-past" style={{ width: `${(pastMinutes / length) * 100}%` }}>{pastMinutes / length > 0.22 ? 'past' : ''}</span> : null}
                      {availability.reservedIntervals.map((item) => {
                        const start = Math.max(item.start, section.start);
                        const end = Math.min(item.end, section.end);
                        if (end <= start) return null;
                        return <span key={`${item.start}-${item.end}`} className="axis-reserved" title={`${minuteTime(item.start)}–${minuteTime(item.end)} occupied`} style={{ left: `${((start - section.start) / length) * 100}%`, width: `${((end - start) / length) * 100}%` }} />;
                      })}
                      {selection && selection.start < section.end && selection.end > section.start ? (
                        <span
                          className={`axis-choice ${selectionState.mode === 'release' ? 'axis-choice-release' : ''} ${!selectionState.valid ? 'axis-choice-invalid' : ''}`}
                          style={{
                            left: `${((Math.max(selection.start, section.start) - section.start) / length) * 100}%`,
                            width: `${((Math.min(selection.end, section.end) - Math.max(selection.start, section.start)) / length) * 100}%`,
                          }}
                        />
                      ) : null}
                      {hasNow ? <span className="axis-now" style={{ left: `${((availability.currentMinute - section.start) / length) * 100}%` }}><i>now</i></span> : null}
                    </button>
                  </div>
                );
              })}
            </div>

            {availability.reservedIntervals.length ? (
              <div className="occupied-list">
                <span>occupied</span>
                <div>
                  {availability.reservedIntervals.map((item) => (
                    <button key={`${item.start}-${item.end}`} type="button" onClick={() => { setSelection({ ...item }); setMessage(''); }}>
                      <i /> {minuteTime(item.start)}–{minuteTime(item.end)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="booking-footer">
        <div className="min-w-0">
          <p className="font-heading text-lg tracking-tight">
            {selection ? `${minuteTime(selection.start)}–${minuteTime(selection.end)}` : `${room}. nothing picked.`}
            {selection ? <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{durationLabel(selection.end - selection.start)}</span> : null}
          </p>
          <p aria-live="polite" aria-atomic="true" className="mt-1 min-h-4 text-xs leading-4 text-muted-foreground">
            {message || selectionState.reason}
          </p>
        </div>
        <button type="button" onClick={submitReservation} disabled={!selection || !selectionState.valid || saving || loading} className="submit-button">
          {saving ? <Loader2 className="animate-spin" /> : <>{selection && !selectionState.valid ? 'unavailable' : selectionState.mode === 'release' ? 'unreserve' : 'reserve'} <ArrowRight /></>}
        </button>
      </div>
    </section>
  );
}
