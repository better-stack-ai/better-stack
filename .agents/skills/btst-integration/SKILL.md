---
name: btst-integration
description: Guides developers and AI agents through manual BTST library consumption in existing apps, including plugin registration, CSS imports, adapter setup, StackProvider wiring, React Query, and CLI schema workflows. Use when integrating `@btst/stack`, configuring `@btst/adapter-*`, wiring plugin `api/client` packages, setting up `StackProvider` overrides, adding `/api/data` and `/pages` routes, or running `@btst/cli generate|migrate` without scaffolding.
---

# BTST Library Integration

## Quick start

1. Install `@btst/stack`, `@tanstack/react-query`, and one `@btst/adapter-*`.
2. Install each selected @btst/plugin-{name} package and register its applicable backend/client halves. Required package-code dependencies and runtime registrations are separate; follow each plugin’s documented graph.
3. Create `lib/stack.ts` → export `{ handler, dbSchema }`.
4. Mount `handler` with the framework API entry factory at `/api/data/*`.
5. Add `@import "@btst/plugin-{plugin}/css"` per plugin in your global CSS.
6. Create `lib/stack-client.tsx`, `lib/query-client.ts`, and the `/pages/*`
   catch-all route with the framework page entry factory.
7. Create the pages **layout** file with `QueryClientProvider` + `StackProvider`.
8. Generate a candidate schema, preserve application-owned models/indexes, and
   apply reviewed migrations before database-backed builds (and before traffic).

See [REFERENCE.md](REFERENCE.md) for full code shapes for every file.

## Workflow

### 1) Install prerequisites and packages

- Prereqs: shadcn/ui (CSS variables enabled), Sonner `<Toaster />`, Tailwind v4.
- Install: `@btst/stack`, `@tanstack/react-query`, and one adapter:
  - `@btst/adapter-prisma` / `@btst/adapter-drizzle` / `@btst/adapter-kysely` / `@btst/adapter-mongodb`
  - `@btst/adapter-memory` — dev/testing only, not for production
- Install each plugin package alongside `@btst/stack` (they ship inside the monorepo package).

### 2) Register plugins (backend + client)

- **Backend** (`lib/stack.ts`): import `{plugin}BackendPlugin` from `@btst/plugin-{plugin}/api`.
  - Pass hooks and config in the backend plugin options object (e.g. `blogBackendPlugin({ hooks })`).
  - Use camelCase keys for plugins that have compound names: `aiChat`, `formBuilder`, `uiBuilder`.
- **Client** (`lib/stack-client.tsx`): import `{plugin}ClientPlugin` from `@btst/plugin-{plugin}/client`.
  - Client definitions receive only plugin-specific options such as `seo`, hooks, or page components. Configure `api`, `site`, and `queryClient` once on `createClientStack()`; its resolver binds that runtime to every definition.
  - Pass incoming SSR request headers through the top-level `createClientStack({ api: { headers } })` configuration.
  - Resolve one trusted API/site origin snapshot on the server and hydrate it into the provider. A managed backend may use a distinct `BTST_API_URL`; never reconstruct it from `window.location` after hydration.

### Embedded Search

For Search dialogs on pages with their own query filters, scope `StackProvider`
to the embedded UI with a navigation-only router: omit both `getSearchParams`
and `setSearchParams`, including bindings returned by a framework `useRouter`.
Keep the results page under the normal URL-aware provider. Reuse the resolved
stack, QueryClient, and enclosing identity boundary.

Use `SearchInput`/`SearchDialog` `renderResult` and `renderLoading` for visual
customization; route equivalents live in `overrides.search`. `renderResult(item,
query)` can reuse the exported `SearchHighlight` for literal phrase matches. Return
presentational content so Search retains options/links, announcements, keyboard
selection, pagination, retry, and fixed sources. See
[`search.mdx`](../../../docs/content/docs/plugins/search.mdx#embedded-dialog-state)
for the complete provider example.

For manual Next.js results pages, `createNextPage.getStackClient` receives page
props as its second argument. Await `props.searchParams`, convert them to
`URLSearchParams`, and forward them through the server helper to
`searchClientPlugin({ searchParams, identityPartition })`. Otherwise SSR loads an
empty query even when the browser URL contains one. See the
[SSR example](../../../docs/content/docs/plugins/search.mdx#nextjs-search-parameter-propagation).

### 3) Configure backend stack

- Call `createBackendStack({ basePath: "/api/data", plugins: { ... }, adapter: (db) => createXxxAdapter(..., db, {}), auth: serverAuth })` when application authorization is enabled.
- Create `serverAuth` with `createServerAuth({ authorization, getIdentity })`. Omitting `auth` intentionally preserves permissive no-authorization compatibility; plugin labels such as AI Chat's `access: "authorized"` are not an enforcement boundary by themselves.
- Export `handler` and `dbSchema`.
- **Memory adapter + Next.js**: pin to `globalThis` to avoid two instances in the same process:
  ```ts
  function createAppStack() {
    return createBackendStack({ ... })
  }

  type AppStack = ReturnType<typeof createAppStack>
  const g = globalThis as typeof globalThis & { __btst__?: AppStack }
  export const myStack = g.__btst__ ??= createAppStack()
  export const { handler, dbSchema } = myStack
  ```

### 4) CSS — edit global stylesheet

Add one line per plugin **before** your Tailwind layers:
```css
@import "@btst/plugin-blog/css";
@import "@btst/plugin-cms/css";
@import "@btst/plugin-ai-chat/css";
/* …one per selected plugin */
```
Do not duplicate — the patcher and manual edits must both be idempotent.

### 5) Wire framework routes and client runtime

- **API route**: use `toNextRouteHandlers`,
  `toReactRouterHandlers`, or `toTanStackHandlers` from the framework
  entry point.
- **Pages route**: use `createNextPage`,
  `createReactRouterPage`, or `createTanStackPageOptions`. The factory
  owns route matching, loader ordering, hydration, metadata, and 404 handling.
- **Pages layout** (`"use client"` in Next.js): wrap in `QueryClientProvider` then `StackProvider`:
  - Pass the resolved client stack with `stack={clientStack}`. Its top-level `site.basePath` must match your pages catch-all prefix.
  - `router={nextRouter()}` / `reactRouter()` / `tanstackRouter()` for framework-wide links, images, navigation, and refresh.
  - `auth={createClientAuth({ authorization, getIdentity, loginPath })}` when plugins need identity or permission presentation gates.
  - `overrides={{ pluginKey: { uploadImage?, ...pluginSpecificValues } }}` only for plugin-specific customization.
  - Let the resolved plugin map infer override keys and values; do not duplicate a manual provider map.
  - See [REFERENCE.md](REFERENCE.md) for provider wiring and per-plugin override shapes.
- **Page context**: wrap the **root layout** (above `StackProvider`) with `PageAIContextProvider`:
  ```tsx
  import { PageAIContextProvider } from "@btst/stack/page-context"
  // root layout.tsx (not the pages layout)
  export default function RootLayout({ children }) {
    return <PageAIContextProvider>{children}</PageAIContextProvider>
  }
  ```
  Pages then call `useRegisterPageAIContext(...)` from the lightweight Core entry, including pages without AI Chat installed — see the `btst-ai-context` skill.

### 6) Generate schemas and run migrations

- Use the pinned low-level CLI in isolation: `pnpm dlx @btst/cli@3.0.1`.
- Existing Prisma apps: generate to a scratch file with `pnpm dlx @btst/cli@3.0.1 generate --config=lib/stack.ts --orm=prisma --output=prisma/btst-candidate.prisma`. Keep it outside a configured multi-file schema directory. Merge BTST additions into the application schema, retaining custom models, indexes, mappings, and relations; validate with Prisma and review additive migration SQL. Do not overwrite the application schema or accept a reset to resolve drift.
- Drizzle: `pnpm dlx @btst/cli@3.0.1 generate --config=lib/stack.ts --orm=drizzle --output=src/db/schema.ts`
- Kysely: `pnpm dlx @btst/cli@3.0.1 generate --config=lib/stack.ts --orm=kysely --output=migrations/schema.sql --database-url=...`
- Kysely migrate: `pnpm dlx @btst/cli@3.0.1 migrate --config=lib/stack.ts --database-url=...`
- Prisma/Drizzle: use native migration tooling after generate.
- Package extraction alone preserves tables; later Blog/CMS revision and editorial features require schema additions. Apply committed migrations to the database used by `next build` before static params, metadata, or prefetching. `prisma generate` creates client code, not tables. Isolated CI migrations do not prepare preview/production. For shared preview/production databases, coordinate one backward-compatible migration through the release job; do not auto-migrate production from every preview build.
- See [existing-app workflow](../../../docs/content/docs/existing-app-v6.mdx) for environment ordering, trusted CMS slug reads and full relationship pagination, Search SSR parameters, static Blog checks, and strict publisher snapshots. Preserve current constructors/provider wiring; a stale consumer copy should be refreshed rather than used to rewrite upstream examples.

## Validation checklist

- `stack.ts` exports both `handler` and `dbSchema`.
- Protected applications pass `createServerAuth(...)` to `createBackendStack({ auth })`; omitted auth is intentionally permissive.
- Every plugin is registered on both backend and client sides.
- API `basePath` and `createBackendStack({ basePath })` match exactly.
- API and page catch-all routes use the framework entry factories.
- Pages layout is `"use client"` and wraps `QueryClientProvider` then `StackProvider`.
- The resolved client stack's `site.basePath` matches the `/pages` catch-all route prefix.
- Global CSS has one `@import` line per selected plugin.
- `/pages/*` routes render expected plugin pages.
- CLI commands run with required env vars in scope.

## Gotchas

- **`"use client"` missing on pages layout** — `StackProvider` uses hooks and must be client-side.
- **Wrong key casing** — backend/client plugin map keys must match; compound names use camelCase (`aiChat`, not `ai-chat`).
- **Missing CSS import** — plugin UI breaks silently even when data loads correctly.
- **Half-registered plugin** — backend-only = routes don't exist; client-only = 404 on data calls.
- **Memory adapter + Next.js** — always pin to `globalThis` to share one in-memory store across API and page bundles.
- **Path aliases in CLI** — `@btst/cli` executes your config file directly; use relative imports in `lib/stack.ts` and its dependencies.
- **Kysely generate needs DB** — pass `DATABASE_URL` or `--database-url`; use `dotenv-cli` for `.env.local`.
- **Provider services copied into plugin overrides** — never add `Link`,
  `Image`, navigation, refresh, API paths, identity, or login values to
  built-in plugin overrides. Use top-level `router`, `api`, and `auth`.
