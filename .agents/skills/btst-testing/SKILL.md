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

### Location and naming

Tests live in `e2e/tests/`. Naming convention: `smoke.{feature}.spec.ts`

Examples: `smoke.chat.spec.ts`, `smoke.blog.spec.ts`

### Run commands

```bash
# All frameworks (starts all 3 servers)
cd e2e
export $(cat ../examples/nextjs/.env | xargs)
pnpm e2e:smoke

# Single framework only
pnpm e2e:smoke:nextjs
pnpm e2e:smoke:tanstack
pnpm e2e:smoke:react-router

# Specific test file
pnpm e2e:smoke -- tests/smoke.chat.spec.ts

# Specific Playwright project
pnpm e2e:smoke -- --project="nextjs:memory"
```

### Playwright projects and ports

| Project | Port |
|---|---|
| `nextjs:memory` | 3003 |
| `tanstack:memory` | 3004 |
| `react-router:memory` | 3005 |

Defined in `playwright.config.ts`. By default all three servers start. Set `BTST_FRAMEWORK=nextjs|tanstack|react-router` to start only one — or use the per-framework scripts above. CI uses a matrix to run each in a separate parallel job.

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
export $(cat ../examples/nextjs/.env | xargs)
```

For CI, the workflow uses a matrix — each framework job sets `BTST_FRAMEWORK` and only starts its own server.
