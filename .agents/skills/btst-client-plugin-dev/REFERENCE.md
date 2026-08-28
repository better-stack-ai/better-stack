# btst-client-plugin-dev — Reference

## SSR loader (createMyLoader)

```typescript
import { isConnectionError } from "@btst/stack/plugins/client"

function createMyLoader(id: string, config: ResolvedMyClientConfig) {
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
          await hooks.beforeLoad(id, context)
        }

        const client = createApiClient<MyApiRouter>({
          baseURL: apiBaseURL,
          basePath: apiBasePath,
          headers,
          credentials: config.credentials,
        })
        const queries = createMyQueryKeys(client, headers)

        await queryClient.prefetchQuery(queries.items.detail(id))

        if (hooks?.afterLoad) {
          const data = queryClient.getQueryData(queries.items.detail(id).queryKey)
          await hooks.afterLoad(data, id, context)
        }

        const queryState = queryClient.getQueryState(queries.items.detail(id).queryKey)
        if (queryState?.error && hooks?.onErrorLoad) {
          const error = queryState.error instanceof Error
            ? queryState.error
            : new Error(String(queryState.error))
          await hooks.onErrorLoad(error, context)
        }
      } catch (error) {
        if (isConnectionError(error)) {
          console.warn("[btst/my-plugin] route.loader() failed — no server at build time. Use myStack.api.myPlugin.prefetchForRoute() for SSG.")
        }
        if (hooks?.onErrorLoad) {
          await hooks.onErrorLoad(error as Error, context)
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
function createMyMeta(id: string, config: ResolvedMyClientConfig) {
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

## Resource declaration and query keys (query-keys.ts)

```typescript
import {
  createResourceQueryKeys,
  type ResourceClient,
  type ResourcesDeclaration,
} from "@btst/stack/plugins/client"

export const myResources = {
  items: {
    queries: {
      list: {
        path: "/items",
        select: (data: any) => data?.items ?? [],
      },
      detail: {
        path: "/items",
        query: (id: string) => ({ id }),
        key: (id: string) => [id],
        select: (data: any) => data?.item ?? null,
      },
    },
  },
} satisfies ResourcesDeclaration

export function createMyQueryKeys(client: ResourceClient, headers?: HeadersInit) {
  return createResourceQueryKeys(client, myResources, headers)
}
```

---

## Programmatic id (client/constants.ts)

```typescript
export const MY_PLUGIN_ID = "my-plugin" as const
```

## defineClientPlugin shape (client/plugin.tsx)

```typescript
import {
  defineClientPlugin,
  defineRoute,
  defineRoutes,
} from "@btst/stack/plugins/client"
import type { ResolvedClientPluginRuntime } from "@btst/stack/plugins/client"
import type { QueryClient } from "@tanstack/react-query"
import { lazy } from "react"
import { MY_PLUGIN_ID } from "./constants"

export interface MyClientConfig {
  hooks?: MyClientHooks
  seo?: MySeoConfig
}

interface ResolvedMyClientConfig extends MyClientConfig {
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
    hooks: config.hooks,
    seo: config.seo,
    queryClient: runtime.queryClient,
    apiBaseURL: runtime.api.baseURL,
    apiBasePath: runtime.api.basePath,
    siteBaseURL: runtime.site.baseURL,
    siteBasePath: runtime.site.basePath,
    headers: runtime.api.headers,
    credentials: runtime.api.credentials,
  }
}

const ListPage = lazy(() =>
  import("./components/pages/list-page").then(m => ({ default: m.ListPageComponent }))
)
const DetailPage = lazy(() =>
  import("./components/pages/detail-page").then(m => ({ default: m.DetailPageComponent }))
)

function createResolvedMyPlugin(config: ResolvedMyClientConfig) {
  return {
    routes: () =>
      defineRoutes({
        list: defineRoute("/my-plugin", {
          page: ListPage,
          loader: createListLoader(config),
          meta: createListMeta(config),
        }),
        detail: defineRoute("/my-plugin/:id", {
          page: ({ params }) => <DetailPage id={params.id} />,
          loader: ({ params }) => createDetailLoader(params.id, config)(),
          meta: ({ params }) => createDetailMeta(params.id, config)(),
        }),
      }),
  }
}

export const myClientPlugin = (config: MyClientConfig = {}) =>
  defineClientPlugin()({
    id: MY_PLUGIN_ID,
    resolve: (runtime) =>
      createResolvedMyPlugin(resolveMyClientConfig(config, runtime)),
  })
```

`MyClientConfig` contains only plugin-specific choices. API, site, QueryClient,
headers, and credentials arrive through `resolve(runtime)` from the enclosing
client stack. Construct the resolved config from an explicit allowlist so
removed transport fields cannot survive through JavaScript or `any` callers.
Use the same exported literal id in the definition and every `createResource()`
call so runtime lookup cannot drift from registration.
