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

### Local development and testing

The monorepo uses **codegen projects** as the primary development and testing environment. These projects are built from scratch by the `btst init` CLI and are never committed to git.

```bash
# Build the Next.js codegen project (takes ~2–3 min)
bash scripts/codegen/setup-nextjs.sh

# Start the dev server for browsing and debugging
pnpm -F nextjs dev

# Run E2E tests against it
pnpm -F e2e codegen:e2e:nextjs

# Clean up when done or to start fresh
bash scripts/codegen/cleanup.sh nextjs
```

See `scripts/codegen/README.md` for detailed instructions on the E2E overlay file workflow and troubleshooting.

### New plugins

See the full [plugin development guide](#plugin-development-guide) below.

If you want to publish a plugin as a standalone npm package (not merged into this repo), use the **[Plugin Starter](https://github.com/better-stack-ai/plugin-starter)** — it provides a pre-configured build, example app, and CI pipeline.

---

## Plugin development guide

### Plugin anatomy

A plugin may expose either or both of these independent halves:

| Half | Entry point | Factory function | Import path |
|------|-------------|------------------|-------------|
| Backend | `api/plugin.ts` | `defineBackendPlugin` | `@btst/stack/plugins/api` |
| Client | `client/plugin.tsx` | `defineClientPlugin` | `@btst/stack/plugins/client` |

Do not add a placeholder half for symmetry. OpenAPI is backend-only, Route Docs
is client-only, and UI Builder is client-only over CMS. When both halves exist,
their camelCase programmatic ID and registration key must agree; package and
URL slugs may remain kebab-case.

**Minimum backend shape:**

```typescript
import { defineBackendPlugin, createEndpoint } from "@btst/stack/plugins/api"

export interface MyBackendPluginOptions {
  hooks?: MyBackendHooks
}

export const myBackendPlugin = (options: MyBackendPluginOptions = {}) =>
  defineBackendPlugin({
    id: "myPlugin", // camelCase programmatic ID; package and URL slugs may stay kebab-case
    dbPlugin: mySchema,
    operations: (adapter) => createMyOperations(adapter, options.hooks),
    routes: (_adapter, _context, operations) => {
      const listItems = createEndpoint(
        "/items",
        { method: "GET", requireRequest: true },
        operations.listItems.route(() => ({})),
      )
      return { listItems } as const
    },
  })

// Export the inferred router type — the client plugin imports this for end-to-end type safety
export type MyApiRouter = ReturnType<ReturnType<typeof myBackendPlugin>["routes"]>
```

**Minimum client shape:**

```typescript
import {
  defineClientPlugin,
  defineRoute,
  type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client"
import { lazy } from "react"

export const MY_PLUGIN_ID = "myPlugin" as const

export interface MyClientConfig {
  title?: string
}

const ListPage = lazy(() => import("./components/list-page"))

function createResolvedPlugin(
  config: MyClientConfig,
  runtime: ResolvedClientPluginRuntime<typeof MY_PLUGIN_ID>,
) {
  const resolvedConfig = {
    title: config.title ?? "My Plugin",
    queryClient: runtime.queryClient,
    apiBaseURL: runtime.api.baseURL,
    apiBasePath: runtime.api.basePath,
    siteBaseURL: runtime.site.baseURL,
    siteBasePath: runtime.site.basePath,
    headers: runtime.api.headers,
    credentials: runtime.api.credentials,
  }
  return {
    routes: () => ({
      list: defineRoute("/my-plugin", {
        page: ListPage,
        loader: myLoader(resolvedConfig),
        meta: myMeta(resolvedConfig),
      }),
    }),
  }
}

export const myClientPlugin = (config: MyClientConfig = {}) =>
  defineClientPlugin()({
    id: MY_PLUGIN_ID,
    resolve: (runtime) => createResolvedPlugin(config, runtime),
  })
```

API, site, QueryClient, headers, and credentials are configured once on
`createClientStack()`. Client plugin options contain only plugin-specific
choices; `resolve(runtime)` binds the shared runtime.

**Backend hook naming conventions:**

```typescript
// Pre-execution lifecycle hooks (throw to stop execution after authorization)
onBeforeCreateItem, onBeforeUpdateItem, onBeforeDeleteItem, onBeforeListItems
// Lifecycle hooks (called after success)
onAfterCreateItem, onAfterUpdateItem, onAfterDeleteItem, onAfterListItems
// Error hooks
onErrorCreateItem, onErrorUpdateItem, onErrorDeleteItem, onErrorListItems
```

---

### File structure template

The blog plugin at [`packages/stack/src/plugins/blog/`](packages/stack/src/plugins/blog/) is the canonical reference implementation. Use this layout for a new plugin:

```
packages/stack/src/plugins/your-plugin/
├── db.ts                       # createDbPlugin(...) — database schema definition
├── types.ts                    # Shared TypeScript types (no framework dependencies)
├── schemas.ts                  # Zod validation schemas for request bodies
├── permissions.ts              # Shared authorization descriptor catalog
├── query-keys.ts               # React Query key factory (imports from api/query-key-defs.ts)
├── client.css                  # Plugin CSS (Tailwind source directives, component styles)
├── style.css                   # Full styles including Tailwind @source directives
├── api/
│   ├── plugin.ts               # defineBackendPlugin, RouteKey type, prefetchForRoute factory
│   ├── getters.ts              # Pure DB read functions — no hooks, no HTTP context
│   ├── mutations.ts            # Server-side write functions — no hooks, no HTTP context
│   ├── operations.ts           # Validation, authorization, lifecycle, and execution
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

Not every file is required for a minimal plugin. A backend plugin starts with
`db.ts`, `types.ts`, `permissions.ts`, `api/operations.ts`, and `api/plugin.ts`;
a client half starts with `client/plugin.tsx`. Add the optional query, style,
and component files as the plugin grows.

---

### 1. Database schema

Define your data models using `createDbPlugin`. Field types: `string`, `boolean`, `number`, `date`.

```typescript
// packages/stack/src/plugins/your-plugin/db.ts
import { createDbPlugin } from "@btst/stack/plugins/api"

export const mySchema = createDbPlugin("yourPlugin", {
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

```typescript
// packages/stack/src/plugins/your-plugin/permissions.ts
import { definePermissions, permission } from "@btst/stack/authorization"

export const myPermissions = definePermissions("yourPlugin", {
  item: {
    list: permission(),
    create: permission(),
    update: permission(),
    delete: permission(),
  },
})
```

---

### 3. Backend plugin

**`api/getters.ts`** — pure DB reads, safe for SSG and scripts. Operation
validation, authorization, and lifecycle hooks are **not** called here; callers
own those concerns.

```typescript
// packages/stack/src/plugins/your-plugin/api/getters.ts
import type { DBAdapter as Adapter } from "@btst/db"
import type { Item } from "../types"

/**
 * Returns all items sorted newest-first.
 * Operation validation, authorization, and lifecycle hooks are NOT called.
 */
export async function listItems(adapter: Adapter): Promise<Item[]> {
  return adapter.findMany<Item>({
    model: "item",
    sortBy: { field: "createdAt", direction: "desc" },
  }) as Promise<Item[]>
}

/**
 * Returns a single item by ID, or null.
 * Operation validation, authorization, and lifecycle hooks are NOT called.
 */
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
import type { DBAdapter as Adapter } from "@btst/db"
import type { Item } from "../types"

export interface CreateItemInput { title: string; published?: boolean }
export interface UpdateItemInput { title?: string; published?: boolean }

/**
 * Create an item directly in the database.
 *
 * @remarks Operation validation, authorization, and lifecycle hooks are NOT
 * called. The caller owns those concerns.
 */
export async function createItem(adapter: Adapter, input: CreateItemInput): Promise<Item> {
  return adapter.create<Item>({
    model: "item",
    data: {
      ...input,
      published: input.published ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
}

/**
 * @remarks Operation validation, authorization, and lifecycle hooks are NOT
 * called. The caller owns those concerns.
 */
export async function updateItem(
  adapter: Adapter,
  id: string,
  input: UpdateItemInput,
): Promise<Item | null> {
  return adapter.update<Item>({
    model: "item",
    where: [{ field: "id", value: id }],
    update: { ...input, updatedAt: new Date() },
  })
}

/**
 * @remarks Operation validation, authorization, and lifecycle hooks are NOT
 * called. The caller owns those concerns.
 */
export async function deleteItem(adapter: Adapter, id: string): Promise<void> {
  await adapter.delete<Item>({
    model: "item",
    where: [{ field: "id", value: id }],
  })
}
```

**`api/operations.ts`** — the single validated, authorized operation inventory
used by HTTP routes, request-scoped server calls, and trusted jobs:

```typescript
// packages/stack/src/plugins/your-plugin/api/operations.ts
import type { DBAdapter as Adapter } from "@btst/db"
import { defineOperation } from "@btst/stack/plugins/api"
import { z } from "zod"
import { myPermissions } from "../permissions"
import { createItemSchema, updateItemSchema } from "../schemas"
import type { Item } from "../types"
import { listItems } from "./getters"
import {
  createItem,
  deleteItem,
  updateItem,
} from "./mutations"

export interface MyBackendHooks {
  onBeforeCreateItem?: (data: unknown, ctx: { headers?: Headers }) => Promise<void> | void
  onAfterCreateItem?: (item: unknown, ctx: { headers?: Headers }) => Promise<void> | void
  onErrorCreateItem?: (error: Error, ctx: { headers?: Headers }) => Promise<void> | void
}

const updateOperationSchema = z.object({
  id: z.string(),
  data: updateItemSchema,
})
const itemIdSchema = z.object({ id: z.string() })

function serializeItem(item: Item) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  }
}

const hookContext = (request?: Request) => ({
  ...(request ? { headers: request.headers } : {}),
})

export function createMyOperations(
  adapter: Adapter,
  hooks?: MyBackendHooks,
) {
  const listItemsOperation = defineOperation({
    input: z.object({}),
    permission: myPermissions.item.list,
    facts: () => undefined,
    execute: async () => (await listItems(adapter)).map(serializeItem),
  })

  const createItemOperation = defineOperation({
    input: createItemSchema,
    permission: myPermissions.item.create,
    facts: () => undefined,
    before: async ({ input, request }) => {
      await hooks?.onBeforeCreateItem?.(input, hookContext(request))
    },
    execute: async ({ input }) => serializeItem(await createItem(adapter, input)),
    after: async ({ result, request }) => {
      await hooks?.onAfterCreateItem?.(result, hookContext(request))
    },
    onError: async ({ error, request }) => {
      const cause = error instanceof Error ? error : new Error("Create item failed")
      await hooks?.onErrorCreateItem?.(cause, hookContext(request))
    },
  })

  const updateItemOperation = defineOperation({
    input: updateOperationSchema,
    permission: myPermissions.item.update,
    facts: () => undefined,
    execute: async ({ input }) => {
      const item = await updateItem(adapter, input.id, input.data)
      if (!item) throw new Error("Item not found")
      return serializeItem(item)
    },
  })

  const deleteItemOperation = defineOperation({
    input: itemIdSchema,
    permission: myPermissions.item.delete,
    facts: () => undefined,
    execute: async ({ input }) => {
      await deleteItem(adapter, input.id)
      return { success: true } as const
    },
  })

  return {
    listItems: listItemsOperation,
    createItem: createItemOperation,
    updateItem: updateItemOperation,
    deleteItem: deleteItemOperation,
  } as const
}
```

**`api/plugin.ts`** — the main backend plugin definition:

```typescript
// packages/stack/src/plugins/your-plugin/api/plugin.ts
import { defineBackendPlugin, createEndpoint } from "@btst/stack/plugins/api"
import { mySchema } from "../db"
import { createItemSchema, updateItemSchema } from "../schemas"
import { createMyOperations, type MyBackendHooks } from "./operations"

export interface MyBackendPluginOptions {
  hooks?: MyBackendHooks
}

export const myBackendPlugin = (options: MyBackendPluginOptions = {}) =>
  defineBackendPlugin({
    id: "yourPlugin",
    dbPlugin: mySchema,
    operations: (adapter) => createMyOperations(adapter, options.hooks),
    routes: (_adapter, _context, operations) => {
      const listItems = createEndpoint(
        "/items",
        { method: "GET", requireRequest: true },
        operations.listItems.route(() => ({})),
      )
      const createItem = createEndpoint(
        "/items",
        { method: "POST", body: createItemSchema, requireRequest: true },
        operations.createItem.route((ctx) => ctx.body),
      )
      const updateItem = createEndpoint(
        "/items/:id",
        { method: "PUT", body: updateItemSchema, requireRequest: true },
        operations.updateItem.route((ctx) => ({ id: ctx.params.id, data: ctx.body })),
      )
      const deleteItem = createEndpoint(
        "/items/:id",
        { method: "DELETE", requireRequest: true },
        operations.deleteItem.route((ctx) => ({ id: ctx.params.id })),
      )
      return { listItems, createItem, updateItem, deleteItem } as const
    },
  })

export type MyApiRouter = ReturnType<ReturnType<typeof myBackendPlugin>["routes"]>
```

**`api/index.ts`** — barrel re-export:

```typescript
// packages/stack/src/plugins/your-plugin/api/index.ts
export * from "./plugin"
export { createMyOperations, type MyBackendHooks } from "./operations"
export { listItems, getItemById } from "./getters"
export {
  createItem,
  deleteItem,
  updateItem,
  type CreateItemInput,
  type UpdateItemInput,
} from "./mutations"
export { myPermissions } from "../permissions"
```

---

### 4. Client plugin

**SSR loader** — prefetch data on the server. Always check `isConnectionError` in the catch block so a build-time `next build` failure is clearly signposted rather than silently producing an empty page.

```typescript
// packages/stack/src/plugins/your-plugin/client/plugin.tsx
import {
  createApiClient,
  defineClientPlugin,
  defineRoute,
  isConnectionError,
  type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client"
import { lazy } from "react"
import type { QueryClient } from "@tanstack/react-query"
import type { MyApiRouter } from "../api/plugin"

export const MY_PLUGIN_ID = "yourPlugin" as const

export interface MyClientConfig {
  title?: string
}

interface ResolvedMyClientConfig {
  title: string
  queryClient: QueryClient
  apiBaseURL: string
  apiBasePath: string
  siteBaseURL: string
  siteBasePath: string
  headers?: Headers
  credentials?: RequestCredentials
}

function resolveMyClientConfig(
  config: MyClientConfig,
  runtime: ResolvedClientPluginRuntime<typeof MY_PLUGIN_ID>,
): ResolvedMyClientConfig {
  return {
    title: config.title ?? "My Plugin",
    queryClient: runtime.queryClient,
    apiBaseURL: runtime.api.baseURL,
    apiBasePath: runtime.api.basePath,
    siteBaseURL: runtime.site.baseURL,
    siteBasePath: runtime.site.basePath,
    ...(runtime.api.headers ? { headers: runtime.api.headers } : {}),
    ...(runtime.api.credentials
      ? { credentials: runtime.api.credentials }
      : {}),
  }
}

function myLoader(config: ResolvedMyClientConfig) {
  return async () => {
    if (typeof window === "undefined") {
      const { queryClient, apiBaseURL, apiBasePath, headers, credentials } = config
      try {
        const client = createApiClient<MyApiRouter>({
          baseURL: apiBaseURL,
          basePath: apiBasePath,
          headers,
          credentials,
        })
        await queryClient.prefetchQuery({
          queryKey: ["your-plugin", "items"],
          queryFn: async () => (await client("/items", { method: "GET" })).data,
        })
      } catch (error) {
        if (isConnectionError(error)) {
          console.warn(
            "[btst/your-plugin] route.loader() failed — no server at build time. " +
            "Use myStack.raw.yourPlugin.prefetchForRoute() for SSG.",
          )
        }
        // Do not re-throw — let React Query store errors and Error Boundaries handle them during render
      }
    }
  }
}

function myMeta(config: ResolvedMyClientConfig) {
  return () => {
    const { siteBaseURL, siteBasePath } = config
    return [
      { title: config.title },
      { name: "description", content: "My plugin description." },
      { property: "og:url", content: `${siteBaseURL}${siteBasePath}/your-plugin` },
    ]
  }
}

const ListPage = lazy(() =>
  import("./components/pages/list-page").then((m) => ({ default: m.ListPageComponent })),
)

function createResolvedMyPlugin(config: ResolvedMyClientConfig) {
  return {
    routes: () => ({
      list: defineRoute("/your-plugin", {
        page: ListPage,
        loader: myLoader(config),
        meta: myMeta(config),
      }),
    }),
    sitemap: async () => [
      { url: `${config.siteBaseURL}${config.siteBasePath}/your-plugin`, lastModified: new Date(), priority: 0.7 },
    ],
  }
}

export const myClientPlugin = (config: MyClientConfig = {}) =>
  defineClientPlugin()({
    id: MY_PLUGIN_ID,
    resolve: (runtime) =>
      createResolvedMyPlugin(resolveMyClientConfig(config, runtime)),
  })
```

The public factory accepts only plugin-specific options. Consumers configure
the shared API, site, QueryClient, and optional request headers once on
`createClientStack()`.

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

### 8. Register the plugin in the CLI and codegen project

When a new first-party plugin is added, update the CLI constants so `btst init` knows about it:

**`packages/cli/src/utils/constants.ts`** — add a `PluginMeta` entry to the `PLUGINS` array with the plugin's import paths, symbols, and config key.

Then register it in the codegen project overlay files:

**`scripts/codegen/files/nextjs/lib/stack.ts`** — add the backend plugin registration.

**`scripts/codegen/files/nextjs/lib/stack-client.tsx`** — add the client plugin registration.

**`scripts/codegen/files/nextjs/app/pages/client-layout.tsx`** — add the shared client `StackProvider` override entry. Keep trusted request-origin hydration in `app/(request)/pages/layout.tsx` and the header-free SSG/ISR wrapper in `app/(static)/pages/layout.tsx`.

Add the plugin CSS to `app/globals.css` if it ships styles:

```css
@import "@btst/stack/plugins/your-plugin/css";
```

To apply and test your changes:

```bash
bash scripts/codegen/cleanup.sh nextjs
bash scripts/codegen/setup-nextjs.sh
pnpm -F e2e codegen:e2e:nextjs
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

Run the E2E suite against the codegen project (primary):

```bash
# Build the codegen project first (one-time)
bash scripts/codegen/setup-nextjs.sh

cd e2e
pnpm codegen:e2e:nextjs

# Run a single test file
pnpm codegen:e2e:nextjs -- tests/smoke.your-plugin.spec.ts
```

Tests run against `nextjs:codegen` (port 3006). CI runs the full suite via `.github/workflows/codegen-e2e.yml`, which builds the codegen project from scratch on every run.

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

<AutoTypeTable path="packages/stack/src/plugins/your-plugin/api/operations.ts" name="MyBackendHooks" />
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

- [ ] Backend plugin: camelCase `id`, `dbPlugin`, `operations`, and operation-bound `routes` are present
- [ ] Client plugin: the matching camelCase `id` and `resolve(runtime)` returning `routes` are present
- [ ] `api/getters.ts` contains only pure DB reads — no HTTP context, no lifecycle hooks
- [ ] `api/getters.ts` has JSDoc noting operation validation, authorization, and lifecycle hooks are not called
- [ ] `api/mutations.ts` (if present) has the same JSDoc and says the caller owns those concerns
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

**CLI and codegen project**

- [ ] `packages/cli/src/utils/constants.ts` — `PLUGINS` array updated with new plugin entry
- [ ] `scripts/codegen/files/nextjs/lib/stack.ts` — backend plugin registered
- [ ] `scripts/codegen/files/nextjs/lib/stack-client.tsx` — client plugin registered
- [ ] `scripts/codegen/files/nextjs/app/pages/client-layout.tsx` — StackProvider overrides added; request/static wrappers remain origin-safe
- [ ] Codegen project rebuilt and E2E passes: `bash scripts/codegen/setup-nextjs.sh && pnpm -F e2e codegen:e2e:nextjs`

**Tests**

- [ ] Unit tests added at `packages/stack/src/plugins/your-plugin/__tests__/`
- [ ] E2E smoke test added at `e2e/tests/smoke.your-plugin.spec.ts`
- [ ] `pnpm test` passes (unit tests)
- [ ] `cd e2e && pnpm codegen:e2e:nextjs -- tests/smoke.your-plugin.spec.ts` passes

**Documentation**

- [ ] `docs/content/docs/plugins/your-plugin.mdx` created
- [ ] All exported types and interfaces have JSDoc comments
- [ ] `cd docs && pnpm dev` renders without errors

---

## Reference implementations

| Complexity | Plugin | Source |
|------------|--------|--------|
| Simple (CRUD) | Todo plugin | [`scripts/codegen/files/nextjs/lib/plugins/todo/`](scripts/codegen/files/nextjs/lib/plugins/todo/) |
| Full-featured | Blog plugin | [`packages/stack/src/plugins/blog/`](packages/stack/src/plugins/blog/) |
