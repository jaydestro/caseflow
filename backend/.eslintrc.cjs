/* eslint-env node */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.cjs', '*.js'],
  rules: {
    eqeqeq: ['error', 'always'],
    'no-console': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-floating-promises': 'error',
    // Express recognises async route handlers and error middleware; passing an
    // async function as a void-returning argument is safe here (each handler
    // has its own try/catch + next(e)), so only the argument check is relaxed.
    '@typescript-eslint/no-misused-promises': [
      'error',
      { checksVoidReturn: { arguments: false } },
    ],
    // Allow intentionally-unused names prefixed with `_` (e.g. the `_next`
    // arg Express requires to detect 4-arg error middleware).
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
  },
};
