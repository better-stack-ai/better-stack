# BTST

<div align="center">

## Add complete features to the React app you already own.

BTST is an open-source TypeScript system for installing full-stack features into existing React applications. It is built for React/TypeScript developers and small product teams adding a substantial feature to an app they already have.

A full-stack plugin can bring the routes, APIs, database schema, hooks, SSR-aware pages, and customizable UI that its feature needs. Start with one plugin and add more only when they are useful.

**You own the whole application.** Your app, data, deployment, and ejected UI stay yours. BTST runs inside your stack as an open-source dependency you can inspect, fork, or replace—never as a required hosted control plane.

[![npm](https://img.shields.io/npm/v/@btst/stack.svg)](https://www.npmjs.com/package/@btst/stack)
[![MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Quickstart with Blog](https://www.better-stack.ai/docs/cli#init-codegen) · [View live result](https://www.better-stack.ai/p/blog) · [Read the docs](https://www.better-stack.ai/docs)

</div>

---

## What is BTST?

BTST delivers complete features through npm packages. It is more complete than
a UI kit, more incremental than a starter application, and more ownable than a
hosted feature service.

```bash
npx @btst/codegen@0.2.0 init --plugins blog
```

The initializer adds BTST to an existing Next.js App Router, React Router v7,
or TanStack Start application. You can also follow the detailed
[manual installation guide](https://www.better-stack.ai/docs/installation).

### Available plugins

| Plugin | Topology | Description |
|--------|----------|-------------|
| **Blog** | Full-stack | Content management, editor, drafts, publishing, SEO, RSS feeds |
| **AI Chat** | Full-stack | AI-powered chat with conversation history, streaming, and customizable models |
| **CMS** | Full-stack | Headless CMS with custom content types, Zod schemas, and auto-generated forms |
| **Form Builder** | Full-stack | Dynamic form builder with drag-and-drop editor, submissions, and validation |
| **UI Builder** | Client-only · requires CMS | Visual drag-and-drop page builder with component registry and public rendering |
| **Kanban** | Full-stack | Project management with boards, columns, tasks, drag-and-drop, and priority levels |
| **Media** | Full-stack | Media library with uploads, folders, picker UI, URL registration, and reusable image inputs |
| **OpenAPI** | Backend-only | Auto-generated API documentation with interactive Scalar UI |
| **Route Docs** | Client-only | Auto-generated client route documentation with interactive navigation |
| **Comments** | Full-stack | Commenting system with moderation, likes, and nested replies |
| **Better Auth UI** | Companion · requires Better Auth | Auth and account UI for an existing Better Auth backend |

Full-stack plugins ship separate frontend and backend definitions. Intentional
one-sided plugins stay one-sided, dependent plugins name what they require, and
companions connect BTST to a system the application already runs.

**Want a specific plugin?** [Open an issue](https://github.com/better-stack-ai/better-stack/issues/new) and let us know!

---

## Why use it?

* **Installable features** – routes, APIs, data models, pages, and UI where the plugin supplies them
* **Framework-flexible** – maintained v3 integration paths for Next.js App Router, React Router v7, and TanStack Start
* **Database adapters** – versioned adapters for Prisma, Drizzle, Kysely, and MongoDB
* **Incremental adoption** – install one feature without replacing your application foundation
* **Type-safe** – end-to-end TypeScript

Your application, database, and deployment remain under your control.

---

## Minimal setup (Next.js)

```ts title="lib/stack.ts"
import { createBackendStack } from "@btst/stack/api"
import { blogBackendPlugin } from "@btst/stack/plugins/blog/api"
import { createMemoryAdapter } from "@btst/adapter-memory"

function createAppStack() {
  return createBackendStack({
    basePath: "/api/data",
    plugins: {
      blog: blogBackendPlugin()
    },
    adapter: (db) => createMemoryAdapter(db)({})
  })
}

type AppStack = ReturnType<typeof createAppStack>
const globalForStack = globalThis as typeof globalThis & {
  __btst_stack__?: AppStack
}
export const myStack = globalForStack.__btst_stack__ ??= createAppStack()
export const { handler, dbSchema } = myStack
```

```tsx title="lib/stack-client.tsx"
import {
  createClientStack,
  type ClientPluginEndpointOverride,
} from "@btst/stack/client"
import { blogClientPlugin } from "@btst/stack/plugins/blog/client"
import type { QueryClient } from "@tanstack/react-query"

export interface StackClientOptions {
  apiOrigin: string
  siteOrigin: string
}

export function createAppClientStack(
  queryClient: QueryClient,
  options: StackClientOptions & { headers?: HeadersInit },
) {
  const { apiOrigin, siteOrigin } = options
  const crossOriginBlogEndpoint = apiOrigin === siteOrigin
    ? undefined
    : {
        api: {
          baseURL: apiOrigin,
          basePath: "/api/data",
          credentials: "include",
        },
      } satisfies ClientPluginEndpointOverride

  return createClientStack({
    api: {
      baseURL: apiOrigin,
      basePath: "/api/data",
      ...(options.headers ? { headers: options.headers } : {}),
    },
    site: { baseURL: siteOrigin, basePath: "/pages" },
    queryClient,
    plugins: {
      blog: blogClientPlugin()
    },
    ...(crossOriginBlogEndpoint
      ? { endpoints: { blog: crossOriginBlogEndpoint } }
      : {}),
  })
}

export function getStackClient(
  queryClient: QueryClient,
  options: StackClientOptions,
) {
  return createAppClientStack(queryClient, options)
}
```

The generated `lib/stack-client.server.ts` resolves these origins from trusted
deployment configuration (`BTST_API_URL` and `BTST_SITE_URL`), defaults the API
to the trusted site origin, and forwards filtered credentials only to that API.
It fails closed in production if no trusted origin is available.
Existing same-origin Next.js installs may keep `NEXT_PUBLIC_BASE_URL` while
migrating; new deployments should prefer the separate site/API variables.

Use the v3 framework entry factories for the two catch-all routes:

```ts title="app/api/data/[[...all]]/route.ts"
import { toNextRouteHandlers } from "@btst/stack/next"
import { handler } from "@/lib/stack"

export const { GET, POST, PUT, PATCH, DELETE } =
  toNextRouteHandlers(handler)
```

```tsx title="app/(request)/pages/[[...all]]/page.tsx"
import { createNextPage } from "@btst/stack/next"
import { headers } from "next/headers"
import { getStackClientForRequest } from "@/lib/stack-client.server"
import { getOrCreateQueryClient } from "@/lib/query-client"

export const dynamic = "force-dynamic"

const page = createNextPage({
  getStackClient: async (queryClient) =>
    getStackClientForRequest(queryClient, {
      headers: new Headers(await headers()),
    }),
  getQueryClient: getOrCreateQueryClient,
})
export default page.Page
export const generateMetadata = page.generateMetadata
```

The request layout at `app/(request)/pages/layout.tsx` hydrates trusted client
origins into the shared provider in `app/pages/client-layout.tsx`. Put SSG/ISR
routes under `app/(static)/pages` with a header-free layout; route groups do not
change the public `/pages/*` URLs.

Wrap the pages subtree with one `StackProvider`:

```tsx
// app/pages/client-layout.tsx
"use client"

function PagesClientLayout({ children, clientOrigins }: {
  children: React.ReactNode
  clientOrigins: StackClientOptions
}) {
  const queryClient = getOrCreateQueryClient()
  const clientStack = useMemo(
    () => getStackClient(queryClient, clientOrigins),
    [clientOrigins.apiOrigin, clientOrigins.siteOrigin, queryClient],
  )

  return (
    <QueryClientProvider client={queryClient}>
      <StackProvider
        stack={clientStack}
        router={nextRouter()}
        auth={authProvider}
        overrides={{ blog: { uploadImage } }}
      >
        {children}
      </StackProvider>
    </QueryClientProvider>
  )
}
```

API, site, and QueryClient runtime belong on the resolved client stack; router
and auth services belong on the provider. Plugin overrides contain only
plugin-specific customization. See the [full installation guide](https://www.better-stack.ai/docs/installation)
for QueryClient wiring, database adapters, all three frameworks, and auth.

## Database schemas & migrations

Generate schemas and run migrations through the v3 codegen CLI. It runs the
aligned Better DB CLI in isolation, so its dependencies and `btst` binary do
not enter your application graph:

```bash
npx @btst/codegen@0.2.0 generate --orm drizzle --config lib/stack.ts --output db/schema.ts
```

Versioned adapter packages are available for Prisma, Drizzle, MongoDB, and
Kysely SQL dialects. Follow the
[installation guide](https://www.better-stack.ai/docs/installation) for their
current versions and setup requirements.

---

## Shadcn Registry

Each plugin's UI layer is available as a [shadcn registry](https://ui.shadcn.com/docs/registry) block. Use it to **eject and fully customize** the page components while keeping all data-fetching and API logic from `@btst/stack`:

```bash
# Install a single plugin's UI (for example, Media)
npx shadcn@latest add https://github.com/better-stack-ai/better-stack/blob/main/packages/stack/registry/btst-media.json

# Or install the full collection
npx shadcn@latest add https://github.com/better-stack-ai/better-stack/blob/main/packages/stack/registry/registry.json
```

Components are copied into `src/components/btst/{plugin}/client/` — all relative imports remain valid and you can edit them freely.

---

## AI Agent Skills

If you're using an AI coding agent (Cursor, Claude Code, VS Code, OpenAI Codex etc.) you can install the BTST integration skill so your agent understands the plugin system, adapter setup, and wiring patterns out of the box:

```bash
npx skills@latest add better-stack-ai/better-stack/.agents/skills/btst-integration
```

Or manually copy [`skills/btst-integration/SKILL.md`](./.agents/skills/btst-integration/SKILL.md) into your project's agent skills directory.

---

## Live Demo

Try the interactive playground:

* [Next.js](https://www.better-stack.ai/playground?plugins=blog,ai-chat,comments&framework=nextjs&view=preview)
* [React Router](https://www.better-stack.ai/playground?plugins=blog,ai-chat,comments&framework=react-router&view=preview)
* [TanStack Router](https://www.better-stack.ai/playground?plugins=blog,ai-chat,comments&framework=tanstack&view=preview)

---

## Learn more

Full documentation, guides, and plugin development:
👉 **[https://www.better-stack.ai](https://www.better-stack.ai)**

---

## Contributing

Bug reports, plugin PRs, and documentation improvements are welcome.
See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the plugin development guide, testing instructions, and submission checklist.
Public-facing copy should follow the **[BTST message and claims contract](./docs/positioning.md)**.

---

If this saves you time, a ⭐ helps others find it.

MIT © [olliethedev](https://github.com/olliethedev)
