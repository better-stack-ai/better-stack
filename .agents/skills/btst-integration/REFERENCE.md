# BTST Integration — Reference

## getBaseURL helper

A server/client-safe URL helper — required for `apiBaseURL` in every plugin config and override.

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

export const getStackClient = (
  queryClient: QueryClient,
  options?: { headers?: Headers }
) => {
  const baseURL = getBaseURL()
  return createStackClient({
    plugins: {
      blog: blogClientPlugin({
        apiBaseURL: baseURL,
        apiBasePath: "/api/data",
        siteBaseURL: baseURL,
        siteBasePath: "/pages",
        queryClient,
        headers: options?.headers,   // pass for SSR auth
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

## SSR headers forwarding (Next.js)

Pass request cookies/auth headers into the stack client during SSR so plugins can perform authenticated prefetches:

```ts
// app/pages/[[...all]]/page.tsx
import { headers } from "next/headers"

export default async function Page({ params }) {
  const headersList = await headers()
  const headersObj = new Headers()
  headersList.forEach((value, key) => headersObj.set(key, value))

  const queryClient = getOrCreateQueryClient()
  const stackClient = getStackClient(queryClient, { headers: headersObj })
  const route = stackClient.router.getRoute(normalizePath((await params).all))

  if (route?.loader) await route.loader()
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {route?.PageComponent ? <route.PageComponent /> : notFound()}
    </HydrationBoundary>
  )
}
```

---

## StackProvider — pages layout

The pages layout must be `"use client"` and wrap `QueryClientProvider` then `StackProvider`.

```tsx
// Next.js: app/pages/layout.tsx (or app/pages/[[...all]]/layout.tsx)
"use client"
import { useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { StackProvider } from "@btst/stack/context"
import { getOrCreateQueryClient } from "@/lib/query-client"
import type { BlogPluginOverrides } from "@btst/stack/plugins/blog/client"
import Link from "next/link"
import { useRouter } from "next/navigation"

type PluginOverrides = {
  blog: BlogPluginOverrides
  // add one entry per plugin
}

export default function PagesLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [queryClient] = useState(() => getOrCreateQueryClient())
  const baseURL = getBaseURL()

  return (
    <QueryClientProvider client={queryClient}>
      <StackProvider<PluginOverrides>
        basePath="/pages"
        overrides={{
          blog: {
            apiBaseURL: baseURL,
            apiBasePath: "/api/data",
            navigate: (path) => router.push(path),
            refresh: () => router.refresh(),
            Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
            Image: MyImageWrapper,           // optional: Next.js Image wrapper
            uploadImage: myUploadFn,         // optional: returns uploaded URL
            // lifecycle hooks (all optional):
            onRouteRender: async (routeName, ctx) => { /* analytics, logging */ },
            onRouteError: async (routeName, err, ctx) => { /* error tracking */ },
            onBeforePostsPageRendered: (ctx) => true,   // return false to block
            onBeforePostPageRendered: (slug, ctx) => true,
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
| `overrides` | Yes | Per-plugin override objects, keyed by plugin name |

### Common override fields (all data plugins)

| Field | Description |
|---|---|
| `apiBaseURL` | Absolute base URL for API fetches |
| `apiBasePath` | API prefix, e.g. `/api/data` |
| `navigate(path)` | Framework navigation function |
| `Link` | Framework `<Link>` component wrapper |
| `Image` | Optional framework `<Image>` wrapper (important for Next.js) |
| `refresh()` | Optional router refresh (Next.js: `router.refresh()`) |
| `uploadImage(file)` | Optional — returns URL string after upload |
| `headers` | Optional headers for per-request auth |

### Lifecycle hooks (available on most plugins)

| Hook | When |
|---|---|
| `onRouteRender(routeName, ctx)` | After a plugin page renders (SSR or CSR) |
| `onRouteError(routeName, err, ctx)` | On plugin route render error |
| `onBefore{Page}PageRendered(ctx)` | Before a specific page renders; return `false` to block |

`ctx` contains `{ isSSR: boolean, path: string }`.

### Plugin-specific override extras

**blog**
- `postBottomSlot: (post) => ReactNode` — injected below each blog post (e.g. `<CommentThread />`)
- `imagePicker`, `imageInputField` — custom image picker components

**ai-chat**
- `mode: "authenticated" | "public"` — conversation persistence mode
- `uploadFile(file): Promise<string>` — for chat file attachments
- `chatSuggestions: string[]` — pre-filled prompt suggestions

**ui-builder**
- `componentRegistry` — pass `defaultComponentRegistry` or a custom one

**kanban**
- `resolveUser(id): Promise<{ name, avatar? }>` — assignee display
- `searchUsers(query): Promise<User[]>` — assignee search
- `taskDetailBottomSlot: (task) => ReactNode` — inject below task detail (e.g. comments)

**comments** (standalone, not via StackProvider — use `<CommentThread />` directly)
- `currentUserId`, `resourceId`, `resourceType`, `apiBaseURL`, `apiBasePath`, `loginHref`

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
  onBeforeCreatePost: async (data) => { /* throw to deny */ },
  onBeforeUpdatePost: async (postId) => { /* throw to deny */ },
  onBeforeDeletePost: async (postId) => { /* throw to deny */ },
  onBeforeListPosts: async (filter) => { /* throw to deny drafts to unauthed users */ },
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
  resolveCurrentUserId: async (ctx) => ctx?.headers?.get("x-user-id") ?? null,
  onBeforePost: async (input, ctx) => ({ authorId: "from-session" }),
  onBeforeEdit: async (commentId, update, ctx) => { /* auth check */ },
  onBeforeStatusChange: async (commentId, status, ctx) => { /* admin check */ },
})
```

**ai-chat**
```ts
aiChatBackendPlugin({
  model: openai("gpt-4o"),
  systemPrompt: "…",
  mode: "authenticated",
  tools: { myTool },
  enablePageTools: true,
  getUserId: async (ctx) => ctx.headers?.get("x-user-id") ?? null,
  hooks: {
    onConversationCreated: async (convo) => { /* … */ },
    onAfterChat: async (conversationId, messages) => { /* … */ },
    onBeforeToolsActivated: async (toolNames, routeName, ctx) => toolNames,
  },
})
```
