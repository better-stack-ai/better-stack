---
name: btst-testing
description: Patterns for running BTST unit tests (Vitest) and E2E tests (Playwright), including unit test structure using the memory adapter, smoke test commands, per-framework E2E runs, Playwright project configuration, API key guards, and environment variable setup. Use when writing or running unit tests for plugin getters/mutations, running e2e smoke tests, targeting a specific framework, writing a new smoke test, or setting up API key guards for external service tests.
---

# BTST Testing

## Unit tests (Vitest)

### Location and naming

```
packages/stack/src/plugins/{name}/__tests__/
  getters.test.ts
  mutations.test.ts
  plugin.test.ts

packages/cli/src/utils/__tests__/
  {util}.test.ts
```

### Run commands

```bash
# packages/stack — watch mode
cd packages/stack && pnpm test

# packages/cli — run once
cd packages/cli && pnpm test
```

### Pattern: testing getters/mutations with the memory adapter

Use `createMemoryAdapter` + `defineDb` to spin up an isolated in-memory DB per test:

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { createMemoryAdapter } from "@btst/adapter-memory"
import { defineDb } from "@btst/db"
import type { DBAdapter as Adapter } from "@btst/db"
import { myPluginSchema } from "../db"
import { listItems, getItemById } from "../api/getters"

const createTestAdapter = (): Adapter => {
  const db = defineDb({}).use(myPluginSchema)
  return createMemoryAdapter(db)({})
}

describe("my-plugin getters", () => {
  let adapter: Adapter

  beforeEach(() => {
    adapter = createTestAdapter()   // fresh DB per test
  })

  it("returns empty result when no items exist", async () => {
    const result = await listItems(adapter)
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })
})
```

Use `vi.mock` for external modules that don't exist in the test environment (e.g. `@vercel/blob/server`).

---

## E2E tests (Playwright)

### E2E setup

Playwright configuration lives in `e2e/playwright.codegen.config.ts`, command `pnpm codegen:e2e`. It starts the `codegen-projects/` apps (ports 3006–3008) and tests the CLI codegen output — accurately reflecting what a real `btst init` user gets.

The codegen projects are built from scratch via `scripts/codegen/setup-*.sh`.

### Location and naming

Tests live in `e2e/tests/`. Naming convention: `smoke.{feature}.spec.ts`

Examples: `smoke.chat.spec.ts`, `smoke.blog.spec.ts`

### Setting up codegen projects (required before running codegen E2E)

The `codegen-projects/` directory is **not committed** — build it from scratch:

```bash
# Set up a specific framework
bash scripts/codegen/setup-nextjs.sh
bash scripts/codegen/setup-react-router.sh
bash scripts/codegen/setup-tanstack.sh

# Or set up all frameworks at once
bash scripts/codegen/setup.sh

# Cleanup when you want a fresh start
bash scripts/codegen/cleanup.sh nextjs
bash scripts/codegen/cleanup.sh react-router
bash scripts/codegen/cleanup.sh tanstack
```

See `scripts/codegen/README.md` for full details on the E2E overlay file system and update workflow.

### Run commands

```bash
cd e2e

# Run all codegen E2E tests
pnpm codegen:e2e

# Target a specific framework
pnpm codegen:e2e:nextjs
pnpm codegen:e2e:tanstack
pnpm codegen:e2e:react-router

# Specific test file
pnpm codegen:e2e:nextjs -- tests/smoke.blog.spec.ts
```

### Playwright projects and ports

| Project | Port |
|---|---|
| `nextjs:codegen` | 3006 |
| `tanstack:codegen` | 3007 |
| `react-router:codegen` | 3008 |

Set `BTST_FRAMEWORK=nextjs|tanstack|react-router` to start only one server.

### In-memory state between test runs

The in-memory adapter keeps data alive for the lifetime of the server process. If you re-run tests against an already-running server, earlier test data will still be present and can cause failures.

To reset: kill the server and let `reuseExistingServer: true` restart it, or rebuild with `start:e2e`:

```bash
kill $(lsof -ti:3006)
pnpm -F nextjs run start:e2e   # rebuilds .next and starts fresh
```

### API key guard pattern

Features requiring external APIs (OpenAI, etc.) must skip gracefully when the key is absent:

```typescript
test.beforeEach(async () => {
  if (!process.env.OPENAI_API_KEY) {
    test.skip()
  }
})
```

1. Check for the API key in `test.beforeEach`
2. Call `test.skip()` — don't throw
3. Document required env vars in a comment at the top of the spec file

### Environment variables

```bash
# Env is loaded from codegen-projects/nextjs/.env automatically by playwright.codegen.config.ts
```

For CI, the codegen workflow (`.github/workflows/codegen-e2e.yml`) builds the codegen project from scratch and passes `OPENAI_API_KEY` from secrets.
