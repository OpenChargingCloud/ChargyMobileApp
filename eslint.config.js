const eslint   = require('@eslint/js');
const tseslint = require('typescript-eslint');

/**
 * Keep the first ESLint adoption non-blocking: the shared strict presets are
 * visible as warnings while individual rules can be promoted to errors once
 * the MobileApp code has been worked through.
 */
function asWarnings(configs) {

    return configs.map(config => {

        if (!config.rules)
            return config;

        const rules = {};

        for (const [name, setting] of Object.entries(config.rules))
        {
            if (setting === 'error' || setting === 2)
                rules[name] = 'warn';

            else if (Array.isArray(setting) && (setting[0] === 'error' || setting[0] === 2))
                rules[name] = ['warn', ...setting.slice(1)];

            else
                rules[name] = setting;
        }

        return { ...config, rules };

    });

}

module.exports = tseslint.config(

    {
        ignores: [
            '.build/**',
            'platforms/**',
            'plugins/**',
            'www/**',
            '**/node_modules/**',
            '**/*.js',
            '**/*.cjs',
            '**/*.mjs',
            '**/*.d.ts'
        ]
    },

    {

        files: [ 'src/ts/**/*.ts', 'tests/**/*.ts' ],

        extends: asWarnings([
            eslint.configs.recommended,
            ...tseslint.configs.strictTypeChecked
        ]),

        languageOptions: {
            parserOptions: {
                project:         './tsconfig.eslint.json',
                tsconfigRootDir: __dirname
            }
        }
    },

    // Keep the first repository-wide adoption warning-only. Once individual
    // rules are worked off, they can be promoted here without surprising CI.
    {
        rules: {
            'prefer-const': 'warn',
            'no-case-declarations': 'off',
            'no-sparse-arrays': 'off',
            'no-prototype-builtins': 'off',
            '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'off',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/no-useless-default-assignment': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_'
                }
            ]
        }
    },

    // The Cordova/DOM integration layer still contains untyped runtime APIs.
    // Keep its adoption path visible without making the first lint setup noisy
    // enough to block unrelated work.
    {
        files: [ 'src/ts/chargyApp.ts', 'src/ts/index.ts' ],
        rules: {
            '@typescript-eslint/no-explicit-any':                 'warn',
            '@typescript-eslint/no-unsafe-assignment':            'warn',
            '@typescript-eslint/no-unsafe-call':                  'warn',
            '@typescript-eslint/no-unsafe-member-access':         'warn',
            '@typescript-eslint/no-unsafe-argument':              'warn',
            '@typescript-eslint/no-unsafe-return':                'warn',
            '@typescript-eslint/explicit-function-return-type':   'warn',
            '@typescript-eslint/explicit-module-boundary-types':  'warn',
            '@typescript-eslint/strict-boolean-expressions':      'off',
            '@typescript-eslint/no-unnecessary-condition':        'off',
            '@typescript-eslint/prefer-nullish-coalescing':       'off',
            '@typescript-eslint/no-floating-promises':            'warn',
            '@typescript-eslint/no-misused-promises':             'warn',
            '@typescript-eslint/require-await':                   'warn',
            '@typescript-eslint/no-base-to-string':               'warn',
            '@typescript-eslint/no-non-null-assertion':           'warn',
            'no-empty':                                           'warn',
            'no-var':                                             'warn'
        }
    }

);
