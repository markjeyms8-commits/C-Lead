import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
// PGlite allocates a PostgreSQL/WASM instance per file; serialize these on the
// development host instead of competing with browser/build workers for memory.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: { include: ['tests/unit/**/*.test.ts'], fileParallelism: false },
});
