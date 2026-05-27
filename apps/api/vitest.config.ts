import { defineConfig } from 'vitest/config';
import path from 'path';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  esbuild: false,
  resolve: {
    // Prefer .ts over .js so that vite-node loads source files rather than
    // pre-compiled outputs. Without this, compiled entity .js files are
    // loaded via CommonJS require() and their decorator registrations persist
    // in the CJS module cache, surviving the per-spec storage reset (Fix A)
    // and causing metadata mismatches when a spec runs after another spec that
    // already loaded the same entity via its .js file.
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.cjs', '.json'],
    alias: {
      '@tasknote/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
