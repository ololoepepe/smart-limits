// The start of a session: the figures the engine already has (empty off a
// subscription and before the first response), the settings in force as one
// line in the debug log for whoever checks where the values came from, and
// a line in the transcript for each setting set aside.

import type {EngineInterface, SessionStartInput} from 'claude-code';

import {reevaluate} from './limits.ts';
import {restore, settingsLine, state} from './state.ts';
import {registerCompactTool} from './tools.ts';

export async function startSession($: EngineInterface, event: SessionStartInput): Promise<void> {
  $.ui.log(`${settingsLine()}; ${event.isInteractive ? 'interactive' : 'headless'} on ${
    event.surface ?? 'no surface'}`, {to: 'debug'});
  for (const note of state.settings.notes) {
    $.ui.log(note, {to: 'transcript'});
  }

  await registerCompactTool($);
  await restore($);
  await reevaluate($);
}
