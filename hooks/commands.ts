// /smart-limits:status, answered in code; the markdown body in commands/
// runs only when the module is not loaded.

import type {EngineInterface, On} from 'claude-code';

import {statusText} from '../src/status.ts';
import {liveWindows} from '../src/windows.ts';

import {reevaluate} from './limits.ts';
import {isReminding, state} from './state.ts';

async function status($: EngineInterface): Promise<string> {
  await reevaluate($);
  const now = await $.clock.now();
  return statusText({
    now,
    compactPending: state.compactPending,
    context: state.context,
    hard: state.hard,
    isReminding: isReminding(),
    lastCompact: state.lastCompact,
    lastEngineCompact: state.lastEngineCompact,
    request: state.request,
    settings: state.settings,
    soft: state.soft,
    windows: liveWindows(state.windows, now)
  });
}

export function registerCommands(on: On): void {
  on('command.run', {command: 'smart-limits:status'}, async $ => ({text: await status($)}))
    .catch(async (error, event, next) => (next.called ?
      await next(event) :
      {text: `the status command failed (${next.error.kind}); see the debug log`}));
}
