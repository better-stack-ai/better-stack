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
import { createResource } from "@btst/stack/plugins/client/hooks"
import { myResources } from "../../query-keys"
import { MY_PLUGIN_ID } from "../../constants"

// Reuse the definition's id so hooks cannot drift from the registered runtime.
// The resolved stack supplies its browser-safe endpoint and QueryClient.
const my = createResource({
  plugin: MY_PLUGIN_ID,
  resources: myResources,
})

function useMyItem(id: string) {
  const { data, refetch } = my.items.detail.useSuspense([id])
  return { data, refetch }
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
// In the config passed to myClientPlugin(config):
hooks: {
  beforeLoadDetail: async (id, ctx) => {
    const session = await getSession(ctx.headers)
    if (!session) throw new Error("Authentication required")
  },
  afterLoadDetail: async (item, id, ctx) => {
    // item is the prefetched data
    analytics.track("item_viewed", { id })
  },
  onErrorLoad: async (error, ctx) => {
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
