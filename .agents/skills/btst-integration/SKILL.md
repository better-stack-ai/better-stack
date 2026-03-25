---
name: btst-integration
description: Guides developers and AI agents through manual BTST library consumption in existing apps, including plugin registration, CSS imports, adapter setup, StackProvider wiring, React Query, and CLI schema workflows. Use when integrating `@btst/stack`, configuring `@btst/adapter-*`, wiring plugin `api/client` packages, setting up `StackProvider` overrides, adding `/api/data` and `/pages` routes, or running `@btst/cli generate|migrate` without scaffolding.
---

# BTST Library Integration

## Quick start

1. Install `@btst/stack`, `@tanstack/react-query`, and one `@btst/adapter-*`.
2. Install and register each plugin's backend and client halves.
3. Create `lib/stack.ts` → export `{ handler, dbSchema }`.
4. Mount a catch-all API route at `/api/data/*` forwarding all methods to `handler`.
5. Add `@import "@btst/stack/plugins/{plugin}/css"` per plugin in your global CSS.
6. Create `lib/stack-client.tsx`, `lib/query-client.ts`, and the `/pages/*` catch-all route.
7. Create the pages **layout** file with `QueryClientProvider` + `StackProvider`.
8. Run `@btst/cli generate` (and `migrate` for Kysely).

See [REFERENCE.md](REFERENCE.md) for full code shapes.

## Workflow

### 1) Install prerequisites and packages

- Prereqs: shadcn/ui (CSS variables enabled), Sonner `<Toaster />`, Tailwind v4.
- Install: `@btst/stack`, `@tanstack/react-query`, and one adapter:
  - `@btst/adapter-prisma` / `@btst/adapter-drizzle` / `@btst/adapter-kysely` / `@btst/adapter-mongodb`
  - `@btst/adapter-memory` — dev/testing only, not for production
- Install each plugin package alongside `@btst/stack` (they ship inside the monorepo package).

### 2) Register plugins (backend + client)

- **Backend** (`lib/stack.ts`): import `{plugin}BackendPlugin` from `@btst/stack/plugins/{plugin}/api`.
  - Pass hooks and config to the backend plugin factory (e.g. `blogBackendPlugin(hooks)`).
  - Use camelCase keys for plugins that have compound names: `aiChat`, `formBuilder`, `uiBuilder`.
- **Client** (`lib/stack-client.tsx`): import `{plugin}ClientPlugin` from `@btst/stack/plugins/{plugin}/client`.
  - Each client plugin factory receives: `{ apiBaseURL, apiBasePath, siteBaseURL, siteBasePath, queryClient, headers?, seo?, hooks? }`.
  - Pass `headers` from the incoming request for SSR authentication.

### 3) Configure backend stack

- Call `stack({ basePath: "/api/data", plugins: { ... }, adapter: (db) => createXxxAdapter(..., db, {}) })`.
- Export `handler` and `dbSchema`.
- **Memory adapter + Next.js**: pin to `globalThis` to avoid two instances in the same process:
  ```ts
  const g = global as typeof global & { __btst__?: ReturnType<typeof stack> }
  export const myStack = g.__btst__ ??= stack({ ... })
  export const { handler, dbSchema } = myStack
  ```

### 4) CSS — edit global stylesheet

Add one line per plugin **before** your Tailwind layers:
```css
@import "@btst/stack/plugins/blog/css";
@import "@btst/stack/plugins/cms/css";
@import "@btst/stack/plugins/ai-chat/css";
/* …one per selected plugin */
```
Do not duplicate — the patcher and manual edits must both be idempotent.

### 5) Wire framework routes and client runtime

- **API route**: catch-all at `/api/data/*`, forward GET/POST/PUT/PATCH/DELETE to `handler`.
- **Pages route**: catch-all at `/pages/*` — resolve via `stackClient.router.getRoute(path)`, run `route.loader?.()` server-side, wrap in `HydrationBoundary`.
- **Pages layout** (`"use client"` in Next.js): wrap in `QueryClientProvider` then `StackProvider`:
  - `basePath="/pages"` (must match your pages catch-all prefix)
  - `overrides={{ pluginKey: { apiBaseURL, apiBasePath, navigate, Link, Image?, refresh?, uploadImage?, ...hooks } }}`
  - Define a typed `PluginOverrides` interface importing `{Plugin}Overrides` from each plugin client package.
  - See [REFERENCE.md](REFERENCE.md) for the full per-plugin override shape and lifecycle hooks.

### 6) Generate schemas and run migrations

- Install `@btst/cli` as a dev dependency.
- Prisma: `npx @btst/cli generate --config=lib/stack.ts --orm=prisma --output=schema.prisma`
- Drizzle: `npx @btst/cli generate --config=lib/stack.ts --orm=drizzle --output=src/db/schema.ts`
- Kysely: `npx @btst/cli generate --config=lib/stack.ts --orm=kysely --output=migrations/schema.sql --database-url=...`
- Kysely migrate: `npx @btst/cli migrate --config=lib/stack.ts --database-url=...`
- Prisma/Drizzle: use native migration tooling after generate.

## Validation checklist

- `stack.ts` exports both `handler` and `dbSchema`.
- Every plugin is registered on both backend and client sides.
- API `basePath` and `stack({ basePath })` match exactly.
- Pages layout is `"use client"` and wraps `QueryClientProvider` then `StackProvider`.
- `StackProvider` `basePath` matches the `/pages` catch-all route prefix.
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
- **SSR headers for auth** — forward `await headers()` (Next.js) into `getStackClient(queryClient, { headers })` so plugins can read cookies/auth tokens during SSR.
