# BTST Integration — Reference

## lib/stack.ts shape

```ts
import { stack } from "@btst/stack"
import { createDrizzleAdapter } from "@btst/adapter-drizzle"  // or prisma / kysely / mongodb / memory
import { blogBackendPlugin } from "@btst/stack/plugins/blog/api"
import { aiChatBackendPlugin } from "@btst/stack/plugins/ai-chat/api"
// import more plugins…

// Memory adapter + Next.js: pin to globalThis to share one instance across API and page bundles
const g = global as typeof global & { __btst__?: ReturnType<typeof stack> }

export const myStack = g.__btst__ ??= stack({
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
  adapter: (db) => createDrizzleAdapter(schema, db, {}),
  // For memory adapter: adapter: (db) => createMemoryAdapter(db)({})
})

export const { handler, dbSchema } = myStack
```

**Rules:**
- For any real DB adapter (Drizzle, Prisma, Kysely, MongoDB), just call `stack()` at module level — no `globalThis` needed.
- Only pin to `globalThis` when using `@btst/adapter-memory` in Next.js.

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

A server/client-safe URL helper for client plugin factory configuration and the
top-level `StackProvider.api` service.

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
import { createStackClient } from "@btst/stack/client"
import { blogClientPlugin } from "@btst/stack/plugins/blog/client"
import { QueryClient } from "@tanstack/react-query"

const getBaseURL = () => /* see above */

export const getStackClient = (queryClient: QueryClient) => {
  const baseURL = getBaseURL()
  return createStackClient({
    plugins: {
      blog: blogClientPlugin({
        apiBaseURL: baseURL,
        apiBasePath: "/api/data",
        siteBaseURL: baseURL,
        siteBasePath: "/pages",
        queryClient,
        seo: { siteName: "My App" }, // optional
        hooks: {                     // optional client-side loader hooks
          beforeLoadPost: async (slug, ctx) => { /* ... */ },
          afterLoadPost: async (post, slug, ctx) => { /* ... */ },
          onLoadError: async (error, ctx) => { /* ... */ },
        },
      }),
      // add more plugins…
    },
  })
}
```

**Common client plugin config fields** (all plugins):

| Field | Required | Description |
|---|---|---|
| `apiBaseURL` | Yes | Base URL for API calls (absolute) |
| `apiBasePath` | Yes | API route prefix, e.g. `/api/data` |
| `siteBaseURL` | Yes | Base URL for generated page links |
| `siteBasePath` | Yes | Pages route prefix, e.g. `/pages` |
| `queryClient` | Yes | The QueryClient for this request |
| `headers` | No | Pass incoming request headers for SSR auth |
| `seo` | No | `{ siteName, description, author, twitterHandle, … }` |
| `hooks` | No | Client-side loader hooks (see per-plugin docs) |

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
  basePath="/pages"
  router={nextRouter()}
  api={{ baseURL, basePath: "/api/data" }}
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

Optional `headers` fields declared by a client plugin belong in that plugin's
factory config for SSR loader hooks; they are not provider overrides or
component identity props.

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
import type { BlogPluginOverrides } from "@btst/stack/plugins/blog/client"

type PluginOverrides = {
  blog: BlogPluginOverrides
  // add one entry per plugin
}

export default function PagesLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getOrCreateQueryClient())
  const baseURL = getBaseURL()

  return (
    <QueryClientProvider client={queryClient}>
      <StackProvider<PluginOverrides>
        basePath="/pages"
        router={nextRouter()}
        api={{ baseURL, basePath: "/api/data" }}
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
| `basePath` | Yes | Must match your `/pages/*` catch-all route prefix |
| `router` | No | Framework router preset shared by every plugin |
| `api` | No | Client-side API base URL and path shared by every plugin |
| `auth` | No | Identity, login path, and permission provider |
| `overrides` | No | Plugin-specific override objects, keyed by plugin name |

### Top-level provider fields

| Field | Description |
|---|---|
| `router` | Framework `Link`, `Image`, `navigate`, and `refresh` implementation |
| `api` | Client API `baseURL` and `basePath` |
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
