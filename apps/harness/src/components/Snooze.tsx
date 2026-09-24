import { useState } from "react";
import { CalendarClock, CalendarDays, Clock, Sunrise } from "lucide-react";
import { IconButton, Popover } from "./ui";

const HOUR = 3_600_000;

/** Now + 3h, rounded up to the next quarter hour. */
function laterToday(now: number): Date {
  const quarter = 15 * 60_000;
  return new Date(Math.ceil((now + 3 * HOUR) / quarter) * quarter);
}

function tomorrowMorning(now: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Monday 9:00 of next week (on a Sunday, not tomorrow: that is what "Amanhã" is for). */
function nextWeek(now: number): Date {
  const d = new Date(now);
  const days = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + (days === 1 ? 8 : days));
  d.setHours(9, 0, 0, 0);
  return d;
}

const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const day = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

/** "hoje, 17:45" · "amanhã, 09:00" · "seg., 09:00" · "12 out., 09:00". */
export function whenLabel(date: Date | string, now = Date.now()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - start.getTime()) / (24 * HOUR));
  const at = time.format(d);
  if (days === 0) return `hoje, ${at}`;
  if (days === 1) return `amanhã, ${at}`;
  if (days > 1 && days < 7) return `${weekday.format(d)}, ${at}`;
  return `${day.format(d)}, ${at}`;
}

/** Value for <input type="datetime-local"> in local time. */
function localInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "Adiar" of a thread: out of the list until the chosen moment, then back at the top of its
 * project. The clock opens a few ready times and a custom date.
 */
export function SnoozeMenu({
  onSnooze,
  label = "Adiar",
}: {
  onSnooze: (untilIso: string) => void;
  label?: string;
}) {
  return (
    <Popover
      side="bottom"
      align="end"
      className="menu snooze-menu"
      trigger={({ open, toggle }) => (
        <IconButton
          label={label}
          className={`thread-snooze${open ? " is-open" : ""}`}
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Clock size={13} strokeWidth={1.75} />
        </IconButton>
      )}
    >
      {(close) => (
        <SnoozeOptions
          onPick={(d) => {
            close();
            onSnooze(d.toISOString());
          }}
        />
      )}
    </Popover>
  );
}

function SnoozeOptions({ onPick }: { onPick: (d: Date) => void }) {
  const [now] = useState(() => Date.now());
  const [custom, setCustom] = useState<string | null>(null);
  const options = [
    { icon: Clock, label: "Mais tarde", at: laterToday(now) },
    { icon: Sunrise, label: "Amanhã", at: tomorrowMorning(now) },
    { icon: CalendarDays, label: "Semana que vem", at: nextWeek(now) },
  ];
  const customDate = custom ? new Date(custom) : null;
  const customOk = customDate !== null && !Number.isNaN(customDate.getTime()) && customDate.getTime() > Date.now();

  return (
    <>
      <div className="menu-label">Adiar até</div>
      {options.map(({ icon: Icon, label, at }) => (
        <button key={label} type="button" className="menu-item" onClick={() => onPick(at)}>
          <span className="menu-item-icon">
            <Icon size={14} strokeWidth={1.75} />
          </span>
          <span className="menu-item-text">{label}</span>
          <span className="snooze-when">{whenLabel(at, now)}</span>
        </button>
      ))}
      <div className="menu-sep" />
      {custom === null ? (
        <button type="button" className="menu-item" onClick={() => setCustom(localInput(tomorrowMorning(now)))}>
          <span className="menu-item-icon">
            <CalendarClock size={14} strokeWidth={1.75} />
          </span>
          <span className="menu-item-text">Escolher dia e hora…</span>
        </button>
      ) : (
        <form
          className="menu-field snooze-custom"
          onSubmit={(e) => {
            e.preventDefault();
            if (customOk && customDate) onPick(customDate);
          }}
        >
          <input
            className="input"
            type="datetime-local"
            value={custom}
            min={localInput(new Date(now))}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Dia e hora"
            autoFocus
          />
          <button type="submit" className="btn btn-small btn-primary" disabled={!customOk}>
            Adiar
          </button>
        </form>
      )}
    </>
  );
}
