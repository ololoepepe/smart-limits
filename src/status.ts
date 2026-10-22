// The text of /smart-limits:status: the windows with their shares and
// resets, the context fill, the thresholds, and what is in force now.

import type {Command, Settings} from './options.ts';

import {localTime, parseIso, waitText} from './time.ts';
import {percentText, type Window, windowLabel} from './windows.ts';

export type ContextFill = {
  percent?: number;
  tokens?: number;
  window: number;
};

export type Compaction = {
  at: number;
  skip: string | undefined;
};

export type CompactRequest = {
  at: number;
  instructions: string | undefined;
};

export type EngineCompaction = {
  at: number;
  trigger: string;
};

export type StatusInput = {
  compactPending: boolean;
  context: ContextFill | undefined;
  hard: readonly string[];
  isReminding: boolean;
  lastCompact: Compaction | undefined;
  lastEngineCompact: EngineCompaction | undefined;
  now: number;
  request: CompactRequest | undefined;
  settings: Settings;
  soft: readonly string[];
  windows: readonly Window[];
};

function windowText(window: Window, now: number): string {
  const resetsAt = parseIso(window.resetsAt);
  const reset = resetsAt === undefined ? '' : ` (resets ${localTime(resetsAt, now)}, ${waitText(resetsAt, now)})`;
  return `${windowLabel(window.kind)} ${percentText(window.percentUsed)}${reset}`;
}

function thresholdText(value: number): string {
  return value > 0 ? percentText(value) : 'off';
}

function commandText(command: Command | undefined): string {
  return command === undefined ? 'none' : `/${command.command} ${command.args}`.trim();
}

function kindsOf(keys: readonly string[]): string {
  return keys.map(key => windowLabel(key.split('@', 1)[0] ?? key)).join(', ');
}

function contextText(context: ContextFill | undefined): string {
  if (context?.percent === undefined) {
    return 'no reading (none before the first response, or right after a compaction)';
  }

  return `${percentText(context.percent)} of ${context.window} tokens${
    context.tokens === undefined ? '' : ` (${context.tokens})`}`;
}

function inForceText(input: StatusInput): string {
  if (input.hard.length > 0) {
    return `hard limit crossed by ${kindsOf(input.hard)}: Bash, Write, Edit, NotebookEdit and new agents are refused`;
  }

  return input.soft.length > 0 ?
    `soft limit crossed by ${kindsOf(input.soft)}: warned, nothing refused` :
    'nothing crossed, nothing refused';
}

function compactionText(input: StatusInput): string {
  const parts: string[] = [];
  if (input.request !== undefined) {
    parts.push(`requested by the model at ${localTime(input.request.at, input.now)}, waits for the end of the turn`);
  } else if (input.isReminding) {
    parts.push(`the model is reminded: the window is past ${percentText(input.settings.compactAt)}`);
  }

  if (input.lastCompact === undefined) {
    parts.push('none at the model\'s request yet');
  } else {
    const when = localTime(input.lastCompact.at, input.now);
    parts.push(input.lastCompact.skip === undefined ?
      `last at the model's request at ${when}` :
      `last asked at ${when}, skipped: ${input.lastCompact.skip}`);
  }

  if (input.compactPending) {
    parts.push('refused during a turn, retried after it');
  }

  if (input.lastEngineCompact !== undefined) {
    parts.push(`last by the engine (${input.lastEngineCompact.trigger}) at ${
      localTime(input.lastEngineCompact.at, input.now)}`);
  }

  return parts.join('; ');
}

export function statusText(input: StatusInput): string {
  const {settings} = input;
  const windows = input.windows.length === 0 ?
    'no reading yet (none off a subscription, or before the first response)' :
    input.windows.map(window => windowText(window, input.now)).join(' · ');
  return [
    `windows: ${windows}`,
    `context: ${contextText(input.context)}`,
    `thresholds: compact at ${thresholdText(settings.compactAt)}, soft ${thresholdText(settings.limitSoft)}, hard ${
      thresholdText(settings.limitHard)}, at hard: ${commandText(settings.atHard)}, at reset: ${
      commandText(settings.atReset)}`,
    `in force: ${inForceText(input)}`,
    `compaction: ${compactionText(input)}`
  ].join('\n');
}
