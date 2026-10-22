// The subscription windows as the plugin handles them, the session state
// across a reload, the thresholds switched off, and the status command.

import type {SessionRateLimit} from 'claude-code';

import {expect, mock, test} from 'claude-code/testing';

import {
  compactCall, denialOf, mainTurn, NOW, OPTIONS, reading, resetIn, runInput, spawnDenial, standForTheEngine, start,
  SUNDAY
} from './stand.ts';

test('the windows: the status line, one warning per crossing, the refusals and their lifting', {
  options: OPTIONS
}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const readings: SessionRateLimit[][] = [];
  const seen = standForTheEngine(on, () => readings.at(-1) ?? []);
  await start($);
  expect(seen.statuses).toEqual([undefined]);

  const fiveHour = {
    kind: 'five_hour',
    percentUsed: 63,
    resetsAt: resetIn(72)
  };
  const sevenDay = {
    kind: 'seven_day',
    percentUsed: 41,
    resetsAt: SUNDAY
  };
  readings.push([fiveHour, sevenDay]);
  await $.session.measure(reading(10, readings.at(-1) ?? []));
  expect(seen.statuses.at(-1)).toBe('5h 63% · 7d 41% · reset 18:40');
  expect(seen.toasts).toEqual([
    'the 5-hour window is at 63%, past the soft limit of 60%, resets 18:40 (in 1 h 12 min). Start nothing new.'
  ]);
  // The same window again, a point higher: no second warning.
  readings.push([{...fiveHour, percentUsed: 64}, sevenDay]);
  await $.session.measure(reading(10, readings.at(-1) ?? []));
  expect(seen.toasts.length).toBe(1);
  expect(await denialOf($, {
    command: 'ls',
    tool: 'Bash'
  })).toBe(undefined);

  // The hard limit: the command a second later, the tools refused in every loop.
  readings.push([{...fiveHour, percentUsed: 85}, sevenDay]);
  await $.session.measure(reading(10, readings.at(-1) ?? []));
  expect(seen.commands).toEqual([]);
  await clock.advance(1000);
  expect(seen.commands).toEqual(['pause now']);
  const line = 'the 5-hour window is at 85%, past the hard limit of 80%; it resets at 18:40 (in 1 h 12 min). ' +
    'Bash, Write, Edit, NotebookEdit and new agents are refused until then. Stop now: do not present unfinished ' +
    'work as finished; report what is done, what is half-done and what remains.';
  // The transcript line goes without the plugin's name, the model's refusal with it.
  expect(seen.transcript).toEqual([line]);
  const refusal = `smart-limits: ${line}`;
  expect(await denialOf($, {
    command: 'ls',
    tool: 'Bash'
  })).toBe(refusal);
  expect(await denialOf($, {
    agentId: 'a1',
    content: 'x',
    file_path: '/x',
    tool: 'Write'
  })).toBe(refusal);
  expect(await denialOf($, {
    file_path: '/x',
    tool: 'Read'
  })).toBe(undefined);
  expect(await spawnDenial($)).toBe(refusal);
  // Still crossed: the command does not run again.
  readings.push([{...fiveHour, percentUsed: 86}, sevenDay]);
  await $.session.measure(reading(10, readings.at(-1) ?? []));
  await clock.advance(1000);
  expect(seen.commands).toEqual(['pause now']);

  // The reset passes while the session is idle: the stale reading is over,
  // the refusals lift, the line shows what is still live.
  await clock.advance((72 * 60_000) + 2000);
  expect(seen.statuses.at(-1)).toBe('7d 41% · reset Sun 17:28');
  expect(await denialOf($, {
    command: 'ls',
    tool: 'Bash'
  })).toBe(undefined);
  expect(await spawnDenial($)).toBe(undefined);
  // The hard limit is clear: the line, and a second after the reset the command that goes on.
  expect(seen.transcript.at(-1)).toBe(
    'the hard limit is clear: the 5-hour window reset; Bash, Write, Edit, NotebookEdit and new agents pass again'
  );
  expect(seen.commands).toEqual(['pause now', 'resume']);

  // A new 5-hour window past the limit again: a new crossing, the command again.
  readings.push([{
    kind: 'five_hour',
    percentUsed: 90,
    resetsAt: resetIn(72 + 300)
  }, sevenDay]);
  await $.session.measure(reading(10, readings.at(-1) ?? []));
  await clock.advance(1000);
  expect(seen.commands).toEqual(['pause now', 'resume', 'pause now']);
  expect(seen.toasts.length).toBe(2);
});

test('the windows: a share falling below the hard limit lifts the refusals', {options: OPTIONS}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const readings: SessionRateLimit[][] = [[{
    kind: 'five_hour',
    percentUsed: 81,
    resetsAt: resetIn(72)
  }]];
  const seen = standForTheEngine(on, () => readings.at(-1) ?? []);
  await start($);
  expect(await denialOf($, {
    command: 'ls',
    tool: 'Bash'
  })).toContain('past the hard limit');
  await clock.advance(1000);
  readings.push([{
    kind: 'five_hour',
    percentUsed: 79,
    resetsAt: resetIn(72)
  }]);
  await $.session.measure(reading(10, readings.at(-1) ?? []));
  expect(await denialOf($, {
    command: 'ls',
    tool: 'Bash'
  })).toBe(undefined);
  expect(seen.transcript.at(-1)).toBe(
    'the hard limit is clear: the 5-hour window is below the limit; Bash, Write, Edit, NotebookEdit and new agents ' +
    'pass again'
  );
  await clock.advance(1000);
  expect(seen.commands).toEqual(['pause now', 'resume']);
});

test('the plugin\'s own command at the hard limit runs nothing and says so at the start', {
  options: {...OPTIONS, atHard: 'smart-limits:status'}
}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const seen = standForTheEngine(on, () => []);
  await start($);
  expect(seen.transcript[0]).toContain('(atHard), /smart-limits:status, is the plugin\'s own');
  await $.session.measure(reading(10, [{
    kind: 'five_hour',
    percentUsed: 85,
    resetsAt: resetIn(72)
  }]));
  await clock.advance(1000);
  expect(seen.commands).toEqual([]);
});

test('the crossings and the request are kept in the session state', {options: OPTIONS}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const kept: Record<string, unknown> = {};
  on('state.set', (_, event) => {
    kept[event.key] = event.value;
    return {
      value: {
        isSet: true,
        version: 1
      }
    };
  });
  const resetsAt = resetIn(72);
  const windows = [{
    resetsAt,
    kind: 'five_hour',
    percentUsed: 85
  }];
  standForTheEngine(on, () => windows);
  await start($);
  await clock.advance(1000);
  expect(kept.crossings).toEqual({
    hard: [`five_hour@${resetsAt}`],
    soft: [`five_hour@${resetsAt}`]
  });
  await $.session.measure(reading(55, windows));
  await $.tool.call(compactCall('the plan'));
  await clock.settle();
  expect(kept.compaction).toEqual({
    isArmed: true,
    lastCompactAt: null,
    lastCompactSkip: null,
    requestedAt: NOW + 1000,
    requestedInstructions: 'the plan'
  });
  await $.turn.complete(mainTurn('t1'));
  await clock.advance(1000);
  expect(kept.compaction).toEqual({
    isArmed: false,
    lastCompactAt: NOW + 2000,
    lastCompactSkip: null,
    requestedAt: null,
    requestedInstructions: null
  });
});

test('after a reload what was announced is not done again, and the request stands', {
  options: OPTIONS
}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const resetsAt = resetIn(72);
  const key = `five_hour@${resetsAt}`;
  // The engine's state as the module left it before the reload.
  on('state.get', (_, event) => ({
    value: {
      value: event.key === 'crossings' ?
        {
          hard: [key],
          soft: [key]
        } :
        {
          isArmed: true,
          lastCompactAt: null,
          lastCompactSkip: null,
          requestedAt: NOW - 30_000,
          requestedInstructions: 'go on with step 3'
        },
      version: 1
    }
  }));
  const seen = standForTheEngine(on, () => [{
    resetsAt,
    kind: 'five_hour',
    percentUsed: 85
  }]);
  await start($);
  await clock.advance(1000);
  expect(seen.toasts).toEqual([]);
  expect(seen.commands).toEqual([]);
  expect(seen.transcript).toEqual([]);
  expect(await denialOf($, {
    command: 'ls',
    tool: 'Bash'
  })).toContain('past the hard limit of 80%');
  const {text} = await $.command.run(runInput);
  expect(text).toContain('compaction: requested by the model at 17:27, waits for the end of the turn');
  await $.turn.complete(mainTurn('t1'));
  await clock.advance(1000);
  expect(seen.compactions).toEqual([{instructions: 'go on with step 3'}]);
});

test('zero thresholds switch the mechanisms off', {
  options: {
    atHard: '',
    compactAt: 0,
    limitHard: 0,
    limitSoft: 0
  }
}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const windows = [{
    kind: 'five_hour',
    percentUsed: 99,
    resetsAt: resetIn(10)
  }];
  const seen = standForTheEngine(on, () => windows);
  await start($);
  await $.session.measure(reading(99, windows));
  await clock.advance(1000);
  const called = await $.tool.call({
    command: 'ls',
    tool: 'Bash'
  });
  expect(called.deny).toBe(undefined);
  expect(called.context).toBe(undefined);
  expect(seen.toasts).toEqual([]);
  expect(seen.commands).toEqual([]);
  expect(seen.statuses.at(-1)).toBe('5h 99% · reset 17:38');
});

test('the status command reads the engine and reports', {options: OPTIONS}, async ($, on) => {
  mock.clock(on, {now: NOW});
  standForTheEngine(on, () => [{
    kind: 'five_hour',
    percentUsed: 63,
    resetsAt: resetIn(72)
  }]);
  await start($);
  await $.session.measure(reading(55, []));
  const {text} = await $.command.run(runInput);
  expect(text).toBe([
    'windows: 5h 63% (resets 18:40, in 1 h 12 min)',
    'context: 55% of 200000 tokens (110000)',
    'thresholds: compact at 50%, soft 60%, hard 80%, at hard: /pause now, at reset: /resume',
    'in force: soft limit crossed by 5h: warned, nothing refused',
    'compaction: the model is reminded: the window is past 50%; none at the model\'s request yet'
  ].join('\n'));
});
