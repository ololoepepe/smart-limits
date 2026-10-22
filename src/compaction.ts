// The context window: the plugin never compacts on its own. Past the
// threshold it reminds the model, on every tool result, to ask for a
// compaction at a point of its own choosing; the model asks through the
// plugin's tool, the conversation is compacted when that turn ends, and a
// prompt wakes the model to go on. The reminders stop after a compaction
// until a reading below the threshold: a summary may itself fill more than
// the threshold, and asking again at once would loop.

import {percentText} from './windows.ts';

export const COMPACT_TOOL = 'mcp__smart-limits__compact';
export const COMPACT_TOOL_NAME = 'compact';

export const COMPACT_TOOL_DESCRIPTION = 'Compacts this conversation at the end of the current turn, at a point you ' +
  'choose: call it when nothing is half-done, then end the turn with a short note of where you are. Pass ' +
  'instructions: what the summary must keep (the task, its state, the next step). Once the conversation is ' +
  'compacted, a prompt wakes you to continue. Main conversation only.';

export const COMPACT_TOOL_SCHEMA = {
  properties: {
    instructions: {
      description: 'What the summary must keep: the task, its state, the next step.',
      type: 'string'
    }
  },
  type: 'object'
};

export const WAKE_TEXT = 'The conversation was compacted at your request. Continue the work from the summary.';

export const SUBAGENT_REFUSAL = 'smart-limits: the compact tool is for the main conversation; a subagent\'s ' +
  'transcript is not compacted by the plugin. Go on with your task.';

export enum CompactAction {
  None = 'none',
  Rearm = 'rearm',
  Remind = 'remind'
}

// Armed while the fill was last seen below the threshold: at or above it the
// model is reminded; after a compaction the plugin arms again only at a
// reading below.
export function compactAction(percent: number | undefined, compactAt: number, isArmed: boolean): CompactAction {
  if (percent === undefined || compactAt <= 0) {
    return CompactAction.None;
  }

  if (percent >= compactAt) {
    return isArmed ? CompactAction.Remind : CompactAction.None;
  }

  return isArmed ? CompactAction.None : CompactAction.Rearm;
}

// What the model reads after a tool's result while a compaction is due.
export function reminderText(percent: number, compactAt: number): string {
  return `smart-limits: the context window is ${percentText(percent)} full, past the ${percentText(compactAt)} at ` +
    'which this conversation should be compacted. Finish the current step at a point where nothing is half-done, ' +
    'then call the smart-limits compact tool with what the summary must keep and end the turn; a prompt wakes you ' +
    'after the compaction. Until then the engine may compact on its own in the middle of a step.';
}

// The compact tool's answer.
export function requestAnswer(percent: number | undefined): string {
  const at = percent === undefined ? '' : ` at ${percentText(percent)}`;
  return `smart-limits: noted${at}: the conversation is compacted as soon as this turn ends, with your instructions. ` +
    'End the turn now with a short note of where you are; a prompt wakes you afterwards.';
}

// The model's note first, the settings' standing instructions after it.
export function joinInstructions(note: string, standing: string | undefined): string | undefined {
  const parts = [note.trim(), standing?.trim() ?? ''].filter(part => part !== '');
  return parts.length === 0 ? undefined : parts.join('\n\n');
}
