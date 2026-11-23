import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
// Custom intel rules
import intelRules from './scripts/eslint-rules/no-local-intelreport.js'

export default tseslint.config(
  { 
    ignores: [
      'dist',
      'backup/**',
      'excluded-from-build/**', 
      'scripts/**',
      'test/**',
      'tests/**',
      'src/testing/**',
      'src/**/__tests__/**',
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      '**/*.d.ts',
      '**/*_OLD*.{ts,tsx}',
      '**/*.old.{ts,tsx}',
      '**/*.bak.{ts,tsx}',
      '**/*.backup.{ts,tsx}',
      '**/*.disabled.{ts,tsx}',
      'starcom-mk2-backup/**'
    ] 
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'intel': intelRules,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
  // Escalated after migration tasks confirmed (Phase 5 guardrail)
  'intel/no-local-intelreport': ['error'],
  // Phase 4: Prevent raw console.* in production code — use createLogger() from @utils/logger
  'no-console': ['warn', { allow: ['assert'] }],
    },
  },
  {
    // Allow raw console in logger utilities and console-manipulation utilities
    files: [
      'src/utils/logger.ts',
      'src/utils/debugLogger.ts',
      'src/utils/errorLogger.ts',
      'src/utils/consoleErrorFixer.ts',
      'src/utils/consoleErrorResolver.ts',
      'src/utils/consoleOptimization.ts',
      'src/utils/safeErrorHandling.ts',
      'src/security/logging/SecureLogger.ts',
      'src/applications/netrunner/services/logging/NetRunnerLogger.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // P6: Legacy files archived — rules retained as safety net against re-introduction
    files: ['src/components/Globe/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: './EnhancedGlobeInteractivity',
            message: 'Legacy file retired in P6. Use the canonical Enhanced3DGlobeInteractivity path.'
          },
          {
            name: './EnhancedGlobeInteractivityV2',
            message: 'Legacy file retired in P6. Use the canonical Enhanced3DGlobeInteractivity path.'
          },
          {
            name: '../Globe/EnhancedGlobeInteractivity',
            message: 'Legacy file retired in P6. Use the canonical Enhanced3DGlobeInteractivity path.'
          },
          {
            name: '../Globe/EnhancedGlobeInteractivityV2',
            message: 'Legacy file retired in P6. Use the canonical Enhanced3DGlobeInteractivity path.'
          }
        ]
      }]
    }
  },
  {
    files: [
      'src/components/Globe/Enhanced3DGlobeInteractivity.tsx',
      'src/components/Globe/Globe.tsx'
    ],
    rules: {
      'max-lines': ['warn', { max: 1200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', { max: 30 }]
    }
  }
)
