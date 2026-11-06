// The subscription windows as the engine reports them, and everything the
// plugin says about them: which are still open, which stands highest, what
// the status line reads, and the texts of the warning and the refusal.

import type {Settings} from './options.ts';

import {localTime, parseIso, waitText} from './time.ts';

export type Window = {
  kind: string;
  percentUsed: number;
  resetsAt?: string;
};

const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend'
};

const NAMES: Record<string, string> = {
  five_hour: 'the 5-hour window',
  seven_day: 'the 7-day window',
  spend_limit: 'the spend limit'
};

export function windowLabel(kind: string): string {
  return LABELS[kind] ?? kind;
}

export function windowName(kind: string): string {
  return NAMES[kind] ?? `the ${kind} window`;
}

function numberText(value: number): string {
  return Number.isSafeInteger(value) ? String(value) : value.toFixed(1);
}

export function percentText(value: number): string {
  return `${numberText(value)}%`;
}

// The windows whose reset is still ahead. A reading the engine keeps from
// the last response outlives the window it describes: once the reset has
// passed, the window is over and says nothing about the current one.
export function liveWindows(windows: readonly Window[], now: number): Window[] {
  return windows.filter(window => {
    const resetsAt = parseIso(window.resetsAt);
    return resetsAt === undefined || resetsAt > now;
  });
}

// The window with the largest share; the first of equals.
export function peakWindow(windows: readonly Window[]): undefined | Window {
  return windows.reduce<undefined | Window>(
    (peak, window) => (peak === undefined || window.percentUsed > peak.percentUsed ? window : peak),
    undefined
  );
}

export function windowsAbove(windows: readonly Window[], threshold: number): Window[] {
  return threshold > 0 ? windows.filter(window => window.percentUsed >= threshold) : [];
}

// One crossing is one window of one kind: the same kind after a reset is a
// new window, and its crossing is announced again.
export function crossingKey(window: Window): string {
  return `${window.kind}@${window.resetsAt ?? ''}`;
}

export type Crossings = {
  hard: string[];
  soft: string[];
};

export function crossingsOf(windows: readonly Window[], settings: Settings): Crossings {
  return {
    hard: windowsAbove(windows, settings.limitHard).map(crossingKey),
    soft: windowsAbove(windows, settings.limitSoft).map(crossingKey)
  };
}

// The keys present now and absent before.
export function entered(previous: readonly string[], current: readonly string[]): string[] {
  return current.filter(key => !previous.includes(key));
}

export function windowByKey(windows: readonly Window[], key: string): undefined | Window {
  return windows.find(window => crossingKey(window) === key);
}

// The earliest reset ahead of now, in milliseconds since the epoch.
export function nextResetAt(windows: readonly Window[], now: number): number | undefined {
  const ahead = windows
    .map(window => parseIso(window.resetsAt))
    .filter((resetsAt): resetsAt is number => resetsAt !== undefined && resetsAt > now);
  return ahead.length === 0 ? undefined : Math.min(...ahead);
}

export type StatusLineInput = {
  // The context fill in percent; undefined before the first response and
  // right after a compaction.
  contextPercent: number | undefined;
  now: number;
  settings: Settings;
  // The live windows.
  windows: readonly Window[];
};

// `5h 63% · 7d 41% · soft 80 · hard 90 · ctx 52/70 · reset 18:40`: the
// windows, one at the hard limit marked STOP, the thresholds that are on,
// the context fill over the compaction threshold, the nearest reset. Without
// a reading of the windows only the context; nothing without either.
export function statusLine(input: StatusLineInput): string | undefined {
  const {settings, windows} = input;
  const parts = windows.map(window => `${windowLabel(window.kind)} ${percentText(window.percentUsed)}${
    settings.limitHard > 0 && window.percentUsed >= settings.limitHard ? ' STOP' : ''}`);
  if (windows.length > 0 && settings.limitSoft > 0) {
    parts.push(`soft ${numberText(settings.limitSoft)}`);
  }

  if (windows.length > 0 && settings.limitHard > 0) {
    parts.push(`hard ${numberText(settings.limitHard)}`);
  }

  if (input.contextPercent !== undefined) {
    parts.push(settings.compactAt > 0 ?
      `ctx ${numberText(input.contextPercent)}/${numberText(settings.compactAt)}` :
      `ctx ${percentText(input.contextPercent)}`);
  }

  const reset = nextResetAt(windows, input.now);
  if (reset !== undefined) {
    parts.push(`reset ${localTime(reset, input.now)}`);
  }

  return parts.length === 0 ? undefined : parts.join(' · ');
}

function resetText(window: Window, now: number): string {
  const resetsAt = parseIso(window.resetsAt);
  return resetsAt === undefined ?
    'no reset time is known' :
    `it resets at ${localTime(resetsAt, now)} (${waitText(resetsAt, now)})`;
}

// The toast's text, short: the engine draws it under the plugin's name in a
// box a few lines high.
export function softText(window: Window, threshold: number, now: number): string {
  const resetsAt = parseIso(window.resetsAt);
  const reset = resetsAt === undefined ? '' : `, resets ${localTime(resetsAt, now)} (${waitText(resetsAt, now)})`;
  return `${windowName(window.kind)} is at ${percentText(window.percentUsed)}, past the soft limit of ${
    percentText(threshold)}${reset}. Start nothing new.`;
}

// The line when the hard limit clears: which windows left it, and how (a
// reset, or a share below the limit).
export function clearedText(previousHard: readonly string[], live: readonly Window[]): string {
  const how = previousHard.map(key => {
    const kind = key.split('@', 1)[0] ?? key;
    const stillLive = windowByKey(live, key);
    return `${windowName(kind)} ${stillLive === undefined ? 'reset' : 'is below the limit'}`;
  });
  return `the hard limit is clear: ${how.join(', ')}; Bash, Write, Edit, NotebookEdit and new agents pass again`;
}

// Without the plugin's name: the guards add it for the model, and the
// transcript line is printed under the name by the engine.
export function denyText(window: Window, threshold: number, now: number): string {
  return `${windowName(window.kind)} is at ${percentText(window.percentUsed)}, past the hard limit of ${
    percentText(threshold)}; ${resetText(window, now)}. Bash, Write, Edit, NotebookEdit and new agents are refused ` +
    'until then. Stop now: do not present unfinished work as finished; report what is done, what is half-done ' +
    'and what remains.';
}
