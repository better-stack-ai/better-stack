# btst-client-plugin-dev — Reference

## SSR loader (createMyLoader)

```typescript
import { isConnectionError } from "@btst/stack/plugins/client"

function createMyLoader(id: string, config: MyClientConfig) {
  return async () => {
    if (typeof window === "undefined") {
      const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config

      const context: LoaderContext = {
        path: `/my-plugin/${id}`,
        params: { id },
        isSSR: true,
        apiBaseURL,
        apiBasePath,
        headers,
      }

      try {
        if (hooks?.beforeLoad) {
          const canLoad = await hooks.beforeLoad(id, context)
          if (!canLoad) throw new Error("Load prevented by beforeLoad hook")
        }

        const client = createApiClient<MyApiRouter>({ baseURL: apiBaseURL, basePath: apiBasePath })
        const queries = createMyQueryKeys(client, headers)

        await queryClient.prefetchQuery(queries.items.detail(id))

        if (hooks?.afterLoad) {
          const data = queryClient.getQueryData(queries.items.detail(id).queryKey)
          await hooks.afterLoad(data, id, context)
        }

        const queryState = queryClient.getQueryState(queries.items.detail(id).queryKey)
        if (queryState?.error && hooks?.onLoadError) {
          const error = queryState.error instanceof Error
            ? queryState.error
            : new Error(String(queryState.error))
          await hooks.onLoadError(error, context)
        }
      } catch (error) {
        if (isConnectionError(error)) {
          console.warn("[btst/my-plugin] route.loader() failed — no server at build time. Use myStack.api.myPlugin.prefetchForRoute() for SSG.")
        }
        if (hooks?.onLoadError) {
          await hooks.onLoadError(error as Error, context)
        }
        // Never re-throw — let React Query store errors for ErrorBoundary
      }
    }
  }
}
```

---

## Meta generator (createMyMeta)

```typescript
function createMyMeta(id: string, config: MyClientConfig) {
  return () => {
    const { queryClient, apiBaseURL, apiBasePath, siteBaseURL, siteBasePath, seo } = config

    const client = createApiClient<MyApiRouter>({ baseURL: apiBaseURL, basePath: apiBasePath })
    const queries = createMyQueryKeys(client)
    const data = queryClient.getQueryData<MyItem>(queries.items.detail(id).queryKey)

    if (!data) {
      return [
        { title: "Not found" },
        { name: "robots", content: "noindex" },
      ]
    }

    const fullUrl = `${siteBaseURL}${siteBasePath}/my-plugin/${id}`

    return [
      { title: data.title },
      { name: "description", content: data.description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: data.title },
      { property: "og:url", content: fullUrl },
      { property: "og:site_name", content: seo?.siteName ?? "" },
    ]
  }
}
```

---

## Query Keys Factory (query-keys.ts)

```typescript
import { mergeQueryKeys, createQueryKeys } from "@lukemorales/query-key-factory"
import { createApiClient } from "@btst/stack/client"
import type { MyApiRouter } from "./api/plugin"

export function createMyQueryKeys(client: ReturnType<typeof createApiClient<MyApiRouter>>, headers?: HeadersInit) {
  return mergeQueryKeys(
    createQueryKeys("myPlugin", {
      list: () => ({
        queryKey: ["list"],
        queryFn: async () => client.items.list({ headers }),
      }),
      detail: (id: string) => ({
        queryKey: [id],
        queryFn: async () => client.items.get(id, { headers }),
      }),
    })
  )
}
```

---

## defineClientPlugin shape (client/plugin.tsx)

```typescript
import { defineClientPlugin, createRoute } from "@btst/stack/plugins"
import { lazy } from "react"

const ListPage = lazy(() =>
  import("./components/pages/list-page").then(m => ({ default: m.ListPageComponent }))
)
const DetailPage = lazy(() =>
  import("./components/pages/detail-page").then(m => ({ default: m.DetailPageComponent }))
)

export const myClientPlugin = defineClientPlugin({
  name: "my-plugin",
  config: (overrides) => ({
    queryClient: overrides.queryClient,
    apiBaseURL: overrides.apiBaseURL,
    apiBasePath: overrides.apiBasePath,
    siteBaseURL: overrides.siteBaseURL,
    siteBasePath: overrides.siteBasePath,
    hooks: overrides.hooks,
    headers: overrides.headers,
    seo: overrides.seo,
  }),
  routes: (config) => ({
    list: createRoute("/my-plugin", () => ({
      PageComponent: () => <ListPage />,
      loader: createListLoader(config),
      meta: createListMeta(config),
    })),
    detail: createRoute("/my-plugin/:id", ({ params }) => ({
      PageComponent: () => <DetailPage id={params.id} />,
      loader: createDetailLoader(params.id, config),
      meta: createDetailMeta(params.id, config),
    })),
  }),
})
```
