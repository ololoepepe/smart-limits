// The plugin's tool for the model, and the reminder: while the context
// window is past the threshold, every tool result of the main conversation
// carries a line the model reads and the person does not, asking for a
// compaction at a good point; the tool records the request, and the
// compaction follows the end of the turn (hooks/compaction.ts).

import type {EngineInterface, On} from 'claude-code';

import {
  COMPACT_TOOL, COMPACT_TOOL_DESCRIPTION, COMPACT_TOOL_NAME, COMPACT_TOOL_SCHEMA, reminderText, requestAnswer,
  SUBAGENT_REFUSAL
} from '../src/compaction.ts';

import {isReminding, keep, noteRequest, state} from './state.ts';

// The engine's tool table does not declare the plugin's own tool, so its name
// is matched as a pattern and its input read as plain fields.
const COMPACT_TOOL_PATTERN = new RegExp(`^${COMPACT_TOOL}$`, 'u');
const TOOL_FAILED = 'smart-limits: the compact tool failed; end the turn and call it again';

function instructionsOf(fields: Record<string, unknown>): string | undefined {
  const note = typeof fields.instructions === 'string' ? fields.instructions.trim() : '';
  return note === '' ? undefined : note;
}

export async function registerCompactTool($: EngineInterface): Promise<void> {
  await $.tool.register({
    description: COMPACT_TOOL_DESCRIPTION,
    inputSchema: COMPACT_TOOL_SCHEMA,
    isDeferred: false,
    name: COMPACT_TOOL_NAME
  });
}

export function registerToolHooks(on: On): void {
  on('tool.call', {tool: COMPACT_TOOL_PATTERN}, async ($, event) => {
    if (event.agentId !== undefined) {
      return {deny: SUBAGENT_REFUSAL};
    }

    const {agentId, tool, tool_use_id: toolUseId, ...fields} = event;
    noteRequest({
      at: await $.clock.now(),
      instructions: instructionsOf(fields)
    });
    void keep($);
    return {result: requestAnswer(state.context?.percent)};
  }).catch(async (error, event, next) => (next.called ? await next(event) : {deny: TOOL_FAILED}));

  // The reminder rides on every other tool's result in the main loop.
  on('tool.call', async ($, event, next) => {
    const result = await next(event);
    if (event.agentId !== undefined || COMPACT_TOOL_PATTERN.test(event.tool) || result.deny !== undefined ||
      !isReminding()) {
      return result;
    }

    const percent = state.context?.percent ?? 0;
    return {
      ...result,
      context: [...(result.context ?? []), reminderText(percent, state.settings.compactAt)]
    };
  }).catch(async (error, event, next) => await next(event));
}
