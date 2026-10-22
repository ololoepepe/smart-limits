import {describe, expect, test} from 'claude-code/testing';

import {DEFAULT_SETTINGS} from './options.ts';
import {statusText} from './status.ts';

const now = new Date(2026, 9, 22, 17, 28).getTime();
const resetIn = (minutes: number): string => new Date(now + (minutes * 60_000)).toISOString();

describe('the status command', () => {
  test('with nothing read yet it says so', () => {
    expect(statusText({
      now,
      compactPending: false,
      context: undefined,
      hard: [],
      isReminding: false,
      lastCompact: undefined,
      lastEngineCompact: undefined,
      request: undefined,
      settings: {...DEFAULT_SETTINGS, limitHard: 0},
      soft: [],
      windows: []
    })).toBe([
      'windows: no reading yet (none off a subscription, or before the first response)',
      'context: no reading (none before the first response, or right after a compaction)',
      'thresholds: compact at 70%, soft 80%, hard off, at hard: none, at reset: none',
      'in force: nothing crossed, nothing refused',
      'compaction: none at the model\'s request yet'
    ].join('\n'));
  });

  test('with the hard limit crossed it names the window, the refusal and the compactions', () => {
    const resetsAt = resetIn(72);
    expect(statusText({
      now,
      compactPending: true,
      context: {
        percent: 54,
        tokens: 108_000,
        window: 200_000
      },
      hard: [`five_hour@${resetsAt}`],
      isReminding: false,
      lastCompact: {
        at: now - (26 * 60_000),
        skip: undefined
      },
      lastEngineCompact: {
        at: now - (50 * 60_000),
        trigger: 'auto'
      },
      request: {
        at: now - (2 * 60_000),
        instructions: 'the plan'
      },
      settings: {
        ...DEFAULT_SETTINGS,
        atHard: {
          args: 'now',
          command: 'pause'
        }
      },
      soft: [`five_hour@${resetsAt}`],
      windows: [{
        resetsAt,
        kind: 'five_hour',
        percentUsed: 92
      }, {
        kind: 'seven_day',
        percentUsed: 41
      }]
    })).toBe([
      'windows: 5h 92% (resets 18:40, in 1 h 12 min) · 7d 41%',
      'context: 54% of 200000 tokens (108000)',
      'thresholds: compact at 70%, soft 80%, hard 90%, at hard: /pause now, at reset: none',
      'in force: hard limit crossed by 5h: Bash, Write, Edit, NotebookEdit and new agents are refused',
      'compaction: requested by the model at 17:26, waits for the end of the turn; last at the model\'s request at ' +
      '17:02; refused during a turn, retried after it; last by the engine (auto) at 16:38'
    ].join('\n'));
  });

  test('a skipped compaction and a soft crossing read as such', () => {
    const text = statusText({
      now,
      compactPending: false,
      context: {window: 200_000},
      hard: [],
      isReminding: true,
      lastCompact: {
        at: now,
        skip: 'nothing to compact'
      },
      lastEngineCompact: undefined,
      request: undefined,
      settings: DEFAULT_SETTINGS,
      soft: ['seven_day@'],
      windows: [{
        kind: 'seven_day',
        percentUsed: 81
      }]
    });
    expect(text).toContain('in force: soft limit crossed by 7d: warned, nothing refused');
    expect(text).toContain(
      'compaction: the model is reminded: the window is past 70%; last asked at 17:28, skipped: nothing to compact'
    );
  });
});
