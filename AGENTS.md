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
- Loading fallbacks only render on client (`typeof window !== "undefined"`) to avoid hydration mismatch
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
