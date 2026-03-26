---
name: btst-ai-context
description: Patterns for registering page-level AI context in BTST plugin pages so the AI chat widget understands the current page and can act on it. Use when adding useRegisterPageAIContext to a plugin page, implementing clientTools for AI-driven form filling or editor updates, registering server-side tool schemas in BUILT_IN_PAGE_TOOL_SCHEMAS, or wiring PageAIContextProvider in layouts.
---

# BTST AI Chat Page Context

Plugin pages can register AI context so the chat widget understands the current page and can act on it (fill forms, update editors, summarize content).

## useRegisterPageAIContext

Call inside `.internal.tsx` page components.

### Read-only (content pages)

```tsx
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context"

// Pass null while data is loading — context is not registered until non-null
useRegisterPageAIContext(item ? {
  routeName: "my-plugin-detail",
  pageDescription: `Viewing: "${item.title}"\n\n${item.content?.slice(0, 16000)}`,
  suggestions: ["Summarize this", "What are the key points?"],
} : null)
```

### With client-side tools (form/editor pages)

```tsx
import { useRef } from "react"
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context"
import type { UseFormReturn } from "react-hook-form"

const formRef = useRef<UseFormReturn<any> | null>(null)

useRegisterPageAIContext({
  routeName: "my-plugin-edit",
  pageDescription: "User is editing an item. Help them fill out the form.",
  suggestions: ["Fill in the form for me", "Suggest a title"],
  clientTools: {
    fillMyForm: async ({ title, description }) => {
      if (!formRef.current) return { success: false, message: "Form not ready" }
      formRef.current.setValue("title", title, { shouldValidate: true })
      formRef.current.setValue("description", description, { shouldValidate: true })
      return { success: true }
    },
  },
})
```

`clientTools` execute client-side only. Return `{ success: boolean, message?: string }`.

## Server-side tool schemas (first-party tools)

For first-party tools, add the server-side schema to `BUILT_IN_PAGE_TOOL_SCHEMAS` in `src/plugins/ai-chat/api/page-tools.ts`. No `execute` — that's handled client-side:

```typescript
// src/plugins/ai-chat/api/page-tools.ts
export const BUILT_IN_PAGE_TOOL_SCHEMAS = {
  fillBlogForm: { /* existing */ },
  updatePageLayers: { /* existing */ },
  fillMyForm: {
    description: "Fill the my-plugin edit form with the provided values",
    parameters: z.object({
      title: z.string().describe("Item title"),
      description: z.string().optional().describe("Item description"),
    }),
  },
}
```

## PageAIContextProvider placement

`PageAIContextProvider` must wrap the **root layout**, above all `StackProvider` instances:

```tsx
import { PageAIContextProvider } from "@btst/stack/plugins/ai-chat/client/context"

export default function RootLayout({ children }) {
  return <PageAIContextProvider>{children}</PageAIContextProvider>
}
```

In the monorepo example apps this is already wired — don't add it again there. In a consumer app, add it once to the root layout when integrating the ai-chat plugin.

## Reference examples in the codebase

| File | Pattern |
|---|---|
| `src/plugins/blog/client/components/pages/new-post-page.internal.tsx` | `fillBlogForm` (clientTools) |
| `src/plugins/blog/client/components/pages/post-page.internal.tsx` | Read-only context |
| `src/plugins/ui-builder/client/components/pages/page-builder-page.internal.tsx` | `updatePageLayers` (clientTools) |
