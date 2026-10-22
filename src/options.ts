// The plugin's settings as the manifest's userConfig fields arrive in
// `register(on, options)`: three thresholds in percent, the compaction
// instructions, and the commands run at the hard limit and after it clears.
// A threshold of 0 turns its mechanism off, and so does a value that is not
// a number.

import type {PluginOptions} from 'claude-code';

export type Command = {
  args: string;
  command: string;
};

export type Settings = {
  atHard: Command | undefined;
  atReset: Command | undefined;
  compactAt: number;
  compactInstructions: string | undefined;
  limitHard: number;
  limitSoft: number;
  // What was set aside and why, for the person: one line each.
  notes: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  atHard: undefined,
  atReset: undefined,
  compactAt: 70,
  compactInstructions: undefined,
  limitHard: 90,
  limitSoft: 80,
  notes: []
};

// A percentage from 0 to 100. Anything that is not a positive number is 0,
// which switches the mechanism off; more than 100 is held to 100.
export function parsePercent(value: unknown): number {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number !== 'number' || !Number.isFinite(number) || number <= 0 ? 0 : Math.min(100, number);
}

// `name args` without the slash, as the person would type it after the
// slash; a leading slash is forgiven. Empty means no command.
export function parseCommand(value: unknown): Command | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.trim().replace(/^\//u, '');
  if (text === '') {
    return undefined;
  }

  const space = text.search(/\s/u);
  return space === -1 ?
    {
      args: '',
      command: text
    } :
    {
      args: text.slice(space).trim(),
      command: text.slice(0, space)
    };
}

function parseText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? undefined : text;
}

type ParsedCommand = {
  command: Command | undefined;
  note: string | undefined;
};

// `ownPrefix` is the plugin's own command namespace (`smart-limits:`): the
// engine does not route a plugin's command run back to the plugin's own
// hooks, so such a command runs its markdown body instead, which tells the
// model the module is not loaded. It is set aside with a note.
function parseOwnOrOther(value: unknown, field: string, when: string, ownPrefix: string): ParsedCommand {
  const command = parseCommand(value);
  if (command === undefined || !command.command.startsWith(ownPrefix)) {
    return {
      command,
      note: undefined
    };
  }

  return {
    command: undefined,
    note: `the command ${when} (${field}), /${command.command}, is the plugin's own: the engine does not route it ` +
      `back to the plugin, so nothing runs ${when}; name another command or leave the field empty`
  };
}

export function parseSettings(options: PluginOptions, ownPrefix: string): Settings {
  const atHard = parseOwnOrOther(options.atHard, 'atHard', 'at the hard limit', ownPrefix);
  const atReset = parseOwnOrOther(options.atReset, 'atReset', 'after the hard limit clears', ownPrefix);
  return {
    atHard: atHard.command,
    atReset: atReset.command,
    compactAt: parsePercent(options.compactAt ?? DEFAULT_SETTINGS.compactAt),
    compactInstructions: parseText(options.compactInstructions),
    limitHard: parsePercent(options.limitHard ?? DEFAULT_SETTINGS.limitHard),
    limitSoft: parsePercent(options.limitSoft ?? DEFAULT_SETTINGS.limitSoft),
    notes: [atHard.note, atReset.note].filter((note): note is string => note !== undefined)
  };
}
