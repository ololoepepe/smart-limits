import {describe, expect, test} from 'claude-code/testing';

import {localClock, localTime, parseIso, waitText} from './time.ts';

// Local times are built with the local constructor, so the checks hold in
// any time zone.
const at = (hours: number, minutes: number, dayOffset = 0): number => (
  new Date(2026, 9, 22 + dayOffset, hours, minutes).getTime()
);

describe('times for a person', () => {
  test('an ISO stamp parses, and a broken one is nothing', () => {
    expect(parseIso('2026-10-22T15:40:00Z')).toBe(Date.UTC(2026, 9, 22, 15, 40));
    expect(parseIso('soon')).toBe(undefined);
    expect(parseIso(undefined)).toBe(undefined);
  });

  test('a moment within a day is a clock reading, a later one carries the weekday', () => {
    expect(localClock(at(18, 40))).toBe('18:40');
    expect(localClock(at(9, 5))).toBe('09:05');
    expect(localTime(at(18, 40), at(12, 0))).toBe('18:40');
    // 2026-10-24 is a Saturday.
    expect(localTime(at(18, 40, 2), at(12, 0))).toBe('Sat 18:40');
  });

  test('the wait reads in the largest units that fit', () => {
    const now = at(12, 0);
    expect(waitText(now + 30_000, now)).toBe('now');
    expect(waitText(now + (5 * 60_000), now)).toBe('in 5 min');
    expect(waitText(now + (72 * 60_000), now)).toBe('in 1 h 12 min');
    expect(waitText(now + (51 * 3_600_000), now)).toBe('in 2 d 3 h');
  });
});
