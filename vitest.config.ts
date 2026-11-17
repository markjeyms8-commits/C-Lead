import { defineConfig } from 'vitest/config';
// PGlite allocates a PostgreSQL/WASM instance per file; serialize these on the
// development host instead of competing with browser/build workers for memory.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], fileParallelism: false },
});
