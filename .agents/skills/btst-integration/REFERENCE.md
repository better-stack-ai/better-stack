# BTST Integration — Reference

## lib/stack.ts shape

```ts
import { stack } from "@btst/stack"
import { createMemoryAdapter } from "@btst/adapter-memory"
import { blogBackendPlugin } from "@btst/stack/plugins/blog/api"
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api"
import { serverAuth } from "./authorization.server"
// import more plugins…

function createStack() {
  return stack({
    basePath: "/api/data",
    plugins: {
      blog: blogBackendPlugin({
        // optional domain hooks
        onPostCreated: async (post) => { /* revalidate, notify */ },
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
type AppStack = ReturnType<typeof createStack>
const g = globalThis as typeof globalThis & { __btst__?: AppStack }
export const myStack = g.__btst__ ??= createStack()

export const { handler, dbSchema } = myStack
```

**Rules:**
- For any real DB adapter (Drizzle, Prisma, Kysely, MongoDB), call the typed `createStack()` factory at module level — no `globalThis` needed.
- Only pin to `globalThis` when using `@btst/adapter-memory` in Next.js.
- `access: "authorized"` requires a bound `serverAuth`. Omitting `stack({ auth })` intentionally preserves permissive compatibility and does not protect operations.

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

**Next.js** (`app/pages/[[...all]]/page.tsx`):

```tsx
import { createNextPage } from "@btst/stack/next"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"

export const dynamic = "force-dynamic"
const page = createNextPage({
  getStackClient,
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

const page = createReactRouterPage({
  getStackClient,
  getQueryClient: getOrCreateQueryClient,
})
export const loader = page.loader
export const meta = page.meta
export const ErrorBoundary = page.ErrorBoundary
export default page.Component
```

**TanStack Start** (`src/routes/pages/$.tsx`):

```tsx
import { createFileRoute } from "@tanstack/react-router"
import { createTanStackPageOptions } from "@btst/stack/tanstack"
import { getStackClient } from "@/lib/stack-client"

export const Route = createFileRoute("/pages/$")(
  createTanStackPageOptions({ getStackClient }),
)
```

The entry factories own route matching, loader-before-meta ordering,
dehydration, and framework 404 behavior. Do not duplicate that plumbing in
consumer routes.

---

## getBaseURL helper

A server/client-safe URL helper for the resolved client stack runtime.

```ts
// Next.js
const getBaseURL = () =>
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000")

// Vite (React Router / TanStack)
const getBaseURL = () =>
  typeof window !== "undefined"
    ? (import.meta.env.VITE_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:5173")
```

---

## lib/stack-client.tsx shape

```tsx
import { createClientStack } from "@btst/stack/client"
import { blogClientPlugin } from "@btst/stack/plugins/blog/client"
import { QueryClient } from "@tanstack/react-query"

const getBaseURL = () => /* see above */

export const getStackClient = (
  queryClient: QueryClient,
  options?: { headers?: HeadersInit },
) => {
  const baseURL = getBaseURL()
  return createClientStack({
    api: { baseURL, basePath: "/api/data", headers: options?.headers },
    site: { baseURL, basePath: "/pages" },
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
  })
}
```

**Shared client stack fields:**

| Field | Required | Description |
|---|---|---|
| `api` | Yes | API base URL/path and optional per-request headers/credentials |
| `site` | Yes | Site base URL and pages path |
| `queryClient` | Yes | The QueryClient for this request |

Blog and new v3 client definitions receive only plugin-specific options such
as `seo`, `hooks`, and `pageComponents`. Unmigrated first-party plugins may
temporarily retain shared runtime fields until their migration tickets land;
do not use that compatibility shape for new definitions.

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
and pass it to `stack({ auth: serverAuth })`. Operations derive trusted facts and
evaluate exact permission descriptors before lifecycle hooks. Do not use hooks
for routine authorization. Do not pass `currentUserId`,
`loginHref`, request headers, API paths, or navigation functions to public
plugin components.

Per-request headers belong on `createClientStack({ api: { headers } })`; they
are not plugin options, provider overrides, or component identity props.

---

## StackProvider — pages layout

The pages layout must be `"use client"` and wrap `QueryClientProvider` then `StackProvider`.

```tsx
// Next.js: app/pages/layout.tsx
"use client"
import { useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { StackProvider } from "@btst/stack/context"
import { nextRouter } from "@btst/stack/next"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"

export default function PagesLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getOrCreateQueryClient())
  const clientStack = getStackClient(queryClient)

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
- `mode: "authenticated" | "public"` — conversation persistence mode
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

Backend plugins accept a hooks object as their factory argument. Common hooks:

**blog**
```ts
blogBackendPlugin({
  onBeforeCreatePost: async (data) => { /* domain validation */ },
  onBeforeUpdatePost: async (postId) => { /* domain validation */ },
  onBeforeDeletePost: async (postId) => { /* audit */ },
  onBeforeListPosts: async (filter) => { /* telemetry */ },
  onPostCreated: async (post) => { revalidatePath("/pages/blog") },
  onPostUpdated: async (post) => { /* … */ },
  onPostDeleted: async (postId) => { /* … */ },
})
```

**comments**
```ts
commentsBackendPlugin({
  autoApprove: false,
  resolveUser: async (authorId) => ({ name: "…" }),
  onBeforePost: async (input, ctx) => { /* domain validation */ },
  onBeforeEdit: async (commentId, update, ctx) => { /* domain validation */ },
  onBeforeStatusChange: async (commentId, status, ctx) => { /* audit */ },
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
    onConversationCreated: async (convo) => { /* … */ },
    onAfterChat: async (conversationId, messages) => { /* … */ },
    onBeforeToolsActivated: async (toolNames, routeName, ctx) => toolNames,
  },
})
```
