import {describe, expect, test} from 'claude-code/testing';

import {
  mergeOptions, optionsIn, overridesSuffix, parseCommand, parsePercent, parseSettings, ProjectFile
} from './options.ts';

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
      notes: [],
      overrides: []
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
      notes: [],
      overrides: []
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

describe('the settings of a project', () => {
  test('the plugin\'s block in a settings file is found under any marketplace, and nothing else is', () => {
    expect(optionsIn({
      'other@smart-limits': {
        options: {atHard: 'no'}
      },
      'smart-limits': {
        options: {compactAt: 1}
      },
      'smart-limits@smart-limits': {
        options: {atHard: 'pause'}
      },
      'smart-limits-fork@x': {
        options: {atHard: 'no'}
      }
    }, 'smart-limits')).toEqual({
      atHard: 'pause',
      compactAt: 1
    });
    expect(optionsIn(undefined, 'smart-limits')).toEqual({});
    expect(optionsIn({
      'smart-limits@x': {options: 'pause'}
    }, 'smart-limits')).toEqual({});
  });

  test('each field takes the last source that sets it, and a field from the project names its file', () => {
    const merged = mergeOptions([{
      file: undefined,
      options: {
        atHard: 'pause',
        atReset: 'resume',
        limitHard: 90
      }
    }, {
      file: ProjectFile.Shared,
      options: {
        atHard: 'pause from project',
        atReset: '',
        limitHard: 70
      }
    }, {
      file: ProjectFile.Local,
      options: {
        atHard: 'pause from local',
        limitHard: null,
        unknown: 1
      }
    }]);
    expect(merged.options).toEqual({
      atHard: 'pause from local',
      atReset: '',
      limitHard: 70
    });
    expect(merged.overrides).toEqual([{
      field: 'limitHard',
      file: ProjectFile.Shared
    }, {
      field: 'atHard',
      file: ProjectFile.Local
    }, {
      field: 'atReset',
      file: ProjectFile.Shared
    }]);
    // An empty text clears the user's command for the project.
    expect(parseSettings(merged.options, 'smart-limits:').atReset).toBe(undefined);
    expect(overridesSuffix(merged.overrides)).toBe(
      '; atHard from .claude/settings.local.json; limitHard, atReset from .claude/settings.json'
    );
    expect(overridesSuffix([])).toBe('');
  });
});
