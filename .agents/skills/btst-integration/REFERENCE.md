# BTST Integration — Reference

## lib/stack.ts shape

```ts
import { createBackendStack } from "@btst/stack/api"
import { createMemoryAdapter } from "@btst/adapter-memory"
import { blogBackendPlugin } from "@btst/stack/plugins/blog/api"
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api"
import { openai } from "@ai-sdk/openai"
import { serverAuth } from "./authorization.server"
// import more plugins…

function createAppStack() {
  return createBackendStack({
    basePath: "/api/data",
    plugins: {
      blog: blogBackendPlugin({
        hooks: {
          // optional domain hooks
          onAfterCreatePost: async (post) => { /* revalidate, notify */ },
        },
      }),
      aiChat: aiChatBackendPlugin({
        model: openai("gpt-4o"),
        systemPrompt: "You are a helpful assistant.",
        access: "authorized",
      }),
      // add more plugins…
    },
    adapter: (db) => createMemoryAdapter(db)({}),
    auth: serverAuth,
  })
}

// Memory adapter + Next.js: pin the exact app type across API and page bundles.
type AppStack = ReturnType<typeof createAppStack>
const g = globalThis as typeof globalThis & { __btst__?: AppStack }
export const myStack = g.__btst__ ??= createAppStack()

export const { handler, dbSchema } = myStack
```

**Rules:**
- For any real DB adapter (Drizzle, Prisma, Kysely, MongoDB), call the typed `createBackendStack()` factory at module level — no `globalThis` needed.
- Only pin to `globalThis` when using `@btst/adapter-memory` in Next.js.
- `access: "authorized"` requires a bound `serverAuth`. Omitting `createBackendStack({ auth })` intentionally preserves permissive compatibility and does not protect operations.

---

## lib/query-client.ts shape

```ts
import { QueryClient } from "@tanstack/react-query"

// Next.js: singleton pattern — one QueryClient per server request, reused on client
let queryClientSingleton: QueryClient | undefined

export function getOrCreateQueryClient() {
  if (typeof window === "undefined") {
    // Server: always create a new instance so requests don't share data
    return new QueryClient({
      defaultOptions: { queries: { staleTime: 60 * 1000 } },
    })
  }
  // Client: reuse the same instance across navigations
  return (queryClientSingleton ??= new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  }))
}
```

---

## API catch-all route

**Next.js** (`app/api/data/[[...all]]/route.ts`):

```ts
import { toNextRouteHandlers } from "@btst/stack/next"
import { handler } from "@/lib/stack"

export const { GET, POST, PUT, PATCH, DELETE } =
  toNextRouteHandlers(handler)
```

**React Router v7** (`app/routes/api/data/$.ts`):

```ts
import { toReactRouterHandlers } from "@btst/stack/react-router"
import { handler } from "~/lib/stack"

const handlers = toReactRouterHandlers(handler)
export const loader = handlers.loader
export const action = handlers.action
```

**TanStack Start** (`src/routes/api/data/$.ts`):

```ts
import { createFileRoute } from "@tanstack/react-router"
import { toTanStackHandlers } from "@btst/stack/tanstack"
import { handler } from "@/lib/stack"

export const Route = createFileRoute("/api/data/$")({
  server: { handlers: toTanStackHandlers(handler) },
})
```
---

## Pages catch-all route

**Next.js** (`app/(request)/pages/[[...all]]/page.tsx`):

```tsx
import { createNextPage } from "@btst/stack/next"
import { headers } from "next/headers"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClientForRequest } from "@/lib/stack-client.server"

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

**React Router v7** (`app/routes/pages/$.tsx`):

```tsx
import { createReactRouterPage } from "@btst/stack/react-router"
import { getOrCreateQueryClient } from "~/lib/query-client"
import { getStackClient } from "~/lib/stack-client"
import { getStackClientForRequest } from "~/lib/stack-client.server"

const page = createReactRouterPage({
  getStackClient,
  getQueryClient: getOrCreateQueryClient,
})
export const loader = page.createLoader((queryClient, { request }) =>
  getStackClientForRequest(queryClient, {
    headers: request.headers,
    requestOrigin: new URL(request.url).origin,
  }),
)
export const meta = page.meta
export const ErrorBoundary = page.ErrorBoundary
export default page.Component
```

**TanStack Start** (`src/routes/pages/$.tsx`):

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { createTanStackPageOptions } from "@btst/stack/tanstack"
import type { QueryClient } from "@tanstack/react-query"
import { createIsomorphicFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"
import { getStackClientForRequest } from "@/lib/stack-client.server"
import { getTrustedClientOrigins } from "@/lib/stack-client.origins"

const getLoaderRequestContext = createIsomorphicFn()
  .server(() => {
    const request = getRequest()
    return {
      headers: request.headers,
      requestOrigin: new URL(request.url).origin,
    }
  })
  .client(() => undefined)

const getNavigationClientStack = async (queryClient: QueryClient) =>
  getStackClient(queryClient, await getTrustedClientOrigins())

export const Route = createFileRoute("/pages/$")(
  createTanStackPageOptions({
    getStackClient,
    getLoaderStackClient: async (queryClient) => {
      const requestContext = await getLoaderRequestContext()
      return requestContext
        ? getStackClientForRequest(queryClient, requestContext)
        : getNavigationClientStack(queryClient)
    },
    getQueryClient: getOrCreateQueryClient,
  }),
)
```

The entry factories own route matching, loader-before-meta ordering,
dehydration, and framework 404 behavior. Do not duplicate that plumbing in
consumer routes.

---

## lib/stack-client.tsx shape

```tsx
import {
  createClientStack,
  type ClientPluginEndpointOverride,
} from "@btst/stack/client"
import { blogClientPlugin } from "@btst/stack/plugins/blog/client"
import type { QueryClient } from "@tanstack/react-query"

/** Browser-safe origins resolved once by the server layout. */
export interface StackClientOptions {
  /** Trusted destination for browser API requests. */
  apiOrigin?: string
  /** Trusted public origin used to build application links. */
  siteOrigin?: string
}

export function createAppClientStack(
  queryClient: QueryClient,
  options?: StackClientOptions & { headers?: HeadersInit },
) {
  const siteOrigin = getSiteOrigin(options?.siteOrigin)
  const apiOrigin = getApiOrigin(options?.apiOrigin, siteOrigin)
  const crossOriginBlogEndpoint = getCrossOriginBlogEndpoint(
    apiOrigin,
    siteOrigin,
  )

  return createClientStack({
    api: {
      baseURL: apiOrigin,
      basePath: "/api/data",
      ...(options?.headers ? { headers: options.headers } : {}),
    },
    site: { baseURL: siteOrigin, basePath: "/pages" },
    queryClient,
    plugins: {
      blog: blogClientPlugin({
        seo: { siteName: "My App" }, // optional
        hooks: {                     // optional client-side loader hooks
          beforeLoadPost: async (slug, ctx) => { /* ... */ },
          afterLoadPost: async (post, slug, ctx) => { /* ... */ },
          onErrorLoad: async (error, ctx) => { /* ... */ },
        },
      }),
      // add more plugins…
    },
    ...(crossOriginBlogEndpoint
      ? { endpoints: { blog: crossOriginBlogEndpoint } }
      : {}),
  })
}

export function getStackClient(
  queryClient: QueryClient,
  options?: StackClientOptions,
) {
  return createAppClientStack(queryClient, options)
}

function getSiteOrigin(serverOrigin?: string) {
  if (serverOrigin) return serverOrigin
  if (typeof window !== "undefined") {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      window.location.origin
    )
  }
  return (
    process.env.BTST_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    "http://localhost:3000"
  )
}

function getApiOrigin(serverOrigin: string | undefined, siteOrigin: string) {
  if (serverOrigin) return serverOrigin
  if (typeof window !== "undefined") {
    return (
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      siteOrigin
    )
  }
  return (
    process.env.BTST_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL ||
    siteOrigin
  )
}

function getCrossOriginBlogEndpoint(apiOrigin: string, siteOrigin: string) {
  if (apiOrigin === siteOrigin) return undefined
  return {
    api: {
      baseURL: apiOrigin,
      basePath: "/api/data",
      credentials: "include",
    },
  } satisfies ClientPluginEndpointOverride
}
```

The CLI emits the equivalent Vite helper with
`VITE_PUBLIC_SITE_URL`/`VITE_PUBLIC_API_URL`. The server companion calls
`resolveTrustedClientOrigins()` and fails closed in production when it cannot
resolve a configured site/API origin. `BTST_API_URL` may point to a managed or
custom backend; the browser receives that same trusted snapshot instead of
reconstructing it from `window.location`.

## lib/stack-client.server.ts shape

Keep credential forwarding in a server-only helper. The configured API origin
wins even when a reverse proxy or custom frontend domain has a different
request origin. Missing production configuration fails closed; request-derived
fallbacks are accepted only for HTTP(S) loopback development.

```ts
import {
  filterCredentialForwardingHeaders,
  resolveTrustedClientOrigins,
} from "@btst/stack/client/server"
import type { QueryClient } from "@tanstack/react-query"
import { createAppClientStack } from "./stack-client"

function configuredApiOrigin() {
  return (
    process.env.BTST_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL
  )
}

function configuredSiteOrigin() {
  return (
    process.env.BTST_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BASE_URL
  )
}

function requestOriginFromHeaders(headers: Headers) {
  const host = (headers.get("x-forwarded-host") || headers.get("host"))
    ?.split(",")[0]
    ?.trim()
  if (!host) return undefined
  const protocol =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http"
  return `${protocol}://${host}`
}

export function getServerClientOrigins(requestOrigin?: string) {
  return resolveTrustedClientOrigins({
    configuredApiOrigin: configuredApiOrigin(),
    configuredSiteOrigin: configuredSiteOrigin(),
    requestOrigin,
    isProduction: process.env.NODE_ENV === "production",
    apiLabel: "BTST_API_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_BASE_URL, or BASE_URL",
    siteLabel: "BTST_SITE_URL, NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_BASE_URL, or BASE_URL",
  })
}

export function getServerClientOriginsFromHeaders(headers: HeadersInit) {
  const requestHeaders = new Headers(headers)
  return getServerClientOrigins(requestOriginFromHeaders(requestHeaders))
}

export function getStackClientForRequest(
  queryClient: QueryClient,
  options: { headers: HeadersInit; requestOrigin?: string },
) {
  const requestHeaders = new Headers(options.headers)
  const origins = options.requestOrigin
    ? getServerClientOrigins(options.requestOrigin)
    : getServerClientOriginsFromHeaders(requestHeaders)
  const headers = filterCredentialForwardingHeaders(requestHeaders)
  return createAppClientStack(queryClient, { ...origins, headers })
}
```

Generated Vite helpers use the corresponding `VITE_PUBLIC_*` variables. Never
serialize request headers or a resolved server stack into a provider.
`NEXT_PUBLIC_BASE_URL` (or `VITE_PUBLIC_BASE_URL`) remains a narrow
migration-compatible same-origin fallback; new deployments should prefer the
separate site/API variables above.

**Shared client stack fields:**

| Field | Required | Description |
|---|---|---|
| `api` | Yes | API base URL/path and optional per-request headers/credentials |
| `site` | Yes | Site base URL and pages path |
| `queryClient` | Yes | The QueryClient for this request |

Client definitions receive only plugin-specific options such as `seo`,
`hooks`, and `pageComponents`. Shared API/site/QueryClient runtime belongs only
on `createClientStack()`.

---

## Auth wiring

Identity and client permissions belong on the top-level provider:

```tsx
import { createClientAuth } from "@btst/stack/authorization/client"
import { authorization } from "./authorization"

const clientAuth = createClientAuth({
  authorization,
  getIdentity: async () => (await getSession())?.user ?? null,
  loginPath: "/login",
})

<StackProvider
  stack={clientStack}
  router={nextRouter()}
  auth={clientAuth}
>
  {children}
</StackProvider>
```

Create the backend adapter with `createServerAuth({ authorization, getIdentity })`
and pass it to `createBackendStack({ auth: serverAuth })`. Operations derive trusted facts and
evaluate exact permission descriptors before lifecycle hooks. Do not use hooks
for routine authorization. Do not pass `currentUserId`,
`loginHref`, request headers, API paths, or navigation functions to public
plugin components.

Per-request headers belong on `createClientStack({ api: { headers } })`; they
are not plugin options, provider overrides, or component identity props.

---

## StackProvider — shared client layout

The shared provider must be `"use client"` and wrap `QueryClientProvider` then
`StackProvider`. It receives only the trusted, serializable client origins from
the server wrapper.

```tsx
// Next.js: app/pages/client-layout.tsx
"use client"
import { useMemo } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { StackProvider } from "@btst/stack/context"
import { nextRouter } from "@btst/stack/next"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient, type StackClientOptions } from "@/lib/stack-client"

export default function PagesClientLayout({ children, clientOrigins }: {
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
        overrides={{
          blog: {
            uploadImage: myUploadFn,         // optional: returns uploaded URL
            // lifecycle hooks (all optional):
            onRouteRender: async (routeName, ctx) => { /* analytics, logging */ },
            onRouteError: async (routeName, err, ctx) => { /* error tracking */ },
          },
        }}
      >
        {children}
      </StackProvider>
    </QueryClientProvider>
  )
}
```

The request wrapper at `app/(request)/pages/layout.tsx` calls
`getServerClientOriginsFromHeaders(await headers())`. The header-free wrapper at
`app/(static)/pages/layout.tsx` calls `getServerClientOrigins()` for SSG/ISR.
Both groups publish the same `/pages/*` URLs; never serialize the resolved
request stack or request headers into the client layout.

React Router serializes the same snapshot from its layout loader and reuses it
for the provider:

```tsx
import { StackProvider } from "@btst/stack/context"
import { reactRouter } from "@btst/stack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  Outlet,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router"
import { getOrCreateQueryClient } from "~/lib/query-client"
import { getStackClient } from "~/lib/stack-client"
import { getServerClientOrigins } from "~/lib/stack-client.server"

export function loader({ request }: LoaderFunctionArgs) {
  return getServerClientOrigins(new URL(request.url).origin)
}

export default function BtstPagesLayout() {
  const queryClient = getOrCreateQueryClient()
  const { apiOrigin, siteOrigin } = useLoaderData<typeof loader>()
  const clientStack = useMemo(
    () => getStackClient(queryClient, { apiOrigin, siteOrigin }),
    [apiOrigin, queryClient, siteOrigin],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <StackProvider stack={clientStack} router={reactRouter()}>
        <Outlet />
      </StackProvider>
    </QueryClientProvider>
  )
}
```

TanStack Start exposes that server snapshot through a server function so both
initial hydration and later client navigation keep a managed API origin:

```ts
// src/lib/stack-client.origins.ts
import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { getServerClientOrigins } from "./stack-client.server"

export const getTrustedClientOrigins = createServerFn({ method: "GET" })
  .handler(() => {
    const request = getRequest()
    return getServerClientOrigins(new URL(request.url).origin)
  })
```

The `/pages` route loader returns `getTrustedClientOrigins()` and its provider
calls `getStackClient(queryClient, { apiOrigin, siteOrigin })`, exactly like the
React Router layout above. The TanStack catch-all route also calls the server
function during client navigation, as shown in the route example earlier.

### StackProvider props

| Prop | Required | Description |
|---|---|---|
| `stack` | Yes | Resolved client stack; projects API, site, QueryClient, and inferred override types |
| `router` | No | Framework router preset shared by every plugin |
| `auth` | No | Identity, login path, and permission provider |
| `overrides` | No | Plugin-specific override objects, keyed by plugin name |

### Top-level provider fields

| Field | Description |
|---|---|
| `stack` | Resolved API, site, QueryClient, routes, and plugin registrations |
| `router` | Framework `Link`, `Image`, `navigate`, and `refresh` implementation |
| `auth` | Identity, login path, and authorization checks |

### Lifecycle hooks (available on most plugins)

| Hook | When |
|---|---|
| `onRouteRender(routeName, ctx)` | After a plugin page renders (SSR or CSR) |
| `onRouteError(routeName, err, ctx)` | On plugin route render error |

`ctx` contains `{ isSSR: boolean, path: string }`.

### Plugin-specific override extras

**blog**
- `postBottomSlot: (post) => ReactNode` — injected below each blog post (e.g. `<CommentThread />`)
- `imagePicker`, `imageInputField` — custom image picker components

**ai-chat**
- `aiChatClientPlugin({ mode: "authenticated" | "public" })` — the single
  conversation persistence-mode configuration; do not repeat it in provider
  overrides or component props
- `uploadFile(file): Promise<string>` — for chat file attachments
- `chatSuggestions: string[]` — pre-filled prompt suggestions
- **Root layout requirement**: wrap the root layout (above all `StackProvider` instances) with `PageAIContextProvider` from `@btst/stack/plugins/ai-chat/client/context`. Individual pages then call `useRegisterPageAIContext()` — see the `btst-ai-context` skill.

**ui-builder**
- `componentRegistry` — pass `defaultComponentRegistry` or a custom one

**kanban**
- `resolveUser(id): Promise<{ name, avatar? }>` — assignee display
- `searchUsers(query): Promise<User[]>` — assignee search
- `taskDetailBottomSlot: (task) => ReactNode` — inject below task detail (e.g. comments)

**comments**
- `resourceLinks` and comment display/editing defaults live in the plugin override.
- `<CommentThread />` receives `resourceId` and `resourceType`; it reads API, identity, and login path from `StackProvider`.

**media**
- `queryClient` — pass the current QueryClient explicitly
- `uploadMode: "direct"` — direct-to-storage upload

---

## CSS imports reference

```css
/* Add to your global stylesheet, after @import "tailwindcss" */
@import "@btst/stack/plugins/blog/css";
@import "@btst/stack/plugins/cms/css";
@import "@btst/stack/plugins/ai-chat/css";
@import "@btst/stack/plugins/form-builder/css";
@import "@btst/stack/plugins/ui-builder/css";
@import "@btst/stack/plugins/kanban/css";
@import "@btst/stack/plugins/comments/css";
@import "@btst/stack/plugins/route-docs/css";
```

No CSS import is needed for: `media`, `open-api`.

---

## Backend plugin hooks reference

Backend plugins accept lifecycle callbacks under their factory's `hooks`
option. Common hooks:

**blog**
```ts
blogBackendPlugin({
  hooks: {
    onBeforeCreatePost: async (data) => { /* domain validation */ },
    onBeforeUpdatePost: async (postId) => { /* domain validation */ },
    onBeforeDeletePost: async (postId) => { /* audit */ },
    onBeforeListPosts: async (filter) => { /* telemetry */ },
    onAfterCreatePost: async (post) => { revalidatePath("/pages/blog") },
    onAfterUpdatePost: async (post) => { /* … */ },
    onAfterDeletePost: async (postId) => { /* … */ },
  },
})
```

**comments**
```ts
commentsBackendPlugin({
  autoApprove: false,
  resolveUser: async (authorId) => ({ name: "…" }),
  hooks: {
    onBeforeCreateComment: async (input, ctx) => { /* domain validation */ },
    onBeforeUpdateComment: async (commentId, update, ctx) => { /* domain validation */ },
    onBeforeModerateComment: async (commentId, status, ctx) => { /* audit */ },
  },
})
```

**ai-chat**
```ts
aiChatBackendPlugin({
  model: openai("gpt-4o"),
  systemPrompt: "…",
  access: "authorized",
  tools: { myTool },
  enablePageTools: true,
  hooks: {
    onAfterCreateConversation: async (convo) => { /* … */ },
    onAfterChat: async (conversationId, messages) => { /* … */ },
    onBeforeActivateTools: async (toolNames, routeName, ctx) => toolNames,
  },
})
```
