// The subscription windows: the status line while there is a reading, one
// warning per crossing of the soft limit, and at the hard limit the command
// the settings name plus the refusal of Bash, Write, Edit, NotebookEdit and
// new agents in every loop, until the share falls below the limit or the
// window resets. A timer at the nearest reset reads the engine's figures
// again, since no measurement arrives while the session is idle; once no
// window holds the hard limit, the command named for that moment runs, so
// that a run paused at the limit goes on.

import type {EngineInterface, On, SessionRateLimit} from 'claude-code';

import type {Command} from '../src/options.ts';

import {
  clearedText, crossingsOf, denyText, entered, liveWindows, nextResetAt, peakWindow, softText, statusLine, windowByKey,
  windowsAbove
} from '../src/windows.ts';

import {keep, state} from './state.ts';

// A command runs from a timer: inside a hook the turn waits on, the engine
// refuses it.
const COMMAND_DELAY_MS = 1000;
// Past the reset by this much, so the window is over by the engine's clock too.
const RESET_GRACE_MS = 2000;
// A timer longer than this re-arms when it fires: the host's timers cannot
// wait longer than about 24 days, and a spend limit may reset later than that.
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;
const SOFT_TOAST_MS = 20_000;
// What the model reads carries the plugin's name; a transcript line does
// not, since the engine prints it under the name already.
const PREFIX = 'smart-limits: ';
const GUARD_FAILED = `${PREFIX}the guard failed while a subscription window is past the hard limit; see the ` +
  'debug log and /smart-limits:status';

function firstLine(text: string | undefined): string {
  return text === undefined ? '' : `: ${text.split('\n', 1)[0] ?? ''}`;
}

async function runCommand($: EngineInterface, command: Command, when: string): Promise<void> {
  try {
    const result = await $.command.run({
      args: command.args,
      command: command.command
    });
    $.ui.log(`/${command.command} ran ${when}${firstLine(result.text)}`, {to: 'debug'});
  } catch (error) {
    $.ui.log(`/${command.command} did not run ${when}: ${String(error)}`, {to: 'transcript'});
  }
}

function runLater($: EngineInterface, command: Command | undefined, when: string): void {
  if (command === undefined) {
    return;
  }

  $.clock.after(COMMAND_DELAY_MS, () => {
    void runCommand($, command, when);
  });
}

function armResetTimer($: EngineInterface, resetsAt: number | undefined, now: number): void {
  state.resetTimer?.cancel();
  state.resetTimer = undefined;
  if (resetsAt === undefined) {
    return;
  }

  const wait = Math.min(MAX_WAIT_MS, Math.max(0, resetsAt - now) + RESET_GRACE_MS);
  state.resetTimer = $.clock.after(wait, () => {
    state.resetTimer = undefined;
    void reevaluate($);
  });
}

// One reading of the windows, from a measurement or from the engine's
// figures on request: everything the plugin shows and refuses follows.
export function applyWindows($: EngineInterface, windows: readonly SessionRateLimit[], now: number): void {
  const {settings} = state;
  state.windows = windows.map(window => ({...window}));
  const live = liveWindows(state.windows, now);
  $.ui.status(statusLine(live, now));

  const crossings = crossingsOf(live, settings);
  const newSoft = entered(state.soft, crossings.soft);
  const newHard = entered(state.hard, crossings.hard);
  const isChanged = newSoft.length > 0 || newHard.length > 0 || state.soft.length !== crossings.soft.length ||
    state.hard.length !== crossings.hard.length;
  const previousHard = state.hard;
  state.soft = crossings.soft;
  state.hard = crossings.hard;
  if (isChanged) {
    void keep($);
  }

  if (previousHard.length > 0 && crossings.hard.length === 0) {
    $.ui.log(clearedText(previousHard, live), {to: 'transcript'});
    runLater($, settings.atReset, 'after the hard limit cleared');
  }

  for (const key of newSoft) {
    const window = windowByKey(live, key);
    if (window !== undefined) {
      $.ui.toast(softText(window, settings.limitSoft, now), {timeoutMs: SOFT_TOAST_MS});
    }
  }

  const peak = peakWindow(windowsAbove(live, settings.limitHard));
  state.denyText = peak === undefined ? undefined : denyText(peak, settings.limitHard, now);
  if (peak !== undefined && newHard.length > 0) {
    $.ui.log(state.denyText ?? '', {to: 'transcript'});
    runLater($, settings.atHard, 'at the hard limit');
  }

  armResetTimer($, nextResetAt(live, now), now);
}

export async function reevaluate($: EngineInterface): Promise<void> {
  try {
    const usage = await $.session.usage();
    const now = await $.clock.now();
    state.context = usage.context;
    applyWindows($, usage.rateLimits, now);
  } catch (error) {
    $.ui.log(`reading the usage failed: ${String(error)}`, {to: 'debug'});
  }
}

// The guards judge on the last reading applied. The response that brings a
// reading past the limit may carry tool uses too, and the engine dispatches
// those calls before the measurement reaches the plugin and before its own
// figures move: they run, and the next response's calls are refused.
export function registerLimitGuards(on: On): void {
  on('tool.call', {tool: ['Bash', 'Write', 'Edit', 'NotebookEdit']}, async ($, event, next) => (
    state.denyText === undefined ? await next(event) : {deny: `${PREFIX}${state.denyText}`}
  )).catch(async (error, event, next) => {
    if (next.called) {
      return await next(event);
    }

    return state.denyText === undefined ? await next(event) : {deny: GUARD_FAILED};
  });

  on('agent.spawn', async ($, event, next) => (
    state.denyText === undefined ? await next(event) : {deny: `${PREFIX}${state.denyText}`}
  )).catch(async (error, event, next) => {
    if (next.called) {
      return await next(event);
    }

    return state.denyText === undefined ? await next(event) : {deny: GUARD_FAILED};
  });
}
