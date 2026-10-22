import {describe, expect, test} from 'claude-code/testing';

import {parseCommand, parsePercent, parseSettings} from './options.ts';

describe('the settings', () => {
  test('a threshold is a percent, and anything else turns the mechanism off', () => {
    expect(parsePercent(70)).toBe(70);
    expect(parsePercent('55')).toBe(55);
    expect(parsePercent(0)).toBe(0);
    expect(parsePercent(-5)).toBe(0);
    expect(parsePercent(250)).toBe(100);
    expect(parsePercent('seventy')).toBe(0);
    expect(parsePercent(undefined)).toBe(0);
  });

  test('a command is a name and its arguments', () => {
    expect(parseCommand('pause')).toEqual({
      args: '',
      command: 'pause'
    });
    expect(parseCommand('/pause  now please ')).toEqual({
      args: 'now please',
      command: 'pause'
    });
    expect(parseCommand('')).toBe(undefined);
    expect(parseCommand(' '.repeat(3))).toBe(undefined);
    expect(parseCommand(7)).toBe(undefined);
  });

  test('the manifest defaults stand where a value is missing', () => {
    expect(parseSettings({}, 'smart-limits:')).toEqual({
      atHard: undefined,
      atReset: undefined,
      compactAt: 70,
      compactInstructions: undefined,
      limitHard: 90,
      limitSoft: 80,
      notes: []
    });
    expect(parseSettings({
      atHard: 'pause',
      atReset: 'resume',
      compactAt: 1,
      compactInstructions: ' keep the plan ',
      limitHard: 2,
      limitSoft: 0
    }, 'smart-limits:')).toEqual({
      atHard: {
        args: '',
        command: 'pause'
      },
      atReset: {
        args: '',
        command: 'resume'
      },
      compactAt: 1,
      compactInstructions: 'keep the plan',
      limitHard: 2,
      limitSoft: 0,
      notes: []
    });
  });

  test('the plugin\'s own command in either field is set aside with a note', () => {
    const settings = parseSettings({
      atHard: 'smart-limits:status',
      atReset: 'smart-limits:status'
    }, 'smart-limits:');
    expect(settings.atHard).toBe(undefined);
    expect(settings.atReset).toBe(undefined);
    expect(settings.notes).toEqual([
      'the command at the hard limit (atHard), /smart-limits:status, is the plugin\'s own: the engine does not ' +
      'route it back to the plugin, so nothing runs at the hard limit; name another command or leave the field empty',
      'the command after the hard limit clears (atReset), /smart-limits:status, is the plugin\'s own: the engine ' +
      'does not route it back to the plugin, so nothing runs after the hard limit clears; name another command or ' +
      'leave the field empty'
    ]);
  });
});
