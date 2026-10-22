// Times for a person: a reset moment as a local clock reading, and the wait
// until it in hours and minutes. The module has no Intl, so the formatting
// is spelled out here; the local time zone is the process's own.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export function parseIso(text: string | undefined): number | undefined {
  if (text === undefined) {
    return undefined;
  }

  const ms = Date.parse(text);
  return Number.isNaN(ms) ? undefined : ms;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

// `18:40` in local time.
export function localClock(ms: number): string {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// `18:40` when the moment is within a day of now, else `Fri 18:40`.
export function localTime(ms: number, now: number): string {
  const clock = localClock(ms);
  return Math.abs(ms - now) < DAY_MS ? clock : `${WEEKDAYS[new Date(ms).getDay()] ?? ''} ${clock}`;
}

// `in 1 h 12 min`, `in 2 d 3 h`, `in 5 min`; `now` once the moment is here.
export function waitText(ms: number, now: number): string {
  const left = ms - now;
  if (left < MINUTE_MS) {
    return 'now';
  }

  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / HOUR_MS);
  if (days > 0) {
    return `in ${days} d ${hours} h`;
  }

  const minutes = Math.floor((left % HOUR_MS) / MINUTE_MS);
  return hours > 0 ? `in ${hours} h ${minutes} min` : `in ${minutes} min`;
}
