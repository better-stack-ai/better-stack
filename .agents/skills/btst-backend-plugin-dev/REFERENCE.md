# btst-backend-plugin-dev — Reference

## defineBackendPlugin shape (api/plugin.ts)

```typescript
import type { DBAdapter as Adapter } from "@btst/db"
import { defineBackendPlugin, createEndpoint } from "@btst/stack/plugins/api"
import { z } from "zod"
import { dbSchema } from "./db-schema"
import { listItems, getItemById } from "./getters"
import { createItem, updateItem, deleteItem } from "./mutations"

const ItemQuerySchema = z.object({ limit: z.coerce.number().optional() })
const CreateItemSchema = z.object({ name: z.string() })

export const myBackendPlugin = defineBackendPlugin({
  name: "my-plugin",
  dbPlugin: dbSchema,

  // api factory — bound to shared adapter, no HTTP context
  api: (adapter: Adapter) => ({
    listItems: () => listItems(adapter),
    getItemById: (id: string) => getItemById(adapter, id),
    createItem: (data: CreateItemInput) => createItem(adapter, data),
  }),

  // routes factory — HTTP endpoints built with createEndpoint
  routes: (adapter: Adapter) => {
    const listItemsEndpoint = createEndpoint(
      "/items",
      { method: "GET", query: ItemQuerySchema },
      async (ctx) => {
        return await listItems(adapter)
      },
    )

    const createItemEndpoint = createEndpoint(
      "/items",
      { method: "POST", body: CreateItemSchema },
      async (ctx) => {
        return await createItem(adapter, ctx.body)
      },
    )

    const getItemEndpoint = createEndpoint(
      "/items/:id",
      { method: "GET" },
      async (ctx) => {
        const item = await getItemById(adapter, ctx.params.id)
        if (!item) throw ctx.error(404, { message: "Item not found" })
        return item
      },
    )

    return { listItems: listItemsEndpoint, createItem: createItemEndpoint, getItem: getItemEndpoint } as const
  },
})

// Router type for client consumption
export type MyApiRouter = ReturnType<ReturnType<typeof myBackendPlugin>["routes"]>
```

### ctx object inside createEndpoint handlers

| Property | Description |
|---|---|
| `ctx.query` | Validated query params (when `query:` schema provided) |
| `ctx.body` | Validated request body (when `body:` schema provided) |
| `ctx.params` | URL path params (e.g. `:id` → `ctx.params.id`) |
| `ctx.headers` | Request `Headers` object |
| `ctx.request` | Raw `Request` object |
| `ctx.error(status, { message })` | Create an HTTP error — always `throw` the result |

---

## getters.ts

Pure DB functions — no HTTP context, no lifecycle hooks, always accept `adapter` as first arg:

```typescript
import type { DBAdapter as Adapter } from "@btst/db"
import type { Item } from "./types"

// Authorization hooks are NOT called — callers are responsible for access control
export async function listItems(adapter: Adapter): Promise<Item[]> {
  return adapter.findMany({ model: "item" })
}

export async function getItemById(adapter: Adapter, id: string): Promise<Item | null> {
  return adapter.findOne({ model: "item", where: { id } }) ?? null
}
```

---

## mutations.ts

Write operations — no auth hooks, no HTTP context. JSDoc disclaimer required:

```typescript
import type { DBAdapter as Adapter } from "@btst/db"
import type { CreateItemInput, Item } from "./types"

/**
 * Create a new item directly in the database.
 * Authorization hooks are NOT called — caller is responsible for access control.
 */
export async function createItem(adapter: Adapter, data: CreateItemInput): Promise<Item> {
  return adapter.create({
    model: "item",
    data: { id: crypto.randomUUID(), ...data, createdAt: new Date() },
  })
}

/**
 * Update an existing item.
 * Authorization hooks are NOT called — caller is responsible for access control.
 */
export async function updateItem(
  adapter: Adapter,
  id: string,
  data: Partial<CreateItemInput>,
): Promise<Item | null> {
  return adapter.update({ model: "item", where: { id }, data }) ?? null
}

/**
 * Delete an item.
 * Authorization hooks are NOT called — caller is responsible for access control.
 */
export async function deleteItem(adapter: Adapter, id: string): Promise<void> {
  await adapter.delete({ model: "item", where: { id } })
}
```

---

## api/index.ts

Re-export getters and mutations for direct server-side import (SSG, scripts, AI tools):

```typescript
// Getters — read-only, no auth hooks
export { listItems, getItemById } from "./getters"

// Mutations — write ops, no auth hooks
export { createItem, updateItem, deleteItem } from "./mutations"

// Types for consumers
export type { MyApiRouter } from "./plugin"
export { MY_PLUGIN_QUERY_KEYS } from "./query-key-defs"
export { serializeItem } from "./serializers"
```

---

## Lifecycle hook implementation in routes

```typescript
routes: (adapter: Adapter) => {
  const createItemEndpoint = createEndpoint(
    "/items",
    { method: "POST", body: CreateItemSchema },
    async (ctx) => {
      const context = { body: ctx.body, headers: ctx.headers }

      // before hook — throw to deny
      await ctx.hooks?.onBeforeItemCreated?.(ctx.body, context)

      const item = await createItem(adapter, ctx.body)

      // after hook — fire and forget or await
      await ctx.hooks?.onAfterItemCreated?.(item, context)

      return item
    },
  )

  return { createItem: createItemEndpoint } as const
},
```

Hook naming always follows: `onBefore{Entity}{Action}`, `onAfter{Entity}{Action}`, `on{Entity}{Action}Error`.

---

## Plugin stack() wiring (in stack.ts)

```typescript
import { stack } from "@btst/stack"
import { myBackendPlugin } from "./src/plugins/my-plugin/api/plugin"

export const myStack = stack({
  basePath: "/api/data",
  plugins: {
    myPlugin: myBackendPlugin,
  },
  adapter: (db) => createDrizzleAdapter(schema, db, {}),
})

export const { handler, dbSchema } = myStack

// Direct server-side access (bypasses auth hooks):
const items = await myStack.api.myPlugin.listItems()
```
