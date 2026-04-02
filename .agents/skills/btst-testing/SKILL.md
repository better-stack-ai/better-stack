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

### Two E2E setups

There are two Playwright configurations in `e2e/`:

| Config | Command | Servers | Purpose |
|---|---|---|---|
| `playwright.config.ts` | `pnpm e2e:smoke` | `examples/` projects (ports 3003–3005) | Legacy — will be retired |
| `playwright.codegen.config.ts` | `pnpm codegen:e2e` | `codegen-projects/` (ports 3006–3008) | **Primary** — tests the CLI codegen output |

**Use the codegen config** for all new work. The codegen projects are built from scratch via `scripts/codegen/setup-*.sh` and accurately reflect what a real `btst init` user gets.

### Location and naming

Tests live in `e2e/tests/`. Naming convention: `smoke.{feature}.spec.ts`

Examples: `smoke.chat.spec.ts`, `smoke.blog.spec.ts`

### Setting up codegen projects (required before running codegen E2E)

The `codegen-projects/` directory is **not committed** — build it from scratch:

```bash
# Next.js (currently the only fully set-up codegen project)
bash scripts/codegen/setup-nextjs.sh

# Cleanup when you want a fresh start
bash scripts/codegen/cleanup.sh nextjs
```

See `scripts/codegen/README.md` for full details.

### Run commands

```bash
# Codegen E2E — Next.js (primary)
cd e2e
pnpm codegen:e2e:nextjs

# Specific test file against codegen project
pnpm codegen:e2e:nextjs -- tests/smoke.blog.spec.ts

# Legacy example-project E2E (all frameworks)
pnpm e2e:smoke
pnpm e2e:smoke:nextjs
pnpm e2e:smoke:tanstack
pnpm e2e:smoke:react-router
```

### Playwright projects and ports

| Project | Config | Port |
|---|---|---|
| `nextjs:codegen` | `playwright.codegen.config.ts` | 3006 |
| `tanstack:codegen` | `playwright.codegen.config.ts` | 3007 |
| `react-router:codegen` | `playwright.codegen.config.ts` | 3008 |
| `nextjs:memory` | `playwright.config.ts` (legacy) | 3003 |
| `tanstack:memory` | `playwright.config.ts` (legacy) | 3004 |
| `react-router:memory` | `playwright.config.ts` (legacy) | 3005 |

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
# For codegen E2E — env is loaded from codegen-projects/nextjs/.env
# (set automatically by playwright.codegen.config.ts)

# For legacy E2E — load manually if needed
export $(cat ../examples/nextjs/.env | xargs)
```

For CI, the codegen workflow (`.github/workflows/codegen-e2e.yml`) builds the codegen project from scratch and passes `OPENAI_API_KEY` from secrets.
