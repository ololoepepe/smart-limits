// The values the plugin keeps in the engine's session state, which a hot
// reload of the module (a setting changed in /config, a file saved while
// developing) does not lose: the crossings already acted on, so that a reload
// does not warn or run the command again; and the compaction's memory, so
// that a request the model made stands and the status command still reports
// the last compaction. The module imports these types from here; the
// contract itself imports nothing.

export type CrossingsKept = {
  hard: string[];
  soft: string[];
};

export type CompactionKept = {
  isArmed: boolean;
  lastCompactAt: null | number;
  lastCompactSkip: null | string;
  requestedAt: null | number;
  requestedInstructions: null | string;
};

declare module 'claude-code' {
  interface PluginState {
    'smart-limits': {
      compaction: CompactionKept;
      crossings: CrossingsKept;
    };
  }
}
