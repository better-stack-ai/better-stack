# btst-client-plugin-dev — Examples

## Full ComposedRoute page wiring

### my-page.tsx (wrapper — public component)

```typescript
import { lazy } from "react"
import { ComposedRoute } from "@btst/stack/client"
import { DefaultError } from "@workspace/ui/default-error"
import { PageSkeleton } from "@workspace/ui/page-skeleton"
import { NotFoundPage } from "@workspace/ui/not-found"

// Always lazy-load the internal implementation
const MyPage = lazy(() =>
  import("./my-page.internal").then(m => ({ default: m.MyPage }))
)

export function MyPageComponent({ id }: { id: string }) {
  return (
    <ComposedRoute
      path={`/my-plugin/${id}`}
      PageComponent={MyPage}
      ErrorComponent={DefaultError}
      LoadingComponent={PageSkeleton}   // NEVER guard with typeof window check
      NotFoundComponent={NotFoundPage}
      props={{ id }}
      onError={(error) => console.error("[my-plugin] page error", error)}
    />
  )
}
```

### my-page.internal.tsx (actual UI)

```typescript
import { useSuspenseQuery } from "@tanstack/react-query"
import { usePluginOverrides } from "@btst/stack/context"
import { createMyQueryKeys } from "../../query-keys"
import { createApiClient } from "@btst/stack/client"
import type { MyApiRouter } from "../../api/plugin"
import type { MyItem } from "../../api/types"

function useMyItem(id: string) {
  const { apiBaseURL, apiBasePath, headers, queryClient } = usePluginOverrides("my-plugin")
  const client = createApiClient<MyApiRouter>({ baseURL: apiBaseURL, basePath: apiBasePath })
  const queries = createMyQueryKeys(client, headers)

  const { data, refetch, error, isFetching } = useSuspenseQuery({
    ...queries.items.detail(id),
    staleTime: 60_000,
    retry: false,
  })

  // useSuspenseQuery only throws on initial fetch — manually re-throw for refetch errors
  if (error && !isFetching) throw error

  return { data: data as MyItem, refetch }
}

export function MyPage({ id }: { id: string }) {
  const { data, refetch } = useMyItem(id)

  return (
    <div>
      <h1>{data.title}</h1>
      <p>{data.description}</p>
      <button onClick={() => refetch()}>Refresh</button>
    </div>
  )
}
```

---

## Client hooks (lifecycle) example

```typescript
// In defineClientPlugin config:
hooks: {
  beforeLoadDetail: async (id, ctx) => {
    // Return false to prevent loading (e.g. user not authorised)
    return true
  },
  afterLoadDetail: async (item, id, ctx) => {
    // item is the prefetched data
    analytics.track("item_viewed", { id })
  },
  onLoadError: async (error, ctx) => {
    Sentry.captureException(error, { extra: { path: ctx.path } })
  },
}
```

---

## Error flow comparison

| Situation | Correct pattern |
|---|---|
| Loader fetch fails (SSR) | Catch silently, don't re-throw. React Query stores the error. |
| Component throws | Wrap with ComposedRoute — ErrorBoundary renders DefaultError. |
| Refetch fails (client) | `if (error && !isFetching) throw error` inside the suspense hook. |
| User not found (404) | Return null from API → component calls `notFound()` from ComposedRoute. |
