# smart-limits

A Claude Code plugin that does two things:

- **Compacts at a good moment.** Once the context is `compactAt` percent full,
  the model is asked to finish its current step and call the plugin's `compact`
  tool. The conversation is compacted when that turn ends, and the model is
  prompted to carry on from the summary. The engine's own auto-compaction still
  works as a fallback.
- **Stops before the subscription runs out.** At `limitSoft` percent of the
  5-hour or 7-day window you get one warning. At `limitHard` the `atHard`
  command runs once and the model is told to stop and report what is done and
  what is left. Until the window resets, Bash, Write, Edit, NotebookEdit and
  Agent are refused. After the reset the `atReset` command runs.

## Install

In Claude Code in a terminal:

```
/plugin marketplace add ololoepepe/smart-limits
/plugin install smart-limits@smart-limits
```

The same from a shell:

```
claude plugin marketplace add ololoepepe/smart-limits
claude plugin install smart-limits@smart-limits
```

In the Claude desktop app: in the plugin settings, add `ololoepepe/smart-limits`
as a source, then install `smart-limits` from it.

The plugin is active from the next session. To update:

```
claude plugin marketplace update smart-limits
claude plugin update smart-limits@smart-limits
```

## Settings

Set them in `/config` (rows `smart-limits.<field>`) or with
`/plugin configure smart-limits@smart-limits`. They are stored in
`~/.claude/settings.json` and apply to every project. A threshold of 0 turns
it off.

For one project, put the fields to change into `.claude/settings.local.json`
(yours only) or `.claude/settings.json` (shared through the repository):

```json
{
  "pluginConfigs": {
    "smart-limits@smart-limits": {
      "options": {"atHard": "pause", "atReset": "resume"}
    }
  }
}
```

A field there wins over `~/.claude/settings.json`; `.claude/settings.local.json`
wins over `.claude/settings.json`. The files are read when a session starts.
`/smart-limits:status` shows which fields came from them.

| Field | Default | Meaning |
| --- | --- | --- |
| `compactAt` | 70 | Context fill, %, from which the model is asked to compact. |
| `compactInstructions` | empty | What every summary must keep, added to the model's own note. |
| `limitSoft` | 80 | Window share, %, for a one-time warning. |
| `limitHard` | 90 | Window share, %, at which `atHard` runs and the tools are refused. |
| `atHard` | empty | Slash command without the slash, run once at the hard limit, e.g. the pause command of whatever drives the work. |
| `atReset` | empty | Slash command without the slash, run once after the window resets. |

`atHard` and `atReset` cannot name this plugin's own command: the engine does
not pass it back to the plugin, so such a value is ignored with a line in the
transcript.

## Good to know

- The status line: `5h 63% · 7d 41% · soft 80 · hard 90 · ctx 52/70 · reset 18:40`.
  These are the windows (`STOP` after one at the hard limit), the thresholds,
  the context fill against `compactAt`, and the nearest reset. Without a
  subscription only `ctx` is shown, and nothing is refused.
- `/smart-limits:status` shows the windows, the context fill, the thresholds,
  what is in force and the last compaction.
- At the hard limit Read, Grep, Glob, WebFetch, WebSearch and other plugins'
  tools still work, so the model can write its report. The response that
  crosses the limit still runs its own tool calls; refusals start with the next
  one. Subagents are refused too.
- `atReset` runs only if the session is still open at the reset.
- Compaction happens only in the main conversation. In `claude -p` the engine
  refuses it; the plugin drops the request after four tries.

## Development

Run from the repository: `claude --plugin-dir . --debug`. An interactive
session writes the engine's type declarations to `.claude-plugin/types/`
(ignored by git, needed by `tsc`) and reloads the plugin on every save.

`hooks/hooks.json` names `hooks/register.ts`, which registers the handlers from
the other files in `hooks/`. The logic and its unit tests are in `src/`;
`tests/` runs the whole plugin on the engine's test kit. Imports are relative
paths because the engine's loader accepts nothing else.

```
npm run check   # validate + lint + typecheck + test
```

For a live check, set `compactAt` 1, `limitSoft` 1, `limitHard` 2 and `atHard`
`cost` in `/config`. Headless:

```
claude -p --model haiku --plugin-dir . --debug-file probe.log \
  --settings '{"pluginConfigs":{"smart-limits":{"options":{"limitSoft":1,"limitHard":2,"atHard":"cost"}}}}' \
  --allowedTools Bash "Run \`echo one\` with Bash, then \`echo two\` with Bash; quote any refusal verbatim."
```

The plugin's lines in the debug log start with `[smart-limits]`.
