---
name: btst-backend-plugin-dev
description: Patterns for writing BTST backend plugins inside the monorepo, including defineBackendPlugin structure, getters.ts/mutations.ts separation, the api factory, lifecycle hook naming conventions, and accessing the adapter in AI tool execute functions. Use when creating or modifying a backend plugin, adding DB getters or mutations, wiring the api factory, or implementing lifecycle hooks in src/plugins/{name}/api/.
---

# BTST Backend Plugin Development

## File structure

```
src/plugins/{name}/
  api/
    plugin.ts        ← defineBackendPlugin entry
    getters.ts       ← read-only DB functions (no HTTP context)
    mutations.ts     ← write DB functions (no auth hooks)
    index.ts         ← re-exports getters + mutations + types
  query-keys.ts      ← React Query key factory
```

## Rules

- **`getters.ts`** — pure async DB functions only. No HTTP context, no lifecycle hooks. Always takes `adapter` as first arg.
- **`mutations.ts`** — write operations (create/update/delete). No auth hooks, no HTTP context. Add JSDoc: "Authorization hooks are NOT called."
- **`api/index.ts`** — re-export everything from getters + mutations for direct server-side import.
- The `api` factory and `routes` factory share the same adapter instance — bind getters inside the factory, don't pass adapter at call site.
- If the plugin has a one-time init step (e.g. `syncContentTypes`), call it inside each getter/mutation wrapper — not only inside `routes`.
- **Never** use `myStack.api.*` as a substitute for authenticated HTTP endpoints — auth hooks are not called.

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

## Adapter in AI tool execute functions

`myStack` is a module-level const. The `execute` closure runs lazily (only on HTTP request), so `myStack` is always initialised by then:

```typescript
export const myStack = stack({ ... })

const myTool = tool({
  execute: async (params) => {
    await createKanbanTask(myStack.adapter, { title: params.title, columnId: "col-id" })
    return { success: true }
  }
})
```

## Gotchas

- **Wrong import path** — always import from `"@btst/stack/plugins/api"`, not `"@btst/stack/plugins"`.
- **Wrong adapter type** — use `import type { DBAdapter as Adapter } from "@btst/db"` in getters/mutations/plugin files.
- **`"GET /path"` string keys** — routes use `createEndpoint()`, not string-keyed method/path objects.
- **`ctx.json()`** — does not exist; return data directly from route handlers.
- **`stack().api` bypasses auth hooks** — never use for authenticated data access; enforce auth at the call site.
- **Plugin init not called via `api`** — if `routes` factory runs a setup (e.g. `syncContentTypes`), also await it inside each `api` getter wrapper.
- **Write ops in `getters.ts`** — write functions belong in `mutations.ts`, not `getters.ts`.

## Full code patterns

See [REFERENCE.md](REFERENCE.md) for complete `defineBackendPlugin`, getters, mutations, and `api/index.ts` code shapes.
