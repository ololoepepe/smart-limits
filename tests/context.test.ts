// The context window as the plugin handles it: the reminder on tool results,
// the model's request, the compaction after the turn and the wake.

import {expect, mock, test} from 'claude-code/testing';

import {
  compactCall, denialOf, mainTurn, NOW, OPTIONS, reading, runInput, standForTheEngine, start, WAKE
} from './stand.ts';

test('the context: the reminder rides on tool results past the threshold, in the main loop only', {
  options: OPTIONS
}, async ($, on) => {
  mock.clock(on, {now: NOW});
  const seen = standForTheEngine(on, () => []);
  await start($);
  expect(seen.tools).toEqual(['compact']);

  await $.session.measure(reading(40, []));
  const quiet = await $.tool.call({
    command: 'ls',
    tool: 'Bash'
  });
  expect(quiet.context).toBe(undefined);

  await $.session.measure(reading(55, []));
  const reminded = await $.tool.call({
    command: 'ls',
    tool: 'Bash'
  });
  expect(reminded.context?.[0]).toContain('the context window is 55% full, past the 50% at which');
  expect(reminded.context?.[0]).toContain('call the smart-limits compact tool');
  const read = await $.tool.call({
    file_path: '/x',
    tool: 'Read'
  });
  expect(read.context?.length).toBe(1);
  const inSubagent = await $.tool.call({
    agentId: 'a1',
    command: 'ls',
    tool: 'Bash'
  });
  expect(inSubagent.context).toBe(undefined);

  const {text} = await $.command.run(runInput);
  expect(text).toContain('compaction: the model is reminded: the window is past 50%; none at the model\'s request yet');
  // Without a reading the status line is empty.
  expect(seen.statuses.every(status => status === undefined)).toBe(true);
});

test('the context: the model asks, the compaction follows the end of the turn, a prompt wakes the model', {
  options: {...OPTIONS, compactInstructions: 'keep the plan'}
}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const seen = standForTheEngine(on, () => []);
  await start($);
  await $.session.measure(reading(55, []));

  const asked = await $.tool.call(compactCall('the plan is in plan.md'));
  expect(asked.deny).toBe(undefined);
  expect(String(asked.result)).toContain('noted at 55%: the conversation is compacted as soon as this turn ends');
  expect(seen.compactions).toEqual([]);
  // The request stands: no reminder rides along any more.
  const afterAsking = await $.tool.call({
    command: 'ls',
    tool: 'Bash'
  });
  expect(afterAsking.context).toBe(undefined);
  const {text} = await $.command.run(runInput);
  expect(text).toContain('compaction: requested by the model at 17:28, waits for the end of the turn');

  // A subagent's turn ends: nothing. The main turn ends: the compaction a second later.
  await $.turn.complete({
    ...mainTurn('t1'),
    agentId: 'a1'
  });
  await clock.advance(1000);
  expect(seen.compactions).toEqual([]);
  await $.turn.complete(mainTurn('t2'));
  await clock.advance(1000);
  expect(seen.compactions).toEqual([{instructions: 'the plan is in plan.md\n\nkeep the plan'}]);
  expect(seen.transcript.at(-1)).toBe(
    'compacted the conversation at 55% of the context window at the model\'s request'
  );
  expect(seen.prompts).toEqual([]);
  await clock.advance(1000);
  expect(seen.prompts).toEqual([WAKE]);

  // Still past the threshold after the compaction: no reminder until a reading below.
  await $.session.measure(reading(58, []));
  const quiet = await $.tool.call({
    command: 'ls',
    tool: 'Bash'
  });
  expect(quiet.context).toBe(undefined);
  await $.session.measure(reading(30, []));
  await $.session.measure(reading(51, []));
  const reminded = await $.tool.call({
    command: 'ls',
    tool: 'Bash'
  });
  expect(reminded.context?.length).toBe(1);
});

test('the context: the compact tool refuses a subagent', {options: OPTIONS}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const seen = standForTheEngine(on, () => []);
  await start($);
  await $.session.measure(reading(55, []));
  expect(await denialOf($, compactCall('the plan', 'a1'))).toContain('a subagent\'s transcript is not compacted');
  await $.turn.complete(mainTurn('t1'));
  await clock.advance(1000);
  expect(seen.compactions).toEqual([]);
});

test('the context: a request refused four times is dropped', {options: OPTIONS}, async ($, on) => {
  const clock = mock.clock(on, {now: NOW});
  const seen = standForTheEngine(on, () => [], () => true);
  await start($);
  await $.session.measure(reading(70, []));
  await $.tool.call(compactCall('the plan'));
  for (const turnId of ['t1', 't2', 't3', 't4', 't5']) {
    await $.turn.complete(mainTurn(turnId));
    await clock.advance(1000);
  }

  expect(seen.compactCalls).toBe(4);
  expect(seen.prompts).toEqual([]);
  const {text} = await $.command.run(runInput);
  expect(text).toContain('compaction: the model is reminded: the window is past 50%; none at the model\'s request yet');
});
