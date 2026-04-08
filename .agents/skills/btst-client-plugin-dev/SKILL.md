---
name: btst-client-plugin-dev
description: Patterns for writing BTST client plugins inside the monorepo, including defineClientPlugin structure, route anatomy (PageComponent/loader/meta), lazy loading, SSR loader pattern, meta generators, ComposedRoute with ErrorBoundary/Suspense, useSuspenseQuery error throwing, query key factories, and client override shapes. Use when creating or modifying a client plugin, adding routes/loaders/meta, wiring ComposedRoute, implementing useSuspenseQuery, or building query key factories in src/plugins/{name}/client/.
---

# BTST Client Plugin Development

## File structure

```
src/plugins/{name}/
  client/
    plugin.tsx           ← defineClientPlugin entry
    hooks.ts             ← "use client" React hooks only
    components/
      pages/
        my-page.tsx      ← wrapper: ComposedRoute + lazy import
        my-page.internal.tsx  ← actual UI: useSuspenseQuery
  query-keys.ts          ← React Query key factory
```

## Server/client module boundary

`client/plugin.tsx` must stay import-safe on the server. Next.js (including SSG build)
can execute `createStackClient()` on the server, which calls each `*ClientPlugin()`
factory. If that module is marked `"use client"` or imports a client-only module, build
can fail with "Attempted to call ... from the server".

Rules:

- Do **not** add `"use client"` to `client/plugin.tsx`.
- Keep `client/plugin.tsx` free of React hooks (`useState`, `useEffect`, etc.).
- Put hook utilities in a separate client-only module (`client/hooks.ts`) with
  `"use client"`, and re-export them from `client/index.ts`.
- UI components can remain client components as needed; only the plugin factory entry
  must stay server-import-safe.

## Route anatomy

Each route returns exactly three things:

```typescript
routes: (config) => ({
  myRoute: createRoute("/path/:id", ({ params }) => ({
    PageComponent: () => <MyPageComponent id={params.id} />,
    loader: createMyLoader(params.id, config),   // SSR only
    meta: createMyMeta(params.id, config),        // SEO tags
  })),
})
```

## Lazy loading

Use `React.lazy()` for all page components. Named exports need `.then()`:

```typescript
const MyPage = lazy(() =>
  import("./components/pages/my-page").then(m => ({ default: m.MyPage }))
)
// Default exports: lazy(() => import("./components/pages/my-page"))
```

## SSR loader rules

- Only execute inside `if (typeof window === "undefined")` guard
- **Never throw** — store errors in React Query, let ErrorBoundary catch during render
- Call `beforeLoad` / `afterLoad` / `onLoadError` hooks
- Use `queryClient.prefetchQuery()` to seed data
- Import `isConnectionError` from `@btst/stack/plugins/client` and warn on build-time failure

## ComposedRoute (wrapper page)

```typescript
export function MyPageComponent({ id }: { id: string }) {
  return (
    <ComposedRoute
      path={`/plugin/${id}`}
      PageComponent={MyPage}            // lazy loaded
      ErrorComponent={DefaultError}
      LoadingComponent={PageSkeleton}   // always provide — never guard with typeof window
      NotFoundComponent={NotFoundPage}
      props={{ id }}
      onError={(error) => console.error(error)}
    />
  )
}
```

**Critical**: always pass `LoadingComponent` unconditionally — guarding it with `typeof window !== "undefined"` shifts React's `useId()` counter and causes hydration mismatches.

## useSuspenseQuery + error throwing (.internal.tsx)

`useSuspenseQuery` only throws on initial fetch. Manually re-throw on refetch errors:

```typescript
export function useMyData(id: string) {
  const { data, refetch, error, isFetching } = useSuspenseQuery({
    ...queries.items.detail(id),
    staleTime: 60_000,
    retry: false,
  })
  if (error && !isFetching) throw error   // ← required for ErrorBoundary to catch refetch failures
  return { data, refetch }
}
```

## Client overrides shape

```typescript
type PluginOverrides = {
  apiBaseURL: string
  apiBasePath: string        // e.g. "/api/data"
  navigate: (path: string) => void
  refresh?: () => void
  Link: ComponentType<LinkProps>
  Image?: ComponentType<ImageProps>
  uploadImage?: (file: File) => Promise<string>
  headers?: HeadersInit
  localization?: Partial<Localization>
}
```

## Gotchas

- **Missing `usePluginOverrides()` config** — client components crash if overrides aren't set in layout.
- **`staleTime: Infinity`** — use for data that should not auto-refetch.
- **Next.js Link href undefined** — use `href={href || "#"}` pattern.
- **Suspense errors not caught** — add `if (error && !isFetching) throw error` in every suspense hook.
- **Missing ComposedRoute wrapper** — without it, errors crash the entire app instead of hitting ErrorBoundary.
- **Client directive on `client/plugin.tsx`** — can break SSG/SSR when plugin factories are invoked server-side.

## Full code patterns

See [REFERENCE.md](REFERENCE.md) for complete SSR loader, meta generator, and query key factory code.
See [EXAMPLES.md](EXAMPLES.md) for a full ComposedRoute + internal page wiring example.
