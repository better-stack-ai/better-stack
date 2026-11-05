---
name: btst-build-config
description: Patterns for configuring the BTST monorepo build when adding new plugin entry points, package exports, CSS exports, and updating all three example apps. Use when adding a new export path, updating build.config.ts entries, adding exports/typesVersions to package.json, exposing CSS, updating the Next.js/React Router/TanStack example apps, or adding shared UI components via @workspace/ui.
---

# BTST Build Configuration

## Package build and exports

Built-in plugins live in packages/plugin-{name}/src. Add each shipped entry to
that owner's build.config.ts and exports/typesVersions in its package.json.
Core keeps the shared runtime and generic plugin-authoring entries.

```typescript
import { packageBuild } from "../../scripts/package-build";

export default packageBuild([
  "src/api/index",
  "src/client/index",
  "src/client/hooks/index",
  "src/client/components/index",
  "src/query-keys",
]);
```

The shared builder emits ESM/CommonJS declarations, preserves client directives
and deferred imports, compiles private UI modules, and leaves Core and third-party
packages external. Use relative imports inside an owner so clean declaration
builds infer from source; cross-owner imports use public package entries.

```json
{
  "exports": {
    "./client/hooks": {
      "import": {
        "types": "./dist/client/hooks/index.d.ts",
        "default": "./dist/client/hooks/index.mjs"
      },
      "require": {
        "types": "./dist/client/hooks/index.d.cts",
        "default": "./dist/client/hooks/index.cjs"
      }
    },
    "./css": "./dist/style.css"
  },
  "typesVersions": {
    "*": {
      "client/hooks": ["./dist/client/hooks/index.d.ts"]
    }
  },
  "sideEffects": ["**/*.css"]
}
```

The builder copies an owner's src/style.css and src/client.css when present,
expands private UI CSS and retains third-party imports. Tailwind source globs
must point at emitted owner modules. Standalone public component APIs belong to
optional @btst/components; plugins compile private UI without depending on it.

## Updating all three codegen projects

When adding a plugin, changing plugin config, or changing a framework entry
point, update ALL three generated projects:

**Next.js** (`codegen-projects/nextjs/`)
- `lib/stack.ts` — backend plugin registration
- `lib/stack-client.tsx` — client plugin registration
- `app/pages/client-layout.tsx` — shared client provider and overrides
- `app/(request)/pages/layout.tsx` — trusted request-origin hydration
- `app/(static)/pages/layout.tsx` — header-free SSG/ISR provider wrapper
- `app/globals.css` — `@import "@btst/plugin-{name}/css";`

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

Keep generated framework routes on the v3 entry factories:

| Framework | API route | Page route | Provider router |
|---|---|---|---|
| Next.js | `toNextRouteHandlers` | `createNextPage` | `nextRouter()` |
| React Router | `toReactRouterHandlers` | `createReactRouterPage` | `reactRouter()` |
| TanStack Start | `toTanStackHandlers` | `createTanStackPageOptions` | `tanstackRouter()` |

Do not generate hand-written route resolution, loader/meta ordering,
dehydration, or 404 plumbing. The entry factories own that behavior.

Generated layouts pass the resolved client stack to `StackProvider`:

```tsx
<StackProvider
  stack={clientStack}
  router={frameworkRouter()}
  auth={authProvider}
  overrides={{
    blog: { uploadImage },
  }}
>
  {children}
</StackProvider>
```

Only plugin-specific values belong in `overrides`. Never generate `Link`,
`Image`, `navigate`, `refresh`, API paths, identity, or login values inside a
built-in plugin override. Configure `api`, `site`, and `queryClient` once in
`createClientStack()`. Resolved client definitions such as Blog and AI Chat
accept only plugin-specific options; their loaders and metadata receive shared
runtime through the stack resolver.

### Override type inference

Resolved definitions contribute their public override type automatically under
their canonical programmatic ID (`blog`, `aiChat`). Register the definition in
`createClientStack({ plugins })` and pass that resolved stack to
`StackProvider`; never recreate a manual application override map or provider
generic. Do not restore removed framework, API, guard, or identity fields in
local intersection types.

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
- **CSS not loading** — verify the owner’s CSS export, sideEffects entry and emitted module globs.
- **`@workspace/ui` sub-path components** — if a new component imports from a directory (not a single file), add it to `EXTERNAL_REGISTRY_COMPONENTS` in `build-registry.ts`.
- **Stale v2 templates** — generated routes must use framework entry factories.
  Generated layouts configure `api`, `site`, and `queryClient` once in
  `createClientStack()`, then pass the resolved stack to `StackProvider`.
  Only provider-owned services such as `router` and `auth` remain alongside the
  `stack` prop.
