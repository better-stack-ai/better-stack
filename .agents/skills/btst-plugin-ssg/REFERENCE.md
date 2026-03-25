# btst-plugin-ssg — Reference

## api/query-key-defs.ts

Shared key shapes — import into both `query-keys.ts` and `prefetchForRoute` to prevent drift:

```typescript
export function itemsListDiscriminator(params?: { limit?: number }) {
  return { limit: params?.limit ?? 20 }
}

export const MY_PLUGIN_QUERY_KEYS = {
  itemsList: (params?: { limit?: number }) =>
    ["myPlugin", "list", itemsListDiscriminator(params)] as const,
  itemDetail: (id: string) =>
    ["myPlugin", "detail", id] as const,
}
```

---

## api/serializers.ts

Convert DB `Date` objects → ISO strings before `setQueryData`:

```typescript
import type { Item, SerializedItem } from "./types"

export function serializeItem(item: Item): SerializedItem {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt?.toISOString() ?? null,
  }
}
```

---

## prefetchForRoute typed overloads (api/plugin.ts)

```typescript
import type { QueryClient } from "@tanstack/react-query"
import { MY_PLUGIN_QUERY_KEYS } from "./query-key-defs"
import { listItems, getItemById } from "./getters"
import { serializeItem } from "./serializers"
import type { Adapter } from "@btst/stack/plugins"

export type MyPluginRouteKey = "list" | "detail" | "new"

interface MyPluginPrefetchForRoute {
  (key: "list" | "new", qc: QueryClient): Promise<void>
  (key: "detail", qc: QueryClient, params: { id: string }): Promise<void>
}

function createMyPluginPrefetchForRoute(adapter: Adapter): MyPluginPrefetchForRoute {
  return async function prefetchForRoute(key, qc, params?) {
    switch (key) {
      case "list": {
        const { items, total, limit, offset } = await listItems(adapter)
        // useInfiniteQuery requires { pages, pageParams } shape
        qc.setQueryData(MY_PLUGIN_QUERY_KEYS.itemsList(), {
          pages: [{ items: items.map(serializeItem), total, limit, offset }],
          pageParams: [0],
        })
        break
      }
      case "detail": {
        const item = await getItemById(adapter, params!.id)
        if (item) {
          qc.setQueryData(MY_PLUGIN_QUERY_KEYS.itemDetail(params!.id), serializeItem(item))
        }
        break
      }
      case "new":
        break  // no prefetch needed for new/create pages
    }
  } as MyPluginPrefetchForRoute
}

// Wire into the api factory in defineBackendPlugin:
api: (adapter) => ({
  listItems: () => listItems(adapter),
  getItemById: (id: string) => getItemById(adapter, id),
  prefetchForRoute: createMyPluginPrefetchForRoute(adapter),
})
```

---

## SSG page.tsx (Next.js — outside [[...all]]/)

Static page that bypasses `route.loader()` and seeds the cache directly:

```tsx
// app/pages/my-plugin/page.tsx
import { notFound } from "next/navigation"
import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import type { Metadata } from "next"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import { myStack } from "@/lib/stack"
import { normalizePath, metaElementsToObject } from "@btst/stack/client"

export async function generateStaticParams() {
  return [{}]
}
// export const revalidate = 3600  // ISR — uncomment to enable

export async function generateMetadata(): Promise<Metadata> {
  const queryClient = getOrCreateQueryClient()
  const stackClient = getStackClient(queryClient)
  const route = stackClient.router.getRoute(normalizePath(["my-plugin"]))
  if (!route) return { title: "Fallback" }

  await myStack.api.myPlugin.prefetchForRoute("list", queryClient)
  return metaElementsToObject(route.meta?.() ?? []) satisfies Metadata
}

export default async function Page() {
  const queryClient = getOrCreateQueryClient()
  const stackClient = getStackClient(queryClient)
  const route = stackClient.router.getRoute(normalizePath(["my-plugin"]))
  if (!route) notFound()

  await myStack.api.myPlugin.prefetchForRoute("list", queryClient)
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <route.PageComponent />
    </HydrationBoundary>
  )
}
```

---

## query-keys.ts — import from query-key-defs.ts

```typescript
// src/plugins/my-plugin/query-keys.ts
import { mergeQueryKeys, createQueryKeys } from "@lukemorales/query-key-factory"
import { itemsListDiscriminator, MY_PLUGIN_QUERY_KEYS } from "./api/query-key-defs"

export function createMyPluginQueryKeys(client, headers?) {
  return mergeQueryKeys(
    createQueryKeys("myPlugin", {
      list: (params?: { limit?: number }) => ({
        queryKey: [itemsListDiscriminator(params)],  // ← reuse discriminator, never hardcode
        queryFn: async () => client.items.list(params, { headers }),
      }),
      detail: (id: string) => ({
        queryKey: [id],
        queryFn: async () => client.items.get(id, { headers }),
      }),
    })
  )
}

export { MY_PLUGIN_QUERY_KEYS }
```

---

## api/index.ts — re-export SSG types

```typescript
export { listItems, getItemById } from "./getters"
export { createItem, updateItem, deleteItem } from "./mutations"
export { serializeItem } from "./serializers"
export { MY_PLUGIN_QUERY_KEYS } from "./query-key-defs"
export type { MyPluginRouteKey } from "./plugin"
```
