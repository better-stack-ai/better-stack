---
description: "Rules for AI agents working with the BTST monorepo - plugin development, build configuration, and testing"
alwaysApply: true
---

# BTST Monorepo - Agent Rules

This document contains essential rules and patterns for AI agents working with this monorepo.

## Environment Setup

### Node.js Version
Always use Node.js v22 before running any commands:
```bash
source ~/.nvm/nvm.sh && nvm use 22
```

### Build Commands
```bash
pnpm build          # Build all packages
pnpm typecheck      # Type check all packages
pnpm lint           # Lint all packages
```

## Plugin Development

### Plugin Architecture Pattern

Plugins consist of two parts that must be kept in sync:

1. **API Plugin** (`src/plugins/{name}/api/plugin.ts`)
   - Uses `defineBackendPlugin` from `@btst/stack/plugins`
   - Defines database schema, API endpoints, and server-side hooks
   - Exports types for the API router

2. **Client Plugin** (`src/plugins/{name}/client/plugin.tsx`)
   - Uses `defineClientPlugin` from `@btst/stack/plugins`
   - Defines routes, loaders, meta generators, and client-side hooks
   - Must configure `queryClient`, `siteBaseURL`, `siteBasePath` in config

### Lifecycle Hooks Pattern

Both API and client plugins should follow consistent hook naming:

```typescript
// API Plugin Hooks
onBeforeChat, onAfterChat, onChatError
onBeforeConversationCreated, onAfterConversationCreated, onConversationCreateError
onBeforeConversationRead, onAfterConversationRead, onConversationReadError
onBeforeConversationUpdated, onAfterConversationUpdated, onConversationUpdateError
onBeforeConversationDeleted, onAfterConversationDeleted, onConversationDeleteError
onBeforeConversationsListed, onAfterConversationsListed, onConversationsListError

// Client Plugin Hooks
beforeLoad*, afterLoad*, onLoadError
onRouteRender, onRouteError
onBefore*PageRendered
```

### Server-side API Factory (`api`)

Every backend plugin can expose a typed `api` surface for direct server-side or SSG data access (no HTTP roundtrip). Add an `api` factory alongside `routes`:

```typescript
// src/plugins/{name}/api/getters.ts  — pure DB functions, no hooks/HTTP context
export async function listItems(adapter: Adapter): Promise<Item[]> { ... }
export async function getItemById(adapter: Adapter, id: string): Promise<Item | null> { ... }

// src/plugins/{name}/api/plugin.ts
export const myBackendPlugin = defineBackendPlugin({
  name: "{name}",
  dbPlugin: dbSchema,
  api: (adapter) => ({          // ← bound to shared adapter
    listItems: () => listItems(adapter),
    getItemById: (id: string) => getItemById(adapter, id),
  }),
  routes: (adapter) => { /* HTTP endpoints */ },
})

// src/plugins/{name}/api/index.ts  — re-export getters for direct import
export { listItems, getItemById } from "./getters";
```

After calling `stack()`, the result exposes `api` (namespaced per plugin) and `adapter`:

```typescript
export const myStack = stack({ basePath, plugins, adapter })
export const { handler, dbSchema } = myStack

// Use in Server Components, generateStaticParams, scripts, etc.
const items = await myStack.api["{name}"].listItems()
const item  = await myStack.api["{name}"].getItemById("abc")
```

**Rules:**
- Keep getters in a separate `getters.ts` — no HTTP context, no lifecycle hooks
- The `api` factory and `routes` factory share the same adapter instance
- If the plugin has a one-time init/sync step (like CMS `syncContentTypes`), call it inside each getter wrapper — not just inside `routes`
- Re-export getters from `api/index.ts` for consumers who need direct import (SSG/build-time)
- Authorization hooks are **not** called via `stack().api.*` — callers are responsible for access control

### SSG Support (`prefetchForRoute`)

`route.loader()` makes HTTP requests that **silently fail at `next build`** (no server running). Plugins that support SSG expose `prefetchForRoute` on the `api` factory to seed the React Query cache directly from the DB instead.

**Required files per plugin:**

| File | Purpose |
|---|---|
| `api/query-key-defs.ts` | Shared key shapes — import into both `query-keys.ts` and `prefetchForRoute` to prevent drift |
| `api/serializers.ts` | Convert `Date` fields to ISO strings before `setQueryData` |
| `api/getters.ts` | Add any ID-based getters `prefetchForRoute` needs (e.g. `getItemById`) |
| `api/plugin.ts` | `RouteKey` type + typed overloads + wire `prefetchForRoute` into `api` factory |
| `api/index.ts` | Re-export `RouteKey`, serializers, `PLUGIN_QUERY_KEYS` |
| `query-keys.ts` | Import discriminator fn from `api/query-key-defs.ts` |
| `client/plugin.tsx` | Import and call `isConnectionError` in each loader `catch` block |

**`api/query-key-defs.ts`:**
```typescript
export function itemsListDiscriminator(params?: { limit?: number }) {
  return { limit: params?.limit ?? 20 }
}
export const PLUGIN_QUERY_KEYS = {
  itemsList: (params?: { limit?: number }) =>
    ["items", "list", itemsListDiscriminator(params)] as const,
  itemDetail: (id: string) => ["items", "detail", id] as const,
}
```

**`prefetchForRoute` in `api/plugin.ts`:**
```typescript
export type PluginRouteKey = "list" | "detail" | "new"

// Typed overloads enforce correct params per route key
interface PluginPrefetchForRoute {
  (key: "list" | "new", qc: QueryClient): Promise<void>
  (key: "detail", qc: QueryClient, params: { id: string }): Promise<void>
}

function createPluginPrefetchForRoute(adapter: Adapter): PluginPrefetchForRoute {
  return async function prefetchForRoute(key, qc, params?) {
    switch (key) {
      case "list": {
        const { items, total, limit, offset } = await listItems(adapter)
        // useInfiniteQuery lists require { pages, pageParams } shape
        qc.setQueryData(PLUGIN_QUERY_KEYS.itemsList(), {
          pages: [{ items: items.map(serializeItem), total, limit, offset }],
          pageParams: [0],
        })
        break
      }
      case "detail": {
        const item = await getItemById(adapter, params!.id)
        if (item) qc.setQueryData(PLUGIN_QUERY_KEYS.itemDetail(params!.id), serializeItem(item))
        break
      }
      case "new": break
    }
  } as PluginPrefetchForRoute
}

api: (adapter) => ({
  listItems: () => listItems(adapter),
  prefetchForRoute: createPluginPrefetchForRoute(adapter),
})
```

Rules: serialize `Date` → ISO string; for plugins with a one-time init step (e.g. CMS `ensureSynced`), call it once at the top of `prefetchForRoute` — it is idempotent and safe for concurrent SSG calls.

**Build-time warning in `client/plugin.tsx` loader `catch` blocks:**
```typescript
import { isConnectionError } from "@btst/stack/plugins/client"

// in each loader catch block:
if (isConnectionError(error)) {
  console.warn("[btst/{plugin}] route.loader() failed — no server at build time. Use myStack.api.{plugin}.prefetchForRoute() for SSG.")
}
```

**SSG `page.tsx` pattern (Next.js — outside `[[...all]]/`):**
```tsx
export async function generateStaticParams() { return [{}] }
// export const revalidate = 3600  // ISR

export async function generateMetadata(): Promise<Metadata> {
  const queryClient = getOrCreateQueryClient()
  const stackClient = getStackClient(queryClient)
  const route = stackClient.router.getRoute(normalizePath(["{plugin}"]))
  if (!route) return { title: "Fallback" }
  await myStack.api.{plugin}.prefetchForRoute("list", queryClient)
  return metaElementsToObject(route.meta?.() ?? []) satisfies Metadata
}

export default async function Page() {
  const queryClient = getOrCreateQueryClient()
  const stackClient = getStackClient(queryClient)
  const route = stackClient.router.getRoute(normalizePath(["{plugin}"]))
  if (!route) notFound()
  await myStack.api.{plugin}.prefetchForRoute("list", queryClient)
  return <HydrationBoundary state={dehydrate(queryClient)}><route.PageComponent /></HydrationBoundary>
}
```

The shared `StackProvider` layout must be at `app/pages/layout.tsx` (not `[[...all]]/layout.tsx`) so it applies to both SSG pages and the catch-all.

**Plugins with SSG support:**

| Plugin | Prefetched route keys | Skipped |
|---|---|---|
| Blog | `posts`, `drafts`, `post`, `tag`, `editPost` | `newPost` |
| CMS | `dashboard`, `contentList`, `editContent` | `newContent` |
| Form Builder | `formList`, `editForm`, `submissions` | `newForm` |
| Kanban | `boards`, `board` | `newBoard` |
| AI Chat | — (per-user, not static) | all |

### Query Keys Factory

Create a query keys file for React Query integration:

```typescript
// src/plugins/{name}/query-keys.ts
import { mergeQueryKeys, createQueryKeys } from "@lukemorales/query-key-factory";

export function create{Name}QueryKeys(client, headers?) {
  return mergeQueryKeys(
    createQueryKeys("resourceName", {
      list: () => ({ queryKey: ["list"], queryFn: async () => { /* ... */ } }),
      detail: (id: string) => ({ queryKey: [id], queryFn: async () => { /* ... */ } }),
    })
  );
}
```

### Client Overrides

Client plugins need overrides configured in consumer layouts. Required overrides:

```typescript
type PluginOverrides = {
  apiBaseURL: string;      // Base URL for API calls
  apiBasePath: string;     // API route prefix (e.g., "/api/data")
  navigate: (path: string) => void;
  refresh?: () => void;
  Link: ComponentType<LinkProps>;
  Image?: ComponentType<ImageProps>;
  uploadImage?: (file: File) => Promise<string>;
  headers?: HeadersInit;
  localization?: Partial<Localization>;
}
```

### Lazy Loading Page Components

Use React.lazy() to code-split page components and reduce initial bundle size:

```typescript
import { lazy } from "react";

// Lazy load page components for code splitting
// Use .then() to handle named exports
const HomePageComponent = lazy(() => 
  import("./components/pages/home-page").then(m => ({ default: m.HomePageComponent }))
);
const NewPostPageComponent = lazy(() => 
  import("./components/pages/new-post-page").then(m => ({ default: m.NewPostPageComponent }))
);
const EditPostPageComponent = lazy(() => 
  import("./components/pages/edit-post-page").then(m => ({ default: m.EditPostPageComponent }))
);
```

For default exports, the simpler form works:
```typescript
const PostPage = lazy(() => import("./components/pages/post-page"));
```

### Client Plugin Route Structure

Each route in `defineClientPlugin` should return three parts:

```typescript
routes: () => ({
  routeName: createRoute("/path/:param", ({ params }) => ({
    // 1. PageComponent - The React component to render
    PageComponent: () => <MyPageComponent param={params.param} />,
    
    // 2. loader - SSR data prefetching (runs only on server)
    loader: createMyLoader(params.param, config),
    
    // 3. meta - SEO meta tag generator
    meta: createMyMeta(params.param, config),
  })),
}),
```

### SSR Loader Pattern

Loaders should only run on the server and prefetch data into React Query:

```typescript
function createMyLoader(param: string, config: MyClientConfig) {
  return async () => {
    // Only run on server - skip on client
    if (typeof window === "undefined") {
      const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;
      
      const context: LoaderContext = {
        path: `/resource/${param}`,
        params: { param },
        isSSR: true,
        apiBaseURL,
        apiBasePath,
        headers,
      };

      try {
        // Before hook - allow consumers to cancel/modify loading
        if (hooks?.beforeLoad) {
          const canLoad = await hooks.beforeLoad(param, context);
          if (!canLoad) {
            throw new Error("Load prevented by beforeLoad hook");
          }
        }

        // Create API client and query keys
        const client = createApiClient<MyApiRouter>({
          baseURL: apiBaseURL,
          basePath: apiBasePath,
        });
        const queries = createMyQueryKeys(client, headers);
        
        // Prefetch data into queryClient
        await queryClient.prefetchQuery(queries.resource.detail(param));

        // After hook
        if (hooks?.afterLoad) {
          const data = queryClient.getQueryData(queries.resource.detail(param).queryKey);
          await hooks.afterLoad(data, param, context);
        }

        // Check for errors - call hook but don't throw
        const queryState = queryClient.getQueryState(queries.resource.detail(param).queryKey);
        if (queryState?.error && hooks?.onLoadError) {
          const error = queryState.error instanceof Error
            ? queryState.error
            : new Error(String(queryState.error));
          await hooks.onLoadError(error, context);
        }
      } catch (error) {
        // Log error but don't re-throw during SSR
        // Let Error Boundaries handle errors when components render
        if (hooks?.onLoadError) {
          await hooks.onLoadError(error as Error, context);
        }
      }
    }
  };
}
```

Key patterns:
- **Server-only execution**: `if (typeof window === "undefined")`
- **Don't throw errors during SSR**: Let React Query store errors and Error Boundaries catch them during render
- **Hook integration**: Call before/after/error hooks for consumer customization
- **Prefetch into queryClient**: Use `queryClient.prefetchQuery()` so data is available immediately on client

### Meta Generator Pattern

Meta generators read prefetched data from queryClient:

```typescript
function createMyMeta(param: string, config: MyClientConfig) {
  return () => {
    const { queryClient, apiBaseURL, apiBasePath, siteBaseURL, siteBasePath, seo } = config;
    
    // Get prefetched data from queryClient
    const queries = createMyQueryKeys(
      createApiClient<MyApiRouter>({ baseURL: apiBaseURL, basePath: apiBasePath })
    );
    const data = queryClient.getQueryData(queries.resource.detail(param).queryKey);

    // Fallback if data not loaded
    if (!data) {
      return [
        { title: "Unknown route" },
        { name: "robots", content: "noindex" },
      ];
    }

    const fullUrl = `${siteBaseURL}${siteBasePath}/resource/${param}`;
    
    return [
      { title: data.title },
      { name: "description", content: data.description },
      { property: "og:type", content: "website" },
      { property: "og:title", content: data.title },
      { property: "og:url", content: fullUrl },
      // ... more meta tags
    ];
  };
}
```

### ComposedRoute & Error Handling

Page components use `ComposedRoute` to wrap content with Suspense + ErrorBoundary:

```typescript
// my-page.tsx - wrapper with boundaries
const MyPage = lazy(() => import("./my-page.internal").then(m => ({ default: m.MyPage })));

export function MyPageComponent({ id }: { id: string }) {
  return (
    <ComposedRoute
      path={`/plugin/${id}`}
      PageComponent={MyPage}
      ErrorComponent={DefaultError}    // Catches thrown errors
      LoadingComponent={PageSkeleton}  // Shows during lazy load / suspense
      NotFoundComponent={NotFoundPage}
      props={{ id }}
      onError={(error) => console.error(error)}
    />
  );
}
```

**How it works:**
- `ComposedRoute` renders nested `<Suspense>` + `<ErrorBoundary>` around `PageComponent`
- Loading fallbacks are always provided to `<Suspense>` on both server and client — never guard them with `typeof window !== "undefined"`, as that creates a different JSX tree on each side and shifts React's `useId()` counter, causing hydration mismatches in descendants (Radix `Select`, `Dialog`, etc.). Since Suspense only emits fallback HTML when the boundary actually suspends during SSR, having a consistent fallback prop is safe.
- `resetKeys={[path]}` resets the error boundary on navigation

### Suspense Hooks & Error Throwing

Use `useSuspenseQuery` in `.internal.tsx` files. Manually throw errors so ErrorBoundary catches them:

```typescript
export function useSuspenseMyData(id: string) {
  const { data, refetch, error, isFetching } = useSuspenseQuery({
    ...queries.items.detail(id),
    staleTime: 60_000,
    retry: false,
  });

  // IMPORTANT: useSuspenseQuery only throws on initial fetch, not refetch failures
  if (error && !isFetching) {
    throw error;
  }

  return { data, refetch };
}
```

### Error Flow

| Scenario | What Happens |
|----------|--------------|
| **API returns error** | SSR loader stores error in cache → client hydrates → hook throws → ErrorBoundary catches |
| **Component crashes** | ErrorBoundary catches → renders DefaultError → `onError` callback fires |
| **Network fails on refetch** | Error stored in query state → hook throws → ErrorBoundary catches |

SSR loaders **don't throw** - they let React Query store errors so ErrorBoundary handles them during render.

## Build Configuration

### Adding New Entry Points

When creating new exports, update both files:

1. **`packages/stack/build.config.ts`** - Add entry to the entries array:
```typescript
entries: [
  // ... existing entries
  { input: "src/plugins/{name}/query-keys.ts" },
  { input: "src/plugins/{name}/client/hooks/index.tsx" },
  { input: "src/plugins/{name}/client/components/index.tsx" },
]
```

2. **`packages/stack/package.json`** - Add exports AND typesVersions:
```json
{
  "exports": {
    "./plugins/{name}/client/hooks": {
      "import": "./dist/plugins/{name}/client/hooks/index.mjs",
      "require": "./dist/plugins/{name}/client/hooks/index.cjs"
    }
  },
  "typesVersions": {
    "*": {
      "plugins/{name}/client/hooks": ["./dist/plugins/{name}/client/hooks/index.d.ts"]
    }
  }
}
```

### CSS Exports

Plugins with UI components must provide CSS entry points:

1. **`src/plugins/{name}/client.css`** - Client-side styles
2. **`src/plugins/{name}/style.css`** - Full styles with Tailwind source directives

Export in package.json:
```json
{
  "exports": {
    "./plugins/{name}/css": "./dist/plugins/{name}/client.css"
  }
}
```

The `postbuild.cjs` script copies CSS files automatically.

## Example Apps

### Updating All Examples

When adding a new plugin or changing plugin configuration, update ALL three example apps:

1. **Next.js** (`examples/nextjs/`)
   - `lib/stack.tsx` - Backend plugin registration
   - `lib/stack-client.tsx` - Client plugin registration
   - `app/pages/[[...all]]/layout.tsx` - Override configuration
   - `app/globals.css` - CSS import: `@import "@btst/stack/plugins/{name}/css";`

2. **React Router** (`examples/react-router/`)
   - `app/lib/stack.tsx` - Backend plugin registration
   - `app/lib/stack-client.tsx` - Client plugin registration
   - `app/routes/pages/_layout.tsx` - Override configuration
   - `app/app.css` - CSS import: `@import "@btst/stack/plugins/{name}/css";`

3. **TanStack** (`examples/tanstack/`)
   - `src/lib/stack.tsx` - Backend plugin registration
   - `src/lib/stack-client.tsx` - Client plugin registration
   - `src/routes/pages/route.tsx` - Override configuration
   - `src/styles/app.css` - CSS import: `@import "@btst/stack/plugins/{name}/css";`

### Override Type Registration

Add your plugin's overrides to the PluginOverrides type in layouts:

```typescript
import type { YourPluginOverrides } from "@btst/stack/plugins/{name}/client"

type PluginOverrides = {
  blog: BlogPluginOverrides,
  "ai-chat": AiChatPluginOverrides,
  "{name}": YourPluginOverrides,  // Add new plugins here
}
```

## Testing

### E2E Tests

Tests are in `e2e/tests/` using Playwright. Pattern: `smoke.{feature}.spec.ts`

Run tests with API keys from the nextjs example:
```bash
cd e2e
export $(cat ../examples/nextjs/.env | xargs)
pnpm e2e:smoke
```

Run specific test file:
```bash
pnpm e2e:smoke -- tests/smoke.chat.spec.ts
```

Run for specific project:
```bash
pnpm e2e:smoke -- --project="nextjs:memory"
```

### Test Configuration

The `playwright.config.ts` defines three projects:
- `nextjs:memory` - port 3003
- `tanstack:memory` - port 3004
- `react-router:memory` - port 3005

All three web servers start for every test run. Timeout is 300 seconds per server.

### API Key Requirements

Features requiring external APIs (like OpenAI) should:
1. Check for API key availability in tests
2. Skip tests gracefully when key is missing
3. Document required env vars in test files

```typescript
test.beforeEach(async () => {
  if (!process.env.OPENAI_API_KEY) {
    test.skip();
  }
});
```

## Shared UI Package

### Using @workspace/ui

Shared components live in `packages/ui/src/components/`. Import via:
```typescript
import { Button } from "@workspace/ui/button"
import { MarkdownContent } from "@workspace/ui/markdown-content"
```

### Adding Shadcn Components

Use the shadcn CLI to add components to the UI package:
```bash
cd packages/ui
pnpm dlx shadcn@latest add {component-name}
```

## Documentation

### FumaDocs Site

Documentation is in `docs/content/docs/`. Update when adding/changing plugins:

1. Create/update MDX file: `docs/content/docs/plugins/{name}.mdx`
2. Use `AutoTypeTable` for TypeScript interfaces
3. Include code examples with proper syntax highlighting
4. Document all configuration options, hooks, and overrides

### IMPORTANT: Update Docs for Consumer-Facing Changes

**When modifying any consumer-facing interfaces, you MUST update documentation:**

1. **Props/Types changes** - Update the corresponding plugin MDX file when:
   - Adding new props to exported components (e.g., `ChatLayout`, `BlogLayout`)
   - Adding new exported types or interfaces
   - Changing behavior of existing props
   - Adding new hooks or exported functions

2. **API changes** - Document new or modified:
   - API endpoints
   - Request/response shapes
   - Backend plugin configuration options
   - Client plugin configuration options

3. **Breaking changes** - Always document migration paths

**Example workflow:**
```bash
# 1. Make changes to component
# packages/stack/src/plugins/ai-chat/client/components/chat-layout.tsx

# 2. Update corresponding docs
# docs/content/docs/plugins/ai-chat.mdx

# 3. Verify docs build
cd docs && pnpm build
```

The `AutoTypeTable` component automatically pulls from TypeScript files, so ensure your types have JSDoc comments for good documentation.

## AI Chat Plugin Integration

Plugin pages can register AI context so the chat widget understands the current page and can act on it (fill forms, update editors, summarize content).

**In the `.internal.tsx` page component**, call `useRegisterPageAIContext`:

```tsx
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";

// Read-only (content pages — summarization, suggestions only)
useRegisterPageAIContext(item ? {
  routeName: "my-plugin-detail",
  pageDescription: `Viewing: "${item.title}"\n\n${item.content?.slice(0, 16000)}`,
  suggestions: ["Summarize this", "What are the key points?"],
} : null); // pass null while loading

// With client-side tools (form/editor pages)
const formRef = useRef<UseFormReturn<any> | null>(null);
useRegisterPageAIContext({
  routeName: "my-plugin-edit",
  pageDescription: "User is editing…",
  suggestions: ["Fill in the form for me"],
  clientTools: {
    fillMyForm: async ({ title }) => {
      if (!formRef.current) return { success: false, message: "Form not ready" };
      formRef.current.setValue("title", title, { shouldValidate: true });
      return { success: true };
    },
  },
});
```

**For first-party tools**, add the server-side schema to `BUILT_IN_PAGE_TOOL_SCHEMAS` in `src/plugins/ai-chat/api/page-tools.ts` (no `execute` — handled client-side). Built-ins (`fillBlogForm`, `updatePageLayers`) are already registered there.

**`PageAIContextProvider` must wrap the root layout** (above all `StackProvider` instances) in all three example apps — it is already wired up there.

**References:** blog `new/edit-post-page.internal.tsx` (`fillBlogForm`), blog `post-page.internal.tsx` (read-only), ui-builder `page-builder-page.internal.tsx` (`updatePageLayers`).

---

## Common Pitfalls

1. **Missing overrides** - Client components using `usePluginOverrides()` will crash if overrides aren't configured in the layout or default values are not provided to the hook.

2. **Build cache** - Run `pnpm build` after changes to see them in examples. The turbo cache may need clearing: `pnpm turbo clean`

3. **Type exports** - Always add both `exports` AND `typesVersions` entries for new paths

4. **CSS not loading** - Ensure CSS files are listed in postbuild.cjs patterns and exported in package.json

5. **React Query stale data** - Use `staleTime: Infinity` for data that shouldn't refetch automatically

6. **Link component href** - Next.js Link requires non-undefined href. Use `href={href || "#"}` pattern

7. **AI SDK versions** - Use AI SDK v5 patterns. Check https://ai-sdk.dev/docs for current API

8. **Forgetting to update docs** - When adding/changing consumer-facing props, types, or interfaces, ALWAYS update the corresponding documentation in `docs/content/docs/plugins/`. Use `AutoTypeTable` to auto-generate type documentation from source files.

9. **Suspense errors not caught** - If errors from `useSuspenseQuery` aren't caught by ErrorBoundary, add the manual throw pattern: `if (error && !isFetching) { throw error; }`

10. **Missing ComposedRoute wrapper** - Page components must be wrapped with `ComposedRoute` to get proper Suspense + ErrorBoundary handling. Without it, errors crash the entire app.

11. **`stack().api` bypasses authorization hooks** - Getters accessed via `myStack.api.*` skip all `onBefore*` hooks. Never use them as a substitute for authenticated HTTP endpoints — enforce access control at the call site.

12. **Plugin init steps not called via `api`** - If a plugin's `routes` factory runs a one-time setup (e.g. CMS `syncContentTypes`), that same setup must also be awaited inside the `api` getter wrappers, otherwise direct getter calls will query an uninitialised database.

13. **`route.loader()` silently fails at build time** - No HTTP server exists during `next build`, so fetches fail silently and the static page renders empty. Use `myStack.api.{plugin}.prefetchForRoute()` in SSG pages instead.

14. **Query key drift between HTTP and SSG paths** - Share key builders via `api/query-key-defs.ts`; import discriminator functions into `query-keys.ts`. Never hardcode key shapes in two places.

15. **Wrong data shape for infinite queries** - Lists backed by `useInfiniteQuery` need `{ pages: [...], pageParams: [...] }` in `setQueryData`. Flat arrays will break hydration.

16. **Dates not serialized before `setQueryData`** - DB getters return `Date` objects; the HTTP cache holds ISO strings. Always serialize (e.g. `serializePost`) before `setQueryData`.
