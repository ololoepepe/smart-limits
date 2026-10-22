// The entry point of the hooks module: the engine loads this file, and the
// files beside it hold the handlers, each reaching the engine through the
// `$` it is handed. The logic they feed lives in src/ as plain functions
// with tests. The settings arrive as `options`; a change to them reloads
// the module.

import type {Register} from 'claude-code';

import {registerCommands} from './commands.ts';
import {onSessionCompact, onTurnComplete} from './compaction.ts';
import {registerLimitGuards} from './limits.ts';
import {registerMeasureHook} from './measure.ts';
import {startSession} from './start.ts';
import {configure} from './state.ts';
import {registerToolHooks} from './tools.ts';

export const register: Register = (on, options) => {
  configure(options);

  on('session.start', async ($, event, next) => {
    await startSession($, event);
    return await next(event);
  });

  on('turn.complete', async ($, event, next) => {
    onTurnComplete($, event);
    return await next(event);
  });

  on('session.compact', async ($, event, next) => {
    await onSessionCompact($, event);
    return await next(event);
  }).catch(async (error, event, next) => await next(event));

  registerMeasureHook(on);
  registerLimitGuards(on);
  registerToolHooks(on);
  registerCommands(on);
};
