'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Loader2, RefreshCw, X } from 'lucide-react';

const OPEN_SLOTS = [0, 1, ...Array.from({ length: 38 }, (_, index) => index + 10)];

type Availability = {
  reservedSlots: number[];
  today: string;
  tomorrow: string;
  currentSlot: number;
};

function slotTime(slot: number) {
  if (slot === 48) return '24:00';
  return `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
}

function dateLabel(date: string, fallback: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(parsed);
}

export function BookingClient({ initialToday, initialTomorrow }: { initialToday: string; initialTomorrow: string }) {
  const [date, setDate] = useState(initialToday);
  const [availability, setAvailability] = useState<Availability>({ reservedSlots: [], today: initialToday, tomorrow: initialTomorrow, currentSlot: 0 });
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const reserved = useMemo(() => new Set(availability.reservedSlots), [availability.reservedSlots]);
  const selectedSlots = useMemo(() => {
    if (!selection) return [];
    return Array.from({ length: selection.end - selection.start + 1 }, (_, index) => selection.start + index);
  }, [selection]);
  const selected = useMemo(() => new Set(selectedSlots), [selectedSlots]);

  async function loadAvailability(targetDate = date, keepMessage = false) {
    setLoading(true);
    if (!keepMessage) setMessage('');
    try {
      const response = await fetch(`/api/reservations?date=${encodeURIComponent(targetDate)}`, { cache: 'no-store' });
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

  function isUnavailable(slot: number) {
    return reserved.has(slot) || (date === availability.today && slot < availability.currentSlot);
  }

  function chooseSlot(slot: number) {
    if (isUnavailable(slot)) return;
    setMessage('');
    if (!selection) {
      setSelection({ start: slot, end: slot });
      return;
    }
    if (selection.start === slot && selection.end === slot) {
      setSelection(null);
      return;
    }
    const start = Math.min(selection.start, slot);
    const end = Math.max(selection.start, slot);
    const range = Array.from({ length: end - start + 1 }, (_, index) => start + index);
    const rangeAvailable = range.every((item) => OPEN_SLOTS.includes(item) && !isUnavailable(item));
    if (!rangeAvailable) {
      setSelection({ start: slot, end: slot });
      setMessage('that range was busy. new start picked.');
      return;
    }
    setSelection({ start, end });
  }

  async function submitReservation() {
    if (!selection || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, slots: selectedSlots }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'did not book. rude.');
      const label = `${slotTime(selection.start)}–${slotTime(selection.end + 1)}`;
      setSelection(null);
      setMessage(`${label}. booked.`);
      await loadAvailability(date, true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'did not book. rude.');
      await loadAvailability(date, true);
    } finally {
      setSaving(false);
    }
  }

  const durationMinutes = selectedSlots.length * 30;
  const durationLabel = durationMinutes < 60 ? '30m' : `${durationMinutes / 60 % 1 ? (durationMinutes / 60).toFixed(1) : durationMinutes / 60}h`;

  return (
    <section id="booking" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border p-3 sm:p-4">
        <div className="flex rounded-xl bg-secondary p-1 text-sm font-medium">
          {[availability.today, availability.tomorrow].map((item, index) => (
            <button
              key={item}
              type="button"
              onClick={() => { setSelection(null); setDate(item); }}
              className={`rounded-lg px-3 py-2 transition sm:min-w-32 ${date === item ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
              aria-pressed={date === item}
            >
              <span className="mr-1.5">{index === 0 ? 'today' : 'tomorrow'}</span>
              <span className="hidden opacity-55 sm:inline">{dateLabel(item, '')}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => loadAvailability(date)} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Refresh availability">
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-3 sm:p-4">
        {loading ? (
          <div className="grid min-h-80 place-items-center text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-label="Loading availability" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 sm:gap-2" role="group" aria-label="Available reservation times">
            {OPEN_SLOTS.map((slot) => {
              const taken = reserved.has(slot);
              const past = date === availability.today && slot < availability.currentSlot;
              const active = selected.has(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => chooseSlot(slot)}
                  disabled={taken || past}
                  className={`slot-button ${active ? 'slot-selected' : ''} ${taken ? 'slot-taken' : ''}`}
                  aria-pressed={active}
                  aria-label={`${slotTime(slot)}, ${taken ? 'taken' : past ? 'past' : active ? 'selected' : 'available'}`}
                >
                  {active && slot === selection?.start ? <Check className="size-3" aria-hidden="true" /> : null}
                  <span>{slotTime(slot)}</span>
                  {taken ? <X className="size-3" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-secondary/45 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="font-heading text-lg tracking-tight">
            {selection ? `${slotTime(selection.start)}–${slotTime(selection.end + 1)}` : 'nothing picked.'}
            {selection ? <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{durationLabel}</span> : null}
          </p>
          {message ? <p aria-live="polite" className="mt-1 truncate text-xs text-muted-foreground">{message}</p> : null}
        </div>
        <button type="button" onClick={submitReservation} disabled={!selection || saving || loading} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:pointer-events-none disabled:opacity-35">
          {saving ? <Loader2 className="animate-spin" /> : <>book it <ArrowRight /></>}
        </button>
      </div>
    </section>
  );
}
