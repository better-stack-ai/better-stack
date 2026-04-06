---
name: btst-build-config
description: Patterns for configuring the BTST monorepo build when adding new plugin entry points, package exports, CSS exports, and updating all three example apps. Use when adding a new export path, updating build.config.ts entries, adding exports/typesVersions to package.json, exposing CSS, updating the Next.js/React Router/TanStack example apps, or adding shared UI components via @workspace/ui.
---

# BTST Build Configuration

## Adding a new export path

Two files must always be updated together:

### 1. packages/stack/build.config.ts — add to entries array

```typescript
entries: [
  // existing entries...
  "./src/plugins/{name}/api/index.ts",
  "./src/plugins/{name}/client/index.ts",
  "./src/plugins/{name}/client/hooks/index.tsx",
  "./src/plugins/{name}/client/components/index.tsx",
  "./src/plugins/{name}/query-keys.ts",
]
```

### 2. packages/stack/package.json — add exports AND typesVersions

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

**Both entries are required** — missing `typesVersions` breaks TypeScript consumers even when runtime works.

## CSS exports

Plugins with UI components need two CSS files:

1. `src/plugins/{name}/client.css` — client-side styles
2. `src/plugins/{name}/style.css` — full styles with Tailwind source directives

The `postbuild.cjs` script auto-discovers and copies them — no manual registration needed. Only add the `package.json` export entry:

```json
{
  "exports": {
    "./plugins/{name}/css": "./dist/plugins/{name}/client.css"
  }
}
```

## Updating all three codegen projects

When adding a new plugin or changing plugin config, update ALL three:

**Next.js** (`codegen-projects/nextjs/`)
- `lib/stack.ts` — backend plugin registration
- `lib/stack-client.tsx` — client plugin registration
- `app/pages/layout.tsx` — override configuration
- `app/globals.css` — `@import "@btst/stack/plugins/{name}/css";`

**React Router** (`codegen-projects/react-router/`)
- `app/lib/stack.ts`
- `app/lib/stack-client.tsx`
- `app/routes/pages/_layout.tsx`
- `app/app.css`

**TanStack** (`codegen-projects/tanstack/`)
- `src/lib/stack.ts`
- `src/lib/stack-client.tsx`
- `src/routes/pages/route.tsx`
- `src/styles.css`

### Override type registration (in each layout)

```typescript
import type { YourPluginOverrides } from "@btst/stack/plugins/{name}/client"

type PluginOverrides = {
  blog: BlogPluginOverrides,
  "ai-chat": AiChatPluginOverrides,
  "{name}": YourPluginOverrides,  // add here
}
```

## Adding shared UI components (@workspace/ui)

Components live in `packages/ui/src/components/`. Add via shadcn CLI:

```bash
cd packages/ui
pnpm dlx shadcn@latest add {component-name}
```

Import in plugins:
```typescript
import { Button } from "@workspace/ui/button"
import { MarkdownContent } from "@workspace/ui/markdown-content"
```

## After changes

```bash
pnpm build   # rebuild all packages
# If turbo cache is stale:
pnpm turbo clean && pnpm build
```

## Gotchas

- **Missing `typesVersions`** — always add alongside `exports`; TypeScript won't resolve the new path otherwise.
- **Build cache** — run `pnpm turbo clean` if changes aren't reflected in codegen projects after `pnpm build`.
- **CSS not loading** — ensure `"./plugins/{name}/css"` entry exists in `package.json` exports; `postbuild.cjs` handles the rest automatically.
- **`@workspace/ui` sub-path components** — if a new component imports from a directory (not a single file), add it to `EXTERNAL_REGISTRY_COMPONENTS` in `build-registry.ts`.
