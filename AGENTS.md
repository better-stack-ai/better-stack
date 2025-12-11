---
description: "Rules for AI agents working with the better-stack monorepo - plugin development, build configuration, and testing"
alwaysApply: true
---

# Better Stack Monorepo - Agent Rules

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

## Build Configuration

### Adding New Entry Points

When creating new exports, update both files:

1. **`packages/better-stack/build.config.ts`** - Add entry to the entries array:
```typescript
entries: [
  // ... existing entries
  { input: "src/plugins/{name}/query-keys.ts" },
  { input: "src/plugins/{name}/client/hooks/index.tsx" },
  { input: "src/plugins/{name}/client/components/index.tsx" },
]
```

2. **`packages/better-stack/package.json`** - Add exports AND typesVersions:
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
   - `lib/better-stack.tsx` - Backend plugin registration
   - `lib/better-stack-client.tsx` - Plugin registration
   - `app/pages/[[...all]]/layout.tsx` - Override configuration

2. **React Router** (`examples/react-router/`)
   - `src/lib/better-stack.tsx` - Backend plugin registration
   - `src/lib/better-stack-client.tsx` - Client plugin registration
   - `app/routes/pages/_layout.tsx` - Override configuration

3. **TanStack** (`examples/tanstack/`)
   - `src/lib/better-stack.tsx` - Backend plugin registration
   - `src/lib/better-stack-client.tsx` - Client plugin registration
   - `src/routes/pages/route.tsx` - Override configuration

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

## Common Pitfalls

1. **Missing overrides** - Client components using `usePluginOverrides()` will crash if overrides aren't configured in the layout or default values are not provided to the hook.

2. **Build cache** - Run `pnpm build` after changes to see them in examples. The turbo cache may need clearing: `pnpm turbo clean`

3. **Type exports** - Always add both `exports` AND `typesVersions` entries for new paths

4. **CSS not loading** - Ensure CSS files are listed in postbuild.cjs patterns and exported in package.json

5. **React Query stale data** - Use `staleTime: Infinity` for data that shouldn't refetch automatically

6. **Link component href** - Next.js Link requires non-undefined href. Use `href={href || "#"}` pattern

7. **AI SDK versions** - Use AI SDK v5 patterns. Check https://ai-sdk.dev/docs for current API
