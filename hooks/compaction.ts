// The context window: the model asks for the compaction through the
// plugin's tool, at a point of its own choosing; the engine refuses a
// compaction while a turn runs, so the request waits for the end of the
// main turn and is made from a timer a second later, a few times at most.
// Once the conversation is compacted, a prompt wakes the model to go on.
// The engine's own compactions are observed and never cancelled, and a
// subagent's transcript is never touched.

import type {
  EngineInterface, SessionCompactInput, SessionCompactResult, SessionMeasureInput, TurnCompleteInput
} from 'claude-code';

import {CompactAction, compactAction, joinInstructions, WAKE_TEXT} from '../src/compaction.ts';
import {percentText} from '../src/windows.ts';

import {armCompaction, keep, noteCompaction, noteCompactRefused, state} from './state.ts';

const RETRY_MS = 1000;
const WAKE_MS = 1000;

// The engine's answer, or nothing when it refused the call: a turn runs, or
// the session is headless, where the engine compacts inside a turn only.
async function compactOrRefused(
  $: EngineInterface,
  instructions: string | undefined
): Promise<SessionCompactResult | undefined> {
  try {
    return await $.session.compact(instructions === undefined ? {} : {instructions});
  } catch (error) {
    $.ui.log(`the compaction was refused: ${String(error)}`, {to: 'debug'});
    return undefined;
  }
}

async function wake($: EngineInterface): Promise<void> {
  try {
    await $.prompt.submit({text: WAKE_TEXT});
  } catch (error) {
    $.ui.log(`the model was not woken after the compaction: ${String(error)}`, {to: 'transcript'});
  }
}

export async function attemptCompact($: EngineInterface): Promise<void> {
  const {request, settings} = state;
  if (request === undefined) {
    return;
  }

  const percent = state.context?.percent;
  const result = await compactOrRefused($, joinInstructions(request.instructions ?? '', settings.compactInstructions));
  const at = await $.clock.now();
  if (result === undefined) {
    noteCompactRefused();
    void keep($);
    $.ui.log(state.compactPending ?
      'the requested compaction is tried again after the next main turn' :
      'the request is dropped; the engine compacts on its own at its threshold', {to: 'debug'});
    return;
  }

  noteCompaction({
    at,
    skip: result.skip
  });
  void keep($);
  const fill = percent === undefined ? '' : ` at ${percentText(percent)} of the context window`;
  $.ui.log(result.skip === undefined ?
    `compacted the conversation${fill} at the model's request` :
    `the compaction${fill} the model asked for was skipped: ${result.skip}`, {to: 'transcript'});
  $.clock.after(WAKE_MS, () => {
    void wake($);
  });
}

export function onMeasureForCompaction($: EngineInterface, event: SessionMeasureInput): void {
  state.context = event.context;
  if (compactAction(event.context.percent, state.settings.compactAt, state.compactArmed) !== CompactAction.Rearm) {
    return;
  }

  armCompaction();
  void keep($);
}

export function onTurnComplete($: EngineInterface, event: TurnCompleteInput): void {
  if (event.agentId !== undefined || !state.compactPending) {
    return;
  }

  $.clock.after(RETRY_MS, () => {
    void attemptCompact($);
  });
}

// The engine's own compactions of the main conversation, for the status
// command: the person's /compact and the threshold's. A precompute installs
// nothing, and the plugin's own is recorded from its call.
export async function onSessionCompact($: EngineInterface, event: SessionCompactInput): Promise<void> {
  if (event.agentId === undefined && (event.trigger === 'auto' || event.trigger === 'manual')) {
    state.lastEngineCompact = {
      at: await $.clock.now(),
      trigger: event.trigger
    };
  }
}
