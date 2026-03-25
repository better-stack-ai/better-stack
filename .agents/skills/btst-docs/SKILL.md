---
name: btst-docs
description: Workflow for updating BTST documentation when making consumer-facing changes to plugins, components, or APIs. Use when adding new props to exported components, adding new exported types or hooks, changing API shapes, adding a new plugin, or making any change that consumers of @btst/stack need to know about.
---

# BTST Documentation

## When to update docs

Update `docs/content/docs/plugins/{name}.mdx` whenever you:

- Add new props to an exported component (e.g. `ChatLayout`, `BlogLayout`)
- Add new exported types or interfaces
- Change behavior of existing props
- Add new hooks or exported functions
- Add or change API endpoints or request/response shapes
- Change backend or client plugin configuration options
- Make a breaking change (always document migration path)

**Never skip this step** — the docs are the primary consumer reference.

## File location

```
docs/content/docs/
  plugins/
    blog.mdx
    ai-chat.mdx
    cms.mdx
    {name}.mdx      ← create or update this
```

## AutoTypeTable

Use `AutoTypeTable` to auto-generate prop tables directly from TypeScript types. It reads JSDoc comments — ensure all exported types have JSDoc:

```mdx
import { AutoTypeTable } from "fumadocs-typescript/ui"

## Props

<AutoTypeTable path="../../packages/stack/src/plugins/{name}/client/types.ts" name="MyComponentProps" />
```

JSDoc example:
```typescript
export interface MyComponentProps {
  /** The unique identifier for the item */
  id: string
  /** Called when the user submits the form */
  onSubmit?: (data: FormData) => void
}
```

## Verify the docs build

Always run after editing:

```bash
cd docs && pnpm build
```

Fix any TypeScript or MDX errors before merging.

## Gotcha

**Forgetting to update docs** is the most common oversight. Consumer-facing changes without doc updates leave users guessing. If `AutoTypeTable` is used, ensure JSDoc comments are in place on all exported types or the table will render empty.
