# smart-limits

A Claude Code plugin that watches the two boundaries of a session and acts
before either cuts the work short.

**The context window.** The engine's own auto-compaction fires right before a
request to the model, in the middle of whatever the model was doing, and the
model loses its working state mid-thought. This plugin lets the model choose
the moment instead: past a fill of its own choosing, below the engine's, every
tool result reminds the model to ask for a compaction once nothing is
half-done; the model asks through the plugin's tool, the conversation is
compacted when that turn ends, and a prompt wakes the model to go on from the
summary. Work that spans several turns is not cut in the middle.

**The subscription windows.** The 5-hour and 7-day windows of a subscription
(and a gateway's spend limit) are read from the engine after every response.
At a soft share the plugin warns once. At a hard share it runs a command you
name and refuses the tools that do work, in the main session and in every
subagent, until the window resets. A run left overnight stops at a clean point
with a report instead of hitting the limit halfway through a change.

It runs nothing on the host: no processes, no status-line script, no background
session. Everything goes through the engine's plugin API. It is independent of
every other plugin.

## Settings

Each field is a row in `/config`, as `smart-limits.<field>`; a change reloads
the plugin. The values are the user's, kept in `~/.claude/settings.json` under
`pluginConfigs`: one set for every project, and the engine does not read them
from a project's own settings file. What the plugin has already done in the
session (the windows it warned about, the command it ran, the compaction it
made) is kept in the engine's session state, so a reload does not do it
again. A threshold of 0 turns its mechanism off.

| Field | Default | What it does |
| --- | --- | --- |
| `compactAt` | 70 | Percent of the context window from which the model is reminded, on every tool result, to ask for a compaction at a good point. |
| `compactInstructions` | empty | What every summary should keep, added after the model's own note. Empty: the model's note alone. |
| `limitSoft` | 80 | Percent of a subscription window at which a toast warns once per window. |
| `limitHard` | 90 | Percent of a subscription window at which the command below runs once and Bash, Write, Edit, NotebookEdit and new agents are refused until the window resets. |
| `atHard` | empty | A slash command run once when the hard limit is crossed, written as typed after the slash (name, then arguments after a space): the pause command of whatever drives the work. Empty: none. |
| `atReset` | empty | A slash command run once when no window holds the hard limit any more (the window reset): the command that continues the paused work. Empty: none. |

Neither command may be one of this plugin's own: the engine does not route a
plugin's command run back to the plugin, so such a value is set aside with a
line in the transcript at the start.

The share of a window is the engine's `percentUsed`; the plugin judges every
window the engine reports and acts on the highest. A subscription window whose
reset time has passed is treated as over, whatever share the last reading still
shows for it.

## What you see

**The status line.** While the engine has a reading, one line under the
prompt: the windows with their shares and the nearest reset in local time,
`5h 63% · 7d 41% · reset 18:40`. Without a reading (no subscription, or before
the first response) the line is empty and nothing is refused.

**The soft limit.** One toast per window per crossing: which window, its
share, the limit, when it resets, and "start nothing new". Nothing is refused:
a plugin that drives a run reads a refused spawn as a skipped step, so the
warning stays a warning.

**The hard limit.** Once per crossing, the `atHard` command runs after the
current hook has returned (the engine refuses a command started inside a hook a
turn waits on). From then on `Bash`, `Write`, `Edit`, `NotebookEdit` and the
`Agent` tool are refused in every loop with a text that names the window, the
share, the limit and the reset time, and tells the model to stop now, not to
present unfinished work as finished, and to report what is done, what is
half-done and what remains. `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch` and
the tools of other plugins pass, so the report can be written. The response
that brings the reading past the limit may carry tool uses of its own; the
engine dispatches those before the measurement reaches the plugin, so they
run, and the next response's calls are refused. The refusals lift when
the share falls below the limit or the window resets: a timer at the reset
reads the engine's figures again, since no measurement arrives while the
session is idle. Once no window holds the hard limit, a line in the transcript
says so, and the `atReset` command runs a second later, so that work paused by
`atHard` goes on without anyone at the keyboard. The plugin lives in the
session: a session that was closed runs nothing.

**The compaction.** From `compactAt` on, every tool result of the main
conversation carries a line the model reads and the person never sees: the
fill, the threshold, and what to do: finish the current step at a point where
nothing is half-done, then call the plugin's `compact` tool with what the
summary must keep, and end the turn. The tool records the request; the engine
refuses a compaction while a turn runs, so the conversation is compacted a
second after that turn ends, with the model's note and `compactInstructions`
as the summary's instructions. A line in the transcript says so, and a second
later the plugin submits a prompt that wakes the model to continue from the
summary. The reminders stop after a compaction until a reading below the
threshold, since a summary may fill more than the threshold on its own. A
request the engine keeps refusing (a headless session compacts inside a turn
only) is dropped after four tries. The engine's own auto-compaction is never
cancelled; it stays the last resort for a model that ignores the reminders.
A subagent's transcript is never touched, and the tool refuses a subagent: it
has one turn for its whole life, and there is no point to choose there.

**`/smart-limits:status`.** The windows with their shares and resets, the
context fill, the thresholds in force, which limit is crossed and whether the
refusals are on, whether the model is being reminded or has asked, and when
the conversation was last compacted at its request. For a person and for a
test stand alike.

## Install

At the prompt of a terminal session:

```
/plugin install smart-limits --marketplace ololoepepe/smart-limits
```

Answer `y` to add the marketplace, then pick a scope; the plugin's settings
screen follows. From a shell: `claude plugin install smart-limits --marketplace
ololoepepe/smart-limits`. The marketplace file is this repository's own
`.claude-plugin/marketplace.json`.

## Development

The plugin is a hooks module of Claude Code: `hooks/hooks.json` names
`hooks/register.ts`, which the engine compiles and loads itself. That file only
registers the hooks; the handlers live beside it, one file per topic, each
reaching the engine through the `$` it is handed. The logic they feed lives in
`src/` as plain functions with tests beside them; `tests/plugin.test.ts` drives
the whole plugin with readings a test raises. Imports inside the module are
relative paths: the engine's loader accepts nothing else.

Run it from the folder with `claude --plugin-dir <folder> --debug`. An
interactive session writes the engine's type declarations into
`.claude-plugin/types/` (ignored by git) and reloads the module on every save;
`tsc` reads those declarations through `tsconfig.json`.

```
npm run validate    # claude plugin validate .
npm run lint        # eslint
npm run typecheck   # tsc
npm test            # claude plugin test .
npm run check       # all four
```

For a live check with thresholds that cross at once, set in `/config`
`compactAt` to 1, `limitSoft` to 1, `limitHard` to 2, and `atHard` to a harmless
built-in command such as `cost`. A headless check reads the same values from a
settings file:

```
claude -p --model haiku --plugin-dir . --debug-file probe.log \
  --settings '{"pluginConfigs":{"smart-limits":{"options":{"limitSoft":1,"limitHard":2,"atHard":"cost"}}}}' \
  --allowedTools Bash "Run \`echo one\` with Bash, then \`echo two\` with Bash; quote any refusal verbatim."
```

The debug log carries every line the plugin logs, prefixed `[smart-limits]`,
and what the engine did with each call.

## What is checked

By tests, on the engine's own test kit: the status line, one warning per
crossing, the command at the hard limit and the refusals in the main loop and
a subagent's, their lifting at the reset and below the limit, the reminder on
tool results past the threshold and its silence after a compaction, the
request through the tool, the compaction after the turn with the model's note
and the settings' instructions, the prompt that wakes the model, the request
refused in a subagent, the retries of a refused request and their limit, the
zero thresholds, the plugin's own command set aside, and the status command.

In headless sessions on Claude Code 2.1.308 with a subscription, thresholds of
1 and 2 percent: the settings are read from `pluginConfigs.smart-limits` given
with `--settings`, and not from the same key in the project's own
`.claude/settings.json`; the measurement arrives with the first response that
reports the windows, and the status line, one warning per window and the
hard-limit line follow it; `/cost` named as `atHard` runs from the timer once
the turn has ended; the Bash calls of that response run and the next turn's is
refused with the full text, which the model quotes and acts on;
`/smart-limits:status` answers; the plugin's own command named as `atHard` is
set aside with the line at the start; the reminder reaches the model on a
tool result, the model (haiku) calls the compact tool with a note of its
state and ends the turn, the request goes to the engine a second after the
turn, and there the headless engine refuses it as not available, so it is
tried again after the next turn.

In an interactive terminal session on the same build, on a throwaway project:
the session starts with a reading of the windows already, so the status line,
the warning and the hard limit are in force before the first prompt; the
first measurement with the context fill arrives after the first turn, so the
reminder rides on the next turn's tool results; there the model (haiku) says
it is compacting since nothing is half-done, calls the compact tool with a
note of its state and ends the turn; a second after the turn the engine
accepts the compaction (nine seconds for the summary), the transcript line
follows, and a second later the plugin's prompt wakes the model, which goes
on from the summary; the status command reports the compaction; `/cost` named
as `atHard` runs from the timer and opens the engine's usage panel; Bash and
the Agent tool are refused with the full text, which the model quotes and
answers with what is done, half-done and remaining; Read passes; a value set
in `/config` lands in the user's settings file and reloads the plugin with
it.

Not checked live: a reload while a limit is crossed, which the session state
is meant to keep quiet; the refusals inside a running subagent; the command
after the hard limit clears, which needs a window to reset. A real crossing
of the 5-hour window is not reproduced on a stand; it stays on the tests.
