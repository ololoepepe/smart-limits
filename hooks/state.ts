// The state of one session, kept in the module between events: the settings
// in force, the latest reading of the windows and the context, which
// crossings were announced, whether the tools are refused, and what the
// plugin knows about compactions. A reload of the module starts it over.

import type {EngineInterface, PluginOptions, SessionContextUsage, Timer} from 'claude-code';

import type {Compaction, CompactRequest, EngineCompaction} from '../src/status.ts';
import type {Window} from '../src/windows.ts';

import {DEFAULT_SETTINGS, parseSettings, type Settings} from '../src/options.ts';

export const OWN_COMMAND_PREFIX = 'smart-limits:';

// The values kept in the engine's session state across a hot reload of the
// module (types/index.d.ts); `plugin` and `key` are literals, as `$.state`
// asks.
const CROSSINGS = {
  key: 'crossings',
  plugin: 'smart-limits'
} as const;
const COMPACTION = {
  key: 'compaction',
  plugin: 'smart-limits'
} as const;

// Refusals of one requested compaction before the plugin drops the request:
// each from the timer after a main turn. A headless session refuses every
// one, since its engine compacts inside a turn only.
const MAX_COMPACT_REFUSALS = 4;

export type State = {
  // Armed while the context fill was last seen below the threshold: at or
  // above it the model is reminded.
  compactArmed: boolean;
  // A requested compaction waits for the end of the main turn.
  compactPending: boolean;
  // The refusals of the request so far.
  compactRefusals: number;
  context: SessionContextUsage | undefined;
  // The refusal the guards answer with while the hard limit is crossed.
  denyText: string | undefined;
  // The crossings announced so far, by crossing key.
  hard: string[];
  lastCompact: Compaction | undefined;
  lastEngineCompact: EngineCompaction | undefined;
  // The model's request, until the compaction it asked for.
  request: CompactRequest | undefined;
  resetTimer: Timer | undefined;
  settings: Settings;
  soft: string[];
  // The windows as the engine last reported them, reset or not.
  windows: Window[];
};

export const state: State = {
  compactArmed: true,
  compactPending: false,
  compactRefusals: 0,
  context: undefined,
  denyText: undefined,
  hard: [],
  lastCompact: undefined,
  lastEngineCompact: undefined,
  request: undefined,
  resetTimer: undefined,
  settings: DEFAULT_SETTINGS,
  soft: [],
  windows: []
};

export function configure(options: PluginOptions): void {
  state.settings = parseSettings(options, OWN_COMMAND_PREFIX);
}

// What the engine kept for this session, taken back at the start: after a
// reload the crossings already acted on are not announced again, and the
// compaction's memory stands.
export async function restore($: EngineInterface): Promise<void> {
  try {
    const crossings = await $.state.get(CROSSINGS);
    if (crossings.value !== undefined) {
      state.soft = [...crossings.value.soft];
      state.hard = [...crossings.value.hard];
    }

    const compaction = await $.state.get(COMPACTION);
    if (compaction.value !== undefined) {
      state.compactArmed = compaction.value.isArmed;
      state.lastCompact = compaction.value.lastCompactAt === null ?
        undefined :
        {
          at: compaction.value.lastCompactAt,
          skip: compaction.value.lastCompactSkip ?? undefined
        };
      state.request = compaction.value.requestedAt === null ?
        undefined :
        {
          at: compaction.value.requestedAt,
          instructions: compaction.value.requestedInstructions ?? undefined
        };
      state.compactPending = state.request !== undefined;
    }
  } catch (error) {
    $.ui.log(`the session state was not read: ${String(error)}`, {to: 'debug'});
  }
}

export async function keep($: EngineInterface): Promise<void> {
  try {
    await $.state.set(CROSSINGS, {
      hard: [...state.hard],
      soft: [...state.soft]
    });
    await $.state.set(COMPACTION, {
      isArmed: state.compactArmed,
      lastCompactAt: state.lastCompact?.at ?? null,
      lastCompactSkip: state.lastCompact?.skip ?? null,
      requestedAt: state.request?.at ?? null,
      requestedInstructions: state.request?.instructions ?? null
    });
  } catch (error) {
    $.ui.log(`the session state was not written: ${String(error)}`, {to: 'debug'});
  }
}

// The compaction's bookkeeping, in plain functions so that a handler that
// awaits the engine does not write the state across the wait itself.
export function armCompaction(): void {
  state.compactArmed = true;
  state.compactPending = false;
  state.compactRefusals = 0;
}

export function noteRequest(request: CompactRequest): void {
  state.request = request;
  state.compactPending = true;
  state.compactRefusals = 0;
}

// The compaction the model asked for is done (or skipped by the engine):
// the request is over, and the reminders wait for a reading below the
// threshold.
export function noteCompaction(compaction: Compaction): void {
  state.lastCompact = compaction;
  state.request = undefined;
  state.compactArmed = false;
  state.compactPending = false;
}

// A refusal: the request stands and is tried again after the next main
// turn, until its refusals reach the limit; then it is dropped.
export function noteCompactRefused(): void {
  state.compactRefusals += 1;
  state.compactPending = state.compactRefusals < MAX_COMPACT_REFUSALS;
  if (!state.compactPending) {
    state.request = undefined;
  }
}

export function isReminding(): boolean {
  const percent = state.context?.percent;
  return state.request === undefined && state.compactArmed && percent !== undefined && state.settings.compactAt > 0 &&
    percent >= state.settings.compactAt;
}

function thresholdText(value: number): string {
  return value > 0 ? `${value}%` : 'off';
}

export function settingsLine(): string {
  const {settings} = state;
  return `compact at ${thresholdText(settings.compactAt)}, soft ${thresholdText(settings.limitSoft)}, hard ${
    thresholdText(settings.limitHard)}, at hard ${
    settings.atHard === undefined ? 'none' : `/${settings.atHard.command}`}, at reset ${
    settings.atReset === undefined ? 'none' : `/${settings.atReset.command}`}`;
}
