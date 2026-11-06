# Changelog

The format follows Keep a Changelog. The project is at a 0.x version: minor
versions may change contracts. Entries start with 0.2.0; what came before is
in the git history.

## Unreleased

## [0.2.0] - 2026-11-06

### Added

- A project's `.claude/settings.local.json` and `.claude/settings.json` can set
  the plugin's fields under `pluginConfigs`, over the user's settings; the
  local file wins over the shared one. `/smart-limits:status` names the fields
  taken from them.
- The status line shows the soft and hard thresholds and the context fill
  against `compactAt`, and marks a window at the hard limit with `STOP`:
  `5h 63% · 7d 41% · soft 80 · hard 90 · ctx 52/70 · reset 18:40`.
