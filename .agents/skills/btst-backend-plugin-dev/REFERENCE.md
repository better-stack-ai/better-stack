# btst-backend-plugin-dev — Reference

## defineBackendPlugin shape (api/plugin.ts)

```typescript
export interface MyBackendPluginOptions {
  hooks?: MyBackendHooks
}

export const myBackendPlugin = (options: MyBackendPluginOptions = {}) =>
  defineBackendPlugin({
    id: "myPlugin",
    dbPlugin: dbSchema,
    operations: (adapter) => createMyOperations(adapter, options.hooks),
    raw: (adapter) => ({
      prefetchForRoute: createItemPrefetchForRoute(adapter),
    }),
    routes: (_adapter, _context, operations) => ({
      createItem: createEndpoint(
        "/items",
        { method: "POST", body: CreateItemSchema, requireRequest: true },
        operations.createItem.route((ctx) => ctx.body),
      ),
    }),
  })

export type MyApiRouter = ReturnType<
  ReturnType<typeof myBackendPlugin>["routes"]
>
```

## getters.ts

Lower-level DB functions — no HTTP context or lifecycle composition, always accept `adapter` as first arg:

```typescript
import type { DBAdapter as Adapter } from "@btst/db"
import type { Item } from "./types"

// Lower-level primitive: callers own validation and lifecycle composition.
export async function listItems(adapter: Adapter): Promise<Item[]> {
  return adapter.findMany({ model: "item" })
}

export async function getItemById(adapter: Adapter, id: string): Promise<Item | null> {
  return adapter.findOne({ model: "item", where: { id } }) ?? null
}
```

---

## mutations.ts

Write operations — no HTTP context or lifecycle composition. JSDoc disclaimer required:

```typescript
import type { DBAdapter as Adapter } from "@btst/db"
import type { CreateItemInput, Item } from "./types"

/**
 * Create a new item directly in the database.
 * Lower-level primitive: caller owns validation and lifecycle composition.
 */
export async function createItem(adapter: Adapter, data: CreateItemInput): Promise<Item> {
  return adapter.create({
    model: "item",
    data: { id: crypto.randomUUID(), ...data, createdAt: new Date() },
  })
}

/**
 * Update an existing item.
 * Lower-level primitive: caller owns validation and lifecycle composition.
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
 * Lower-level primitive: caller owns validation and lifecycle composition.
 */
export async function deleteItem(adapter: Adapter, id: string): Promise<void> {
  await adapter.delete({ model: "item", where: { id } })
}
```

---

## api/index.ts

Re-export getters and mutations for direct server-side import (SSG, scripts, AI tools):

```typescript
// Getters — read-only lower-level primitives
export { listItems, getItemById } from "./getters"

// Mutations — write lower-level primitives
export { createItem, updateItem, deleteItem } from "./mutations"

// Types for consumers
export type { MyApiRouter } from "./plugin"
export { MY_PLUGIN_QUERY_KEYS } from "./query-key-defs"
export { serializeItem } from "./serializers"
```

---

## Lifecycle hooks in operations

Invoke domain hooks from the operation lifecycle after authorization. Hooks can enforce domain invariants, publish side effects, and observe errors; they are not the authorization policy.

## Plugin `createBackendStack()` wiring (in stack.ts)

```typescript
import { createBackendStack } from "@btst/stack/api"
import { myBackendPlugin } from "./src/plugins/my-plugin/api/plugin"

export const myStack = createBackendStack({
  basePath: "/api/data",
  plugins: {
    myPlugin: myBackendPlugin(),
  },
  adapter: (db) => createDrizzleAdapter(schema, db, {}),
})

export const { handler, dbSchema } = myStack

// Explicitly trusted business access keeps validation and lifecycle hooks:
const item = await myStack.trusted.myPlugin.createItem({ name: "Scheduled item" })
```
