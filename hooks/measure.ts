// The one session.measure hook of the module: the windows first, the
// context after, each part on its own so that one that fails leaves the
// other running. The hook observes; its answer changes nothing.

import type {EngineInterface, On} from 'claude-code';

import {onMeasureForCompaction} from './compaction.ts';
import {applyWindows} from './limits.ts';

async function part($: EngineInterface, name: string, run: () => Promise<void> | void): Promise<void> {
  try {
    await run();
  } catch (error) {
    $.ui.log(`the ${name} part of session.measure failed: ${String(error)}`, {to: 'debug'});
  }
}

export function registerMeasureHook(on: On): void {
  on('session.measure', async ($, event, next) => {
    const now = await $.clock.now();
    $.ui.log(`measured: context ${event.context.percent === undefined ? 'unknown' : `${event.context.percent}%`} (${
      event.context.tokens ?? '?'} of ${event.context.window}), windows ${
      event.rateLimits.map(window => `${window.kind} ${window.percentUsed}%`).join(', ') || 'none'}; changed: ${
      event.changed.join(', ')}`, {to: 'debug'});
    await part($, 'windows', () => {
      applyWindows($, event.rateLimits, now);
    });
    await part($, 'context', () => {
      onMeasureForCompaction($, event);
    });
    return await next(event);
  });
}
