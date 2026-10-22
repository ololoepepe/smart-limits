// What the plugin tests share: the readings a test raises, the calls it
// makes, and the hooks that stand for the engine beneath the plugin.

import type {
  AgentLoop, On, SessionContextUsage, SessionMeasureInput, SessionRateLimit, ToolCallArgs, TurnCompleteInput
} from 'claude-code';
import type {Engine} from 'claude-code/testing';

export const NOW = new Date(2026, 9, 22, 17, 28).getTime();
export const OPTIONS = {
  atHard: 'pause now',
  atReset: 'resume',
  compactAt: 50,
  limitHard: 80,
  limitSoft: 60
};
export const SUMMARY = {
  role: 'assistant' as const,
  text: 'the summary',
  toolUses: []
};
export const COMPACT_TOOL = 'mcp__smart-limits__compact';
export const WAKE = 'The conversation was compacted at your request. Continue the work from the summary.';

export const resetIn = (minutes: number): string => new Date(NOW + (minutes * 60_000)).toISOString();
// A far reset is built with the local constructor: a sum of milliseconds
// crosses a change of the clocks in some time zones.
export const SUNDAY = new Date(2026, 9, 25, 17, 28).toISOString();

export const spawnInput = {
  background: false,
  description: 'a task',
  fork: false,
  parentModel: 'haiku',
  prompt: 'go',
  provider: {
    plugin: 'engine',
    tier: 'core'
  },
  subagentType: 'general-purpose',
  tool_use_id: 'tu1'
} as const;

export const runInput = {
  args: '',
  command: 'smart-limits:status',
  origin: {kind: 'composer'},
  presentation: {
    columns: 80,
    isFullscreen: false
  }
} as const;

export const reading = (percent: number | undefined, rateLimits: SessionRateLimit[]): SessionMeasureInput => ({
  rateLimits,
  changed: ['context', 'rateLimits'],
  context: percent === undefined ? {window: 200_000} : {
    percent,
    tokens: percent * 2000,
    window: 200_000
  }
});

export const mainTurn = (turnId: string): TurnCompleteInput => ({
  turnId,
  answer: 'done',
  durationMs: 1,
  isAborted: false,
  reason: 'answer'
});

export async function denialOf($: Engine, input: AgentLoop & ToolCallArgs): Promise<string | undefined> {
  const called = await $.tool.call(input);
  return called.deny;
}

export async function spawnDenial($: Engine): Promise<string | undefined> {
  const spawned = await $.agent.spawn(spawnInput);
  return spawned.deny;
}

// The plugin's own tool is not in the engine's tool table, so its call is
// shaped by hand.
export function compactCall(instructions: string, agentId?: string): AgentLoop & ToolCallArgs {
  const call: unknown = {
    agentId,
    instructions,
    tool: COMPACT_TOOL
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the tool is not in the engine's table
  return call as AgentLoop & ToolCallArgs;
}

export type Seen = {
  commands: string[];
  compactCalls: number;
  compactions: unknown[];
  // The context the last measurement carried; the engine's figures answer the same.
  context: SessionContextUsage;
  prompts: string[];
  statuses: Array<string | undefined>;
  toasts: string[];
  tools: string[];
  transcript: string[];
};

// `isRefused` stands for a turn in flight: the engine rejects a compaction
// then, and a hook that throws leaves the plugin's call rejected the same way.
export function standForTheEngine(
  on: On,
  usage: () => SessionRateLimit[],
  isRefused: () => boolean = () => false
): Seen {
  const seen: Seen = {
    commands: [],
    compactCalls: 0,
    compactions: [],
    context: {window: 200_000},
    prompts: [],
    statuses: [],
    toasts: [],
    tools: [],
    transcript: []
  };
  on('ui.status', (_, event) => {
    seen.statuses.push(event.text);
    return {value: undefined};
  });
  on('ui.toast', (_, event) => {
    seen.toasts.push(event.text);
    return {value: undefined};
  });
  on('ui.log', (_, event) => {
    if (event.to === 'transcript') {
      seen.transcript.push(event.text);
    }

    return {value: undefined};
  });
  on('session.compact', (_, event) => {
    seen.compactCalls += 1;
    if (isRefused()) {
      throw new Error('a turn runs');
    }

    seen.compactions.push(event);
    return {messages: [SUMMARY]};
  });
  on('session.usage', () => ({
    value: {
      context: seen.context,
      rateLimits: usage(),
      startedAt: NOW
    }
  }));
  on('session.measure', (_, event) => {
    seen.context = event.context;
    return {changed: event.changed};
  });
  on('session.start', (_, event) => ({cwd: event.cwd}));
  on('turn.complete', (_, event) => ({text: event.answer}));
  on('command.run', (_, event) => {
    seen.commands.push(`${event.command} ${event.args}`.trim());
    return {text: `ran ${event.command}`};
  });
  on('tool.call', () => ({
    result: {}
  }));
  on('tool.register', (_, event) => {
    seen.tools.push(event.name);
    return {
      value: {tool: `mcp__smart-limits__${event.name}`}
    };
  });
  on('prompt.submit', (_, event) => {
    seen.prompts.push(event.text);
    return {text: event.text};
  });
  on('agent.spawn', () => ({model: 'haiku'}));
  return seen;
}

export async function start($: Engine): Promise<void> {
  await $.session.start({
    cwd: '/',
    isInteractive: true,
    surface: 'terminal'
  });
}
