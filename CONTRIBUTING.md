# Contributing to BTST

Thank you for your interest in contributing. This guide covers all contribution types — from quick doc fixes to full new plugins.

---

## Table of contents

- [Development environment](#development-environment)
- [Types of contributions](#types-of-contributions)
  - [Bug reports](#bug-reports)
  - [Documentation](#documentation)
  - [Example app improvements](#example-app-improvements)
  - [New plugins](#new-plugins)
- [Plugin development guide](#plugin-development-guide)
  - [Plugin anatomy](#plugin-anatomy)
  - [File structure template](#file-structure-template)
  - [1. Database schema](#1-database-schema)
  - [2. Shared types and Zod schemas](#2-shared-types-and-zod-schemas)
  - [3. Backend plugin](#3-backend-plugin)
  - [4. Client plugin](#4-client-plugin)
  - [5. Query keys](#5-query-keys)
  - [6. Page components](#6-page-components)
  - [7. Build configuration](#7-build-configuration)
  - [8. Register in example apps](#8-register-in-example-apps)
- [Testing](#testing)
- [Documentation](#documentation-1)
- [Submission checklist](#submission-checklist)

---

## Development environment

**Node.js v22 is required.** Always activate it before running any commands:

```bash
source ~/.nvm/nvm.sh && nvm use 22
```

Install dependencies and verify the build:

```bash
pnpm install
pnpm build        # build all packages
pnpm typecheck    # TypeScript type check
pnpm lint         # Biome lint + format check
```

---

## Types of contributions

### Bug reports

Open an issue at [github.com/better-stack-ai/better-stack/issues](https://github.com/better-stack-ai/better-stack/issues) and include:

- A minimal reproduction (a demo link or a code snippet)
- The framework you are using (Next.js / React Router / TanStack)
- The `@btst/stack` version
- What you expected vs. what happened

### Documentation

Documentation lives in `docs/content/docs/`. MDX files are served by [FumaDocs](https://fumadocs.vercel.app/).

```bash
cd docs
pnpm dev   # preview the docs site locally
```

Edit the relevant `.mdx` file under `docs/content/docs/plugins/` and open a PR. No build step is required for doc-only changes — just verify `pnpm dev` renders correctly.

### Example app improvements

The three example apps live in `examples/nextjs/`, `examples/react-router/`, and `examples/tanstack/`. Each is a self-contained Next.js / React Router / TanStack app that demos all built-in plugins.

To run an example locally:

```bash
cd examples/nextjs    # or react-router, tanstack
pnpm install
pnpm dev
```

### New plugins

See the full [plugin development guide](#plugin-development-guide) below.

If you want to publish a plugin as a standalone npm package (not merged into this repo), use the **[Plugin Starter](https://github.com/better-stack-ai/plugin-starter)** — it provides a pre-configured build, example app, and CI pipeline.

---

## Plugin development guide

### Plugin anatomy

A plugin has two halves that must be kept in sync:

| Half | Entry point | Factory function | Import path |
|------|-------------|------------------|-------------|
| Backend | `api/plugin.ts` | `defineBackendPlugin` | `@btst/stack/plugins/api` |
| Client | `client/plugin.tsx` | `defineClientPlugin` | `@btst/stack/plugins/client` |

**Minimum backend shape:**

```typescript
import { defineBackendPlugin, createDbPlugin, createEndpoint, type Adapter } from "@btst/stack/plugins/api"

export const myBackendPlugin = defineBackendPlugin({
  name: "my-plugin",          // unique key — must match the key used in stack({ plugins: { ... } })
  dbPlugin: mySchema,         // from createDbPlugin(...)
  routes: (adapter: Adapter) => {
    const listItems = createEndpoint("/items", { method: "GET" }, async () => {
      return adapter.findMany({ model: "item" })
    })
    return { listItems } as const
  },
  // Optional: server-side API surface (no HTTP roundtrip — used for SSG, scripts, Server Components)
  api: (adapter: Adapter) => ({
    listItems: () => adapter.findMany({ model: "item" }),
  }),
})

// Export the inferred router type — the client plugin imports this for end-to-end type safety
export type MyApiRouter = ReturnType<typeof myBackendPlugin.routes>
```

**Minimum client shape:**

```typescript
import { defineClientPlugin, createRoute, createApiClient } from "@btst/stack/plugins/client"
import { lazy } from "react"
import type { QueryClient } from "@tanstack/react-query"
import type { MyApiRouter } from "../api/plugin"

export interface MyClientConfig {
  queryClient: QueryClient
  apiBaseURL: string
  apiBasePath: string
  siteBaseURL: string
  siteBasePath: string
}

export const myClientPlugin = (config: MyClientConfig) =>
  defineClientPlugin({
    name: "my-plugin",
    routes: () => ({
      list: createRoute("/my-plugin", () => {
        const ListPage = lazy(() => import("./components/list-page"))
        return {
          PageComponent: ListPage,
          loader: myLoader(config),
          meta: myMeta(config),
        }
      }),
    }),
  })
```

**Backend hook naming conventions:**

```typescript
// Authorization hooks (throw to deny)
onBeforeCreate, onBeforeUpdate, onBeforeDelete, onBeforeList
// Lifecycle hooks (called after success)
onAfterCreate, onAfterUpdate, onAfterDelete, onAfterList
// Error hooks
onCreateError, onUpdateError, onDeleteError, onListError
```

---

### File structure template

The blog plugin at [`packages/stack/src/plugins/blog/`](packages/stack/src/plugins/blog/) is the canonical reference implementation. Use this layout for a new plugin:

```
packages/stack/src/plugins/your-plugin/
├── db.ts                       # createDbPlugin(...) — database schema definition
├── types.ts                    # Shared TypeScript types (no framework dependencies)
├── schemas.ts                  # Zod validation schemas for request bodies
├── query-keys.ts               # React Query key factory (imports from api/query-key-defs.ts)
├── client.css                  # Plugin CSS (Tailwind source directives, component styles)
├── style.css                   # Full styles including Tailwind @source directives
├── api/
│   ├── plugin.ts               # defineBackendPlugin, RouteKey type, prefetchForRoute factory
│   ├── getters.ts              # Pure DB read functions — no hooks, no HTTP context
│   ├── mutations.ts            # Server-side write functions — no hooks, no HTTP context
│   ├── query-key-defs.ts       # Shared query key shapes (prevents SSG/SSR key drift)
│   ├── serializers.ts          # Convert Date fields → ISO strings before setQueryData
│   └── index.ts                # Barrel re-export of all public backend surface
└── client/
    ├── plugin.tsx              # defineClientPlugin — routes, loaders, meta generators
    ├── overrides.ts            # YourPluginOverrides interface
    ├── index.ts                # Public client entry point
    ├── hooks/
    │   └── index.tsx           # useSuspenseQuery-based React Query hooks
    └── components/
        └── pages/
            ├── list-page.tsx           # PageComponent wrapper (ComposedRoute + lazy)
            └── list-page.internal.tsx  # Actual page content (useSuspenseQuery inside)
```

Not every file is required for a minimal plugin. Start with `db.ts`, `types.ts`, `api/plugin.ts`, and `client/plugin.tsx`. Add the rest as the plugin grows.

---

### 1. Database schema

Define your data models using `createDbPlugin`. Field types: `string`, `boolean`, `number`, `date`.

```typescript
// packages/stack/src/plugins/your-plugin/db.ts
import { createDbPlugin } from "@btst/stack/plugins/api"

export const mySchema = createDbPlugin("your-plugin", {
  item: {
    modelName: "item",
    fields: {
      title:     { type: "string",  required: true },
      published: { type: "boolean", defaultValue: false },
      createdAt: { type: "date",    defaultValue: () => new Date() },
      updatedAt: { type: "date",    defaultValue: () => new Date() },
    },
  },
})
```

---

### 2. Shared types and Zod schemas

```typescript
// packages/stack/src/plugins/your-plugin/types.ts
export type Item = {
  id: string
  title: string
  published: boolean
  createdAt: Date
  updatedAt: Date
}
```

```typescript
// packages/stack/src/plugins/your-plugin/schemas.ts
import { z } from "zod"

export const createItemSchema = z.object({
  title: z.string().min(1),
  published: z.boolean().optional().default(false),
})

export const updateItemSchema = createItemSchema.partial()
```

---

### 3. Backend plugin

**`api/getters.ts`** — pure DB reads, safe for SSG and scripts. Authorization hooks are **not** called here — callers are responsible for access control.

```typescript
// packages/stack/src/plugins/your-plugin/api/getters.ts
import type { Adapter } from "@btst/stack/plugins/api"
import type { Item } from "../types"

/** Returns all items sorted newest-first. Authorization hooks are NOT called. */
export async function listItems(adapter: Adapter): Promise<Item[]> {
  return adapter.findMany<Item>({
    model: "item",
    sortBy: { field: "createdAt", direction: "desc" },
  }) as Promise<Item[]>
}

/** Returns a single item by ID, or null. Authorization hooks are NOT called. */
export async function getItemById(adapter: Adapter, id: string): Promise<Item | null> {
  return adapter.findOne<Item>({
    model: "item",
    where: [{ field: "id", value: id, operator: "eq" }],
  })
}
```

**`api/mutations.ts`** — server-side writes. Keep separate from getters. JSDoc warning is required.

```typescript
// packages/stack/src/plugins/your-plugin/api/mutations.ts
import type { Adapter } from "@btst/stack/plugins/api"
import type { Item } from "../types"

export interface CreateItemInput { title: string }

/**
 * Create an item directly in the database.
 *
 * @remarks Authorization hooks are NOT called. The caller is responsible for
 * access-control checks before invoking this function.
 */
export async function createItem(adapter: Adapter, input: CreateItemInput): Promise<Item> {
  return adapter.create<Item>({
    model: "item",
    data: { ...input, published: false, createdAt: new Date(), updatedAt: new Date() },
  })
}
```

**`api/plugin.ts`** — the main backend plugin definition:

```typescript
// packages/stack/src/plugins/your-plugin/api/plugin.ts
import { defineBackendPlugin, createEndpoint, type Adapter } from "@btst/stack/plugins/api"
import { mySchema } from "../db"
import { createItemSchema, updateItemSchema } from "../schemas"
import { listItems, getItemById } from "./getters"

export interface MyBackendHooks {
  onBeforeCreate?: (data: unknown, ctx: { headers: Headers }) => Promise<void> | void
  onAfterCreate?: (item: unknown, ctx: { headers: Headers }) => Promise<void> | void
  onCreateError?: (error: Error, ctx: { headers: Headers }) => Promise<void> | void
}

export const myBackendPlugin = (hooks?: MyBackendHooks) =>
  defineBackendPlugin({
    name: "your-plugin",
    dbPlugin: mySchema,

    api: (adapter) => ({
      listItems: () => listItems(adapter),
      getItemById: (id: string) => getItemById(adapter, id),
    }),

    routes: (adapter: Adapter) => {
      const listItemsEndpoint = createEndpoint("/items", { method: "GET" }, async () => {
        return listItems(adapter)
      })

      const createItemEndpoint = createEndpoint(
        "/items",
        { method: "POST", body: createItemSchema },
        async (ctx) => {
          if (hooks?.onBeforeCreate) {
            try {
              await hooks.onBeforeCreate(ctx.body, { headers: ctx.headers })
            } catch (e) {
              throw ctx.error(403, { message: e instanceof Error ? e.message : "Unauthorized" })
            }
          }
          const item = await adapter.create({ model: "item", data: { ...ctx.body, createdAt: new Date(), updatedAt: new Date() } })
          await hooks?.onAfterCreate?.(item, { headers: ctx.headers })
          return item
        },
      )

      const updateItemEndpoint = createEndpoint(
        "/items/:id",
        { method: "PUT", body: updateItemSchema },
        async (ctx) => {
          const updated = await adapter.update({
            model: "item",
            where: [{ field: "id", value: ctx.params.id }],
            update: { ...ctx.body, updatedAt: new Date() },
          })
          if (!updated) throw ctx.error(404, { message: "Item not found" })
          return updated
        },
      )

      const deleteItemEndpoint = createEndpoint("/items/:id", { method: "DELETE" }, async (ctx) => {
        await adapter.delete({ model: "item", where: [{ field: "id", value: ctx.params.id }] })
        return { success: true }
      })

      return { listItemsEndpoint, createItemEndpoint, updateItemEndpoint, deleteItemEndpoint } as const
    },
  })

export type MyApiRouter = ReturnType<ReturnType<typeof myBackendPlugin>["routes"]>
```

**`api/index.ts`** — barrel re-export:

```typescript
// packages/stack/src/plugins/your-plugin/api/index.ts
export * from "./plugin"
export { listItems, getItemById } from "./getters"
export { createItem, type CreateItemInput } from "./mutations"
```

---

### 4. Client plugin

**SSR loader** — prefetch data on the server. Always check `isConnectionError` in the catch block so a build-time `next build` failure is clearly signposted rather than silently producing an empty page.

```typescript
// packages/stack/src/plugins/your-plugin/client/plugin.tsx
import { defineClientPlugin, createRoute, createApiClient, isConnectionError } from "@btst/stack/plugins/client"
import { lazy } from "react"
import type { QueryClient } from "@tanstack/react-query"
import type { MyApiRouter } from "../api/plugin"

export interface MyClientConfig {
  queryClient: QueryClient
  apiBaseURL: string
  apiBasePath: string
  siteBaseURL: string
  siteBasePath: string
}

function myLoader(config: MyClientConfig) {
  return async () => {
    if (typeof window === "undefined") {
      const { queryClient, apiBaseURL, apiBasePath } = config
      try {
        const client = createApiClient<MyApiRouter>({ baseURL: apiBaseURL, basePath: apiBasePath })
        await queryClient.prefetchQuery({
          queryKey: ["your-plugin", "items"],
          queryFn: async () => (await client("/items", { method: "GET" })).data,
        })
      } catch (error) {
        if (isConnectionError(error)) {
          console.warn(
            "[btst/your-plugin] route.loader() failed — no server at build time. " +
            "Use myStack.api['your-plugin'].prefetchForRoute() for SSG.",
          )
        }
        // Do not re-throw — let React Query store errors and Error Boundaries handle them during render
      }
    }
  }
}

function myMeta(config: MyClientConfig) {
  return () => {
    const { siteBaseURL, siteBasePath } = config
    return [
      { title: "My Plugin" },
      { name: "description", content: "My plugin description." },
      { property: "og:url", content: `${siteBaseURL}${siteBasePath}/your-plugin` },
    ]
  }
}

export const myClientPlugin = (config: MyClientConfig) =>
  defineClientPlugin({
    name: "your-plugin",
    routes: () => ({
      list: createRoute("/your-plugin", () => {
        const ListPage = lazy(() =>
          import("./components/pages/list-page").then((m) => ({ default: m.ListPageComponent })),
        )
        return {
          PageComponent: ListPage,
          loader: myLoader(config),
          meta: myMeta(config),
        }
      }),
    }),
    sitemap: async () => [
      { url: `${config.siteBaseURL}${config.siteBasePath}/your-plugin`, lastModified: new Date(), priority: 0.7 },
    ],
  })
```

**Page component wrapper** (`list-page.tsx`) — wraps with `ComposedRoute` for Suspense + ErrorBoundary:

```typescript
// packages/stack/src/plugins/your-plugin/client/components/pages/list-page.tsx
"use client"
import { lazy } from "react"
import { ComposedRoute } from "@btst/stack/client/components"

// Lazy-load the actual page content — enables code splitting
const ListPageInternal = lazy(() =>
  import("./list-page.internal").then((m) => ({ default: m.ListPageInternal })),
)

function ListPageSkeleton() {
  return <div className="animate-pulse h-32 bg-muted rounded" />
}

export function ListPageComponent() {
  return (
    <ComposedRoute
      path="/your-plugin"
      PageComponent={ListPageInternal}
      LoadingComponent={ListPageSkeleton}
      ErrorComponent={({ error, resetErrorBoundary }) => (
        <div>
          <p>Something went wrong: {error.message}</p>
          <button onClick={resetErrorBoundary}>Retry</button>
        </div>
      )}
      NotFoundComponent={({ message }) => <div>Not found: {message}</div>}
    />
  )
}
```

**Internal page** (`list-page.internal.tsx`) — uses `useSuspenseQuery`, throws on refetch errors:

```typescript
// packages/stack/src/plugins/your-plugin/client/components/pages/list-page.internal.tsx
"use client"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createApiClient } from "@btst/stack/plugins/client"
import type { MyApiRouter } from "../../../api/plugin"

export function ListPageInternal() {
  const client = createApiClient<MyApiRouter>({ baseURL: "/api/data" })
  const { data, error, isFetching } = useSuspenseQuery({
    queryKey: ["your-plugin", "items"],
    queryFn: async () => (await client("/items", { method: "GET" })).data,
    staleTime: 60_000,
    retry: false,
  })

  // useSuspenseQuery only throws on the initial fetch — manually rethrow on refetch failure
  // so the parent ErrorBoundary catches it
  if (error && !isFetching) throw error

  return (
    <ul>
      {data?.map((item) => <li key={item.id}>{item.title}</li>)}
    </ul>
  )
}
```

---

### 5. Query keys

Create a shared key definition file to prevent the SSR and SSG paths from drifting out of sync:

```typescript
// packages/stack/src/plugins/your-plugin/api/query-key-defs.ts
export const YOUR_PLUGIN_QUERY_KEYS = {
  list: () => ["your-plugin", "items", "list"] as const,
  detail: (id: string) => ["your-plugin", "items", "detail", id] as const,
}
```

Import `YOUR_PLUGIN_QUERY_KEYS` in both `query-keys.ts` (HTTP client path) and `prefetchForRoute` (DB path) — never define the key shape in two places.

---

### 6. Page components

The `.tsx` / `.internal.tsx` split is important:

| File | Rendered where | What goes in it |
|------|---------------|-----------------|
| `list-page.tsx` | Server + Client | `ComposedRoute` wrapper with `lazy()`, Suspense/Error/NotFound components |
| `list-page.internal.tsx` | Client only | `useSuspenseQuery` calls, actual UI, mutable state |

Loading fallbacks must be provided to `ComposedRoute` unconditionally on **both** server and client — never guard them with `typeof window !== "undefined"`. Doing so shifts React's `useId()` counter and causes hydration mismatches in Radix primitives (`Select`, `Dialog`, etc.).

---

### 7. Build configuration

First-party plugins inside `packages/stack/` must be registered in two files.

**`packages/stack/build.config.ts`** — add entries for each export path:

```typescript
entries: [
  // ... existing entries
  // your-plugin entries
  "./src/plugins/your-plugin/api/index.ts",
  "./src/plugins/your-plugin/client/index.ts",
  "./src/plugins/your-plugin/client/hooks/index.tsx",
  "./src/plugins/your-plugin/client/components/index.tsx",
  "./src/plugins/your-plugin/query-keys.ts",
]
```

**`packages/stack/package.json`** — add both `exports` and `typesVersions` for every entry point:

```json
{
  "exports": {
    "./plugins/your-plugin/api": {
      "import": "./dist/plugins/your-plugin/api/index.mjs",
      "require": "./dist/plugins/your-plugin/api/index.cjs"
    },
    "./plugins/your-plugin/client": {
      "import": "./dist/plugins/your-plugin/client/index.mjs",
      "require": "./dist/plugins/your-plugin/client/index.cjs"
    },
    "./plugins/your-plugin/css": "./dist/plugins/your-plugin/client.css"
  },
  "typesVersions": {
    "*": {
      "plugins/your-plugin/api":    ["./dist/plugins/your-plugin/api/index.d.ts"],
      "plugins/your-plugin/client": ["./dist/plugins/your-plugin/client/index.d.ts"]
    }
  }
}
```

**CSS** — if your plugin ships UI components, add the CSS export entry to `packages/stack/package.json` (`"./plugins/your-plugin/css": "./dist/plugins/your-plugin/client.css"`). CSS files are auto-discovered and copied by `postbuild.cjs` — no manual registration needed.

---

### 8. Register in example apps

All three example apps must be updated when a new first-party plugin is added:

| App | Files to update |
|-----|----------------|
| `examples/nextjs/` | `lib/stack.tsx`, `lib/stack-client.tsx`, `app/pages/[[...all]]/layout.tsx`, `app/globals.css` |
| `examples/react-router/` | `app/lib/stack.tsx`, `app/lib/stack-client.tsx`, `app/routes/pages/_layout.tsx`, `app/app.css` |
| `examples/tanstack/` | `src/lib/stack.tsx`, `src/lib/stack-client.tsx`, `src/routes/pages/route.tsx`, `src/styles/app.css` |

In each layout file, add your plugin's overrides type:

```typescript
import type { MyPluginOverrides } from "@btst/stack/plugins/your-plugin/client"

type PluginOverrides = {
  blog: BlogPluginOverrides,
  "your-plugin": MyPluginOverrides,  // add your plugin here
}
```

In each CSS file:

```css
@import "@btst/stack/plugins/your-plugin/css";
```

---

## Testing

### Unit tests (Vitest)

Place unit tests at `packages/stack/src/plugins/your-plugin/__tests__/`. The pattern from [`packages/stack/src/plugins/blog/__tests__/getters.test.ts`](packages/stack/src/plugins/blog/__tests__/getters.test.ts):

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { createMemoryAdapter } from "@btst/adapter-memory"
import { defineDb } from "@btst/db"
import { mySchema } from "../db"
import { listItems, getItemById } from "../api/getters"

const createTestAdapter = () => {
  const db = defineDb({}).use(mySchema)
  return createMemoryAdapter(db)({})
}

describe("your-plugin getters", () => {
  let adapter: ReturnType<typeof createTestAdapter>

  beforeEach(() => {
    adapter = createTestAdapter()
  })

  it("returns empty list when no items exist", async () => {
    const items = await listItems(adapter)
    expect(items).toEqual([])
  })

  it("returns item by id", async () => {
    const created = await adapter.create({
      model: "item",
      data: { title: "Hello", published: false, createdAt: new Date(), updatedAt: new Date() },
    })
    const found = await getItemById(adapter, created.id)
    expect(found?.title).toBe("Hello")
  })
})
```

Run unit tests from the package root:

```bash
cd packages/stack
pnpm test
```

### E2E tests (Playwright)

Add a smoke test file at `e2e/tests/smoke.your-plugin.spec.ts`. The pattern from [`e2e/tests/smoke.blog.spec.ts`](e2e/tests/smoke.blog.spec.ts):

```typescript
import { test, expect } from "@playwright/test"

test.describe("Your Plugin", () => {
  test("list page loads and shows items", async ({ page, request }) => {
    const errors: string[] = []
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text())
    })

    // Seed test data via the API
    await request.post("/api/data/items", {
      data: { title: "Test Item" },
    })

    await page.goto("/pages/your-plugin", { waitUntil: "networkidle" })
    await expect(page.locator('[data-testid="your-plugin-list"]')).toBeVisible()
    await expect(page.getByText("Test Item")).toBeVisible()

    expect(errors).toHaveLength(0)
  })
})
```

Run the full E2E suite (starts all three example apps):

```bash
cd e2e
export $(cat ../examples/nextjs/.env | xargs)
pnpm e2e:smoke
```

Run against a single framework only (starts only that framework's server — faster):

```bash
pnpm e2e:smoke:nextjs
pnpm e2e:smoke:tanstack
pnpm e2e:smoke:react-router
```

Run a single test file:

```bash
pnpm e2e:smoke -- tests/smoke.your-plugin.spec.ts
```

Run against a specific Playwright project:

```bash
pnpm e2e:smoke -- --project="nextjs:memory"
```

Tests run against three Playwright projects: `nextjs:memory` (port 3003), `tanstack:memory` (3004), `react-router:memory` (3005). In CI, each framework runs as a separate parallel job via a matrix strategy.

---

## Documentation

Create `docs/content/docs/plugins/your-plugin.mdx`. Use `AutoTypeTable` to render TypeScript interfaces directly from source — this means JSDoc comments on exported types become the docs.

```mdx
---
title: Your Plugin
description: Brief description for SEO and the docs sidebar
---

Learn how to set up the Your Plugin.

## Installation

\`\`\`bash
npm install @btst/stack
\`\`\`

## Configuration

<AutoTypeTable path="packages/stack/src/plugins/your-plugin/client/overrides.ts" name="MyPluginOverrides" />

## Hooks

<AutoTypeTable path="packages/stack/src/plugins/your-plugin/api/plugin.ts" name="MyBackendHooks" />
```

Preview locally:

```bash
cd docs
pnpm dev
```

**Update docs whenever you make consumer-facing changes** — new props, new hooks, changed behavior, or breaking changes.

---

## Shadcn registry

Plugin page components are published as a shadcn v4 registry so consumers can eject and customize the UI layer.

### Install a plugin's pages

```bash
# Blog pages (replace "blog" with any plugin name)
npx shadcn@latest add "https://raw.githubusercontent.com/better-stack-ai/better-stack/main/packages/stack/registry/btst-blog.json"
```

Files are installed into `src/components/btst/{plugin}/client/` with all relative imports preserved. Data-fetching hooks remain in `@btst/stack`.

When a plugin exposes `pageComponents` on its client config, wire the ejected routable pages back in through that option. If a plugin intentionally does not support `pageComponents`, document the direct-import rendering pattern clearly in the plugin docs and the shared shadcn registry guide.

### Rebuild the registry locally

```bash
pnpm --filter @btst/stack build-registry
```

Output goes to `packages/stack/registry/`. These files are committed and must be regenerated whenever plugin UI components change.

### Run the end-to-end registry test

```bash
pnpm --filter @btst/stack test-registry
```

This builds the registry, packs `@btst/stack`, spins up a blank Next.js project, installs every plugin via `shadcn add`, and runs `npm run build` to confirm it compiles.

The GitHub Actions workflow (`.github/workflows/registry.yml`) runs this automatically on PRs that touch plugin source files and auto-commits updated registry JSON if anything changed.

### Adding a new plugin to the registry

1. Add a `PluginConfig` entry to the `PLUGINS` array in `packages/stack/scripts/build-registry.ts`.
2. Run `pnpm --filter @btst/stack build-registry` to regenerate the JSONs.
3. Run `pnpm --filter @btst/stack test-registry` locally to validate end-to-end.
4. Commit the updated registry files alongside your plugin changes.

---

## Submission checklist

Before opening a pull request for a new plugin, verify every item:

**Plugin implementation**

- [ ] Backend plugin: `name`, `dbPlugin`, and `routes` are all present
- [ ] Client plugin: `name` and `routes` are present
- [ ] `api/getters.ts` contains only pure DB reads — no HTTP context, no lifecycle hooks
- [ ] `api/getters.ts` has JSDoc noting "Authorization hooks are NOT called"
- [ ] `api/mutations.ts` (if present) has JSDoc noting "Authorization hooks are NOT called"
- [ ] `api/index.ts` re-exports all public backend surface (getters, mutations, types, router type)
- [ ] `api/query-key-defs.ts` defines shared key shapes imported by both `query-keys.ts` and `prefetchForRoute`
- [ ] `api/serializers.ts` converts `Date` fields to ISO strings before `setQueryData`
- [ ] Every loader `catch` block calls `isConnectionError` and logs a build-time warning
- [ ] All page components are wrapped with `ComposedRoute`
- [ ] Loading fallbacks are provided unconditionally (not guarded by `typeof window`)
- [ ] `useSuspenseQuery` hooks rethrow on refetch errors: `if (error && !isFetching) throw error`

**Build**

- [ ] `packages/stack/build.config.ts` — entries added for each new export path
- [ ] `packages/stack/package.json` — `exports` and `typesVersions` added for each entry
- [ ] CSS exported in `package.json` if the plugin ships UI components (`postbuild.cjs` auto-discovers CSS files — no changes needed there)
- [ ] `pnpm build` passes with no errors

**Type checking and linting**

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

**Example apps**

- [ ] `examples/nextjs/` — stack, stack-client, layout, CSS updated
- [ ] `examples/react-router/` — stack, stack-client, layout, CSS updated
- [ ] `examples/tanstack/` — stack, stack-client, layout, CSS updated

**Tests**

- [ ] Unit tests added at `packages/stack/src/plugins/your-plugin/__tests__/`
- [ ] E2E smoke test added at `e2e/tests/smoke.your-plugin.spec.ts`
- [ ] `pnpm test` passes (unit tests)
- [ ] `pnpm e2e:smoke -- tests/smoke.your-plugin.spec.ts` passes

**Documentation**

- [ ] `docs/content/docs/plugins/your-plugin.mdx` created
- [ ] All exported types and interfaces have JSDoc comments
- [ ] `cd docs && pnpm dev` renders without errors

---

## Reference implementations

| Complexity | Plugin | Source |
|------------|--------|--------|
| Simple (CRUD) | Todo plugin | [`examples/nextjs/lib/plugins/todo/`](examples/nextjs/lib/plugins/todo/) |
| Full-featured | Blog plugin | [`packages/stack/src/plugins/blog/`](packages/stack/src/plugins/blog/) |
