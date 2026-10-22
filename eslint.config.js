import ololoepepe from '@ololoepepe/eslint-config-typescript';

export default [
  {ignores: ['node_modules/**', '.claude-plugin/types/**']},
  ...ololoepepe,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
          defaultProject: 'tsconfig.eslint.json'
        },
        tsconfigRootDir: import.meta.dirname
      }
    },
    settings: {
      // The engine declares these modules itself; nothing on disk resolves them.
      'import-x/core-modules': ['claude-code', 'claude-code/testing']
    }
  },
  {
    // The engine's `on` carries one conditional type per event, and the
    // void-return check of this rule over its arguments takes minutes on it;
    // the other checks of the rule stay on. The plugin test registers the
    // engine's side through the same `on`.
    files: ['hooks/*.ts', 'tests/*.ts'],
    rules: {
      '@typescript-eslint/no-misused-promises': ['error', {
        checksVoidReturn: {
          arguments: false
        }
      }]
    }
  },
  {
    // A registration returned by `on` is not a promise, though it has a
    // `catch` method that a guard must call.
    files: ['hooks/*.ts'],
    rules: {
      'promise/no-callback-in-promise': 'off',
      'promise/prefer-await-to-then': 'off'
    }
  },
  {
    // The engine loads a hooks module only through relative imports: the
    // module's files reach the logic in src/ by a parent path.
    files: ['hooks/*.ts'],
    rules: {
      'import-x/no-relative-parent-imports': 'off'
    }
  },
  {
    // The engine's contract for session state keys the values by the
    // plugin's name, which carries a hyphen.
    files: ['types/*.d.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off'
    }
  }
];
