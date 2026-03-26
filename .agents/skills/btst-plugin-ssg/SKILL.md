---
name: btst-plugin-ssg
description: Patterns for adding SSG (static site generation) support to BTST plugins using prefetchForRoute, including query-key-defs.ts, serializers.ts, typed prefetchForRoute overloads, and the SSG page.tsx pattern for Next.js. Use when a plugin needs static generation support, when route.loader() silently fails at next build, when adding prefetchForRoute to the api factory, or when fixing infinite query shape/date serialization errors during SSG.
---

# BTST Plugin SSG Support

## Why route.loader() fails at build time

`route.loader()` makes HTTP requests. No server exists during `next build`, so fetches fail silently — static pages render empty. Solution: expose `prefetchForRoute` on the `api` factory to seed React Query directly from the DB.

## Required files per plugin

| File | Purpose |
|---|---|
| `api/query-key-defs.ts` | Shared key shapes — import into both `query-keys.ts` and `prefetchForRoute` |
| `api/serializers.ts` | Convert `Date` fields → ISO strings before `setQueryData` |
| `api/getters.ts` | Add any ID-based getters `prefetchForRoute` needs |
| `api/plugin.ts` | `RouteKey` type + typed overloads + wire `prefetchForRoute` into `api` factory |
| `api/index.ts` | Re-export `RouteKey`, serializers, `PLUGIN_QUERY_KEYS` |
| `query-keys.ts` | Import discriminator fn from `api/query-key-defs.ts` |
| `client/plugin.tsx` | `isConnectionError` warn in each loader `catch` block |

## Key rules

- **Serialize `Date` → ISO string** before every `setQueryData` call — DB returns `Date` objects, HTTP cache holds strings.
- **`useInfiniteQuery` lists** require `{ pages: [...], pageParams: [...] }` shape in `setQueryData`. Flat arrays break hydration.
- **Share key builders** via `api/query-key-defs.ts` — never hardcode key shapes in two places.
- **One-time init steps** (e.g. CMS `ensureSynced`) — call once at the top of `prefetchForRoute`; it's idempotent and safe for concurrent SSG.
- Place shared `StackProvider` layout at `app/pages/layout.tsx` (not inside `[[...all]]/`) so it applies to both SSG pages and the catch-all.

## Plugins with SSG support

| Plugin | Prefetched keys | Skipped |
|---|---|---|
| Blog | `posts`, `drafts`, `post`, `tag`, `editPost` | `newPost` |
| CMS | `dashboard`, `contentList`, `editContent` | `newContent` |
| Form Builder | `formList`, `editForm`, `submissions` | `newForm` |
| Kanban | `boards`, `board` | `newBoard` |
| AI Chat | — (per-user, not static) | all |

## isConnectionError in loader catch

```typescript
import { isConnectionError } from "@btst/stack/plugins/client"

// in each loader catch block:
if (isConnectionError(error)) {
  console.warn("[btst/my-plugin] route.loader() failed — no server at build time. Use myStack.api.myPlugin.prefetchForRoute() for SSG.")
}
```

## Gotchas

- **`route.loader()` silently fails at build time** — use `prefetchForRoute` in SSG pages instead.
- **Query key drift** — always import discriminator fns from `api/query-key-defs.ts`; never hardcode key shapes in two places.
- **Wrong shape for infinite queries** — `setQueryData` needs `{ pages: [...], pageParams: [...] }`, not a flat array.
- **Dates not serialized** — always pass data through a serializer before `setQueryData`.

## Full code patterns

See [REFERENCE.md](REFERENCE.md) for complete `query-key-defs.ts`, `serializers.ts`, `prefetchForRoute` overloads, and SSG `page.tsx` boilerplate.
