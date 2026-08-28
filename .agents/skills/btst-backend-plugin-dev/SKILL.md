---
name: btst-backend-plugin-dev
description: Patterns for writing BTST backend plugins inside the monorepo, including operation-first authorization, getters.ts/mutations.ts separation, lifecycle hooks, and narrow SSG api factories. Use when creating or modifying a backend plugin, adding DB getters or mutations, operations, permission descriptors, or lifecycle hooks in src/plugins/{name}/api/.
---

# BTST Backend Plugin Development

## File structure

```
src/plugins/{name}/
  api/
    plugin.ts        ← defineBackendPlugin entry
    getters.ts       ← read-only DB functions (no HTTP context)
    mutations.ts     ← lower-level write DB functions
    operations.ts    ← validated operations, permission facts, lifecycle
    index.ts         ← re-exports getters + mutations + types
  query-keys.ts      ← React Query key factory
```

## Rules

- **`getters.ts`** — pure async DB functions only. No HTTP context, no lifecycle hooks. Always takes `adapter` as first arg.
- **`mutations.ts`** — lower-level write primitives. No HTTP context or lifecycle composition. Document that callers own validation and lifecycle.
- **`api/index.ts`** — re-export everything from getters + mutations for direct server-side import.
- **`operations.ts`** — define the one maintained business inventory with input validation, exact permission descriptors, authoritative facts, domain execution, and lifecycle hooks.
- Bind HTTP routes to same-key operations. Use `operationRouteMap` only for real route-name mismatches.
- The optional `api` factory is narrow: first-party plugins expose only `prefetchForRoute` for SSG. Do not duplicate business getters or mutations on `stack().api`.
- Use `myStack.forRequest(request).api.*` for request work and `myStack.internal.*` for explicitly trusted jobs.

## Key patterns

- Import `defineBackendPlugin` and `createEndpoint` from `"@btst/stack/plugins/api"` (not `@btst/stack/plugins`).
- Import the adapter type as `import type { DBAdapter as Adapter } from "@btst/db"`.
- Routes are defined with `createEndpoint(path, { method, query?, body? }, handler)` — not string-keyed `"GET /path"` objects.
- Route handlers return data directly (`return item`) — no `ctx.json()`.
- Throw errors with `throw ctx.error(statusCode, { message })`.
- The `routes` factory returns a named object: `return { listItems, createItem } as const`.
- Export the router type as `ReturnType<ReturnType<typeof myBackendPlugin>["routes"]>`.

## Lifecycle hook naming

Pattern: `onBefore{Entity}{Action}`, `onAfter{Entity}{Action}`, `on{Entity}{Action}Error`

```typescript
// Examples from existing plugins:
onBeforeListPosts, onPostsRead, onListPostsError
onBeforeCreatePost, onPostCreated, onCreatePostError
onBeforeUpdatePost, onPostUpdated, onUpdatePostError
onBeforeDeletePost, onPostDeleted, onDeletePostError
onBeforePost, onAfterPost          // comments plugin (create comment)
onBeforeEdit, onAfterEdit          // comments plugin (edit comment)
onBeforeDelete, onAfterDelete      // comments plugin (delete comment)
onBeforeStatusChange, onAfterApprove
```

## Trusted operations in AI tool execute functions

`myStack` is a module-level const. The `execute` closure runs lazily (only on HTTP request), so `myStack` is always initialised by then:

```typescript
export const myStack = stack({ ... })

const myTool = tool({
  execute: async (params) => {
		await myStack.internal.kanban.createTask({
			title: params.title,
			columnId: "col-id",
		})
    return { success: true }
  }
})
```

## Gotchas

- **Wrong import path** — always import from `"@btst/stack/plugins/api"`, not `"@btst/stack/plugins"`.
- **Wrong adapter type** — use `import type { DBAdapter as Adapter } from "@btst/db"` in getters/mutations/plugin files.
- **`"GET /path"` string keys** — routes use `createEndpoint()`, not string-keyed method/path objects.
- **`ctx.json()`** — does not exist; return data directly from route handlers.
- **Business methods on `stack().api`** — do not add them. Keep the trusted lifecycle explicit through `internal` and reserve `api` for SSG prefetch.
- **Authorization in lifecycle hooks** — routine access control belongs in operation descriptors and the one shared rule. Hooks receive already-authorized context.
- **Write ops in `getters.ts`** — write functions belong in `mutations.ts`, not `getters.ts`.

## Full code patterns

See [REFERENCE.md](REFERENCE.md) for complete `defineBackendPlugin`, getters, mutations, and `api/index.ts` code shapes.
