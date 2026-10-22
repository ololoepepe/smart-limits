import {describe, expect, test} from 'claude-code/testing';

import {DEFAULT_SETTINGS} from './options.ts';
import {
  clearedText, crossingsOf, denyText, entered, liveWindows, nextResetAt, peakWindow, softText, statusLine, windowByKey,
  windowsAbove
} from './windows.ts';

const now = new Date(2026, 9, 22, 17, 28).getTime();
const resetIn = (minutes: number): string => new Date(now + (minutes * 60_000)).toISOString();
const fiveHour = {
  kind: 'five_hour',
  percentUsed: 63,
  resetsAt: resetIn(72)
};
// A far reset is built with the local constructor: a sum of milliseconds
// crosses a change of the clocks in some time zones.
const sevenDay = {
  kind: 'seven_day',
  percentUsed: 41.5,
  resetsAt: new Date(2026, 9, 25, 17, 28).toISOString()
};

describe('the subscription windows', () => {
  test('a window whose reset has passed is no longer live', () => {
    const over = {
      kind: 'five_hour',
      percentUsed: 95,
      resetsAt: resetIn(-1)
    };
    expect(liveWindows([over, sevenDay], now)).toEqual([sevenDay]);
    expect(liveWindows([{
      kind: 'spend_limit',
      percentUsed: 12
    }], now)).toEqual([{
      kind: 'spend_limit',
      percentUsed: 12
    }]);
  });

  test('the peak is the largest share, and the thresholds pick by share', () => {
    expect(peakWindow([fiveHour, sevenDay])).toBe(fiveHour);
    expect(peakWindow([])).toBe(undefined);
    expect(windowsAbove([fiveHour, sevenDay], 50)).toEqual([fiveHour]);
    expect(windowsAbove([fiveHour, sevenDay], 0)).toEqual([]);
    expect(crossingsOf([fiveHour, sevenDay], {
      ...DEFAULT_SETTINGS,
      limitHard: 60,
      limitSoft: 40
    })).toEqual({
      hard: [`five_hour@${fiveHour.resetsAt}`],
      soft: [`five_hour@${fiveHour.resetsAt}`, `seven_day@${sevenDay.resetsAt}`]
    });
  });

  test('a crossing is announced once, and again after the window resets', () => {
    const key = `five_hour@${fiveHour.resetsAt}`;
    expect(entered([], [key])).toEqual([key]);
    expect(entered([key], [key])).toEqual([]);
    const later = `five_hour@${resetIn(372)}`;
    expect(entered([key], [later])).toEqual([later]);
    expect(windowByKey([fiveHour, sevenDay], key)).toBe(fiveHour);
  });

  test('the status line names every window and the nearest reset', () => {
    expect(statusLine([fiveHour, sevenDay], now)).toBe('5h 63% · 7d 41.5% · reset 18:40');
    expect(statusLine([{
      kind: 'spend_limit',
      percentUsed: 104
    }], now)).toBe('spend 104%');
    expect(statusLine([], now)).toBe(undefined);
    expect(nextResetAt([sevenDay, fiveHour], now)).toBe(Date.parse(fiveHour.resetsAt));
    expect(nextResetAt([{
      kind: 'spend_limit',
      percentUsed: 1
    }], now)).toBe(undefined);
  });

  test('the warning and the refusal name the window, the share, the limit and the reset', () => {
    expect(softText({...fiveHour, percentUsed: 83}, 80, now)).toBe(
      'the 5-hour window is at 83%, past the soft limit of 80%, resets 18:40 (in 1 h 12 min). Start nothing new.'
    );
    expect(softText({
      kind: 'spend_limit',
      percentUsed: 83
    }, 80, now)).toBe(
      'the spend limit is at 83%, past the soft limit of 80%. Start nothing new.'
    );
    const refusal = denyText({...fiveHour, percentUsed: 92.5}, 90, now);
    expect(refusal.startsWith('the 5-hour window is at 92.5%, past the hard limit of 90%; it resets at 18:40 ' +
      '(in 1 h 12 min). Bash, Write, Edit, NotebookEdit and new agents are refused until then.')).toBe(true);
    expect(refusal.endsWith('report what is done, what is half-done and what remains.')).toBe(true);
    expect(denyText({
      kind: 'spend_limit',
      percentUsed: 101
    }, 90, now)).toContain('the spend limit is at 101%');
    expect(denyText({
      kind: 'spend_limit',
      percentUsed: 101
    }, 90, now)).toContain('no reset time is known');
  });

  test('the line when the hard limit clears names the windows and how they left it', () => {
    const key = `five_hour@${fiveHour.resetsAt}`;
    expect(clearedText([key], [sevenDay])).toBe(
      'the hard limit is clear: the 5-hour window reset; Bash, Write, Edit, NotebookEdit and new agents pass again'
    );
    expect(clearedText([key, `seven_day@${sevenDay.resetsAt}`], [fiveHour, sevenDay])).toBe(
      'the hard limit is clear: the 5-hour window is below the limit, the 7-day window is below the limit; Bash, ' +
      'Write, Edit, NotebookEdit and new agents pass again'
    );
  });
});
