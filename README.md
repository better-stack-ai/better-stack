# @btst/stack — BTST

<div align="center">

**Installable full-stack features for React apps**  
Framework-agnostic. Database-flexible. No lock-in.

[![npm](https://img.shields.io/npm/v/@btst/stack.svg)](https://www.npmjs.com/package/@btst/stack)
[![MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Docs](https://www.better-stack.ai/docs) · [Examples](./examples) · [Issues](https://github.com/better-stack-ai/better-stack/issues)

</div>

---

## What is BTST?

BTST lets you **install production-ready app features as npm packages**.

Instead of spending weeks building the same things again and again  
(routes, APIs, database schemas, SSR, SEO, forms…):

```bash
npm install @btst/stack
````

Enable the features you need and keep building your product.

### Available plugins

| Plugin | Description |
|--------|-------------|
| **Blog** | Content management, editor, drafts, publishing, SEO, RSS feeds |
| **AI Chat** | AI-powered chat with conversation history, streaming, and customizable models |
| **CMS** | Headless CMS with custom content types, Zod schemas, and auto-generated forms |
| **Form Builder** | Dynamic form builder with drag-and-drop editor, submissions, and validation |
| **UI Builder** | Visual drag-and-drop page builder with component registry and public rendering |
| **Kanban** | Project management with boards, columns, tasks, drag-and-drop, and priority levels |
| **OpenAPI** | Auto-generated API documentation with interactive Scalar UI |
| **Route Docs** | Auto-generated client route documentation with interactive navigation |
| **Better Auth UI** | Beautiful shadcn/ui authentication components for better-auth |

Each plugin ships **frontend + backend together**:
routes, APIs, database models, React components, SSR, and SEO — already wired.

**Want a specific plugin?** [Open an issue](https://github.com/better-stack-ai/better-stack/issues/new) and let us know!

---

## Why use it?

* **Installable features** – real product features, not just UI
* **Framework-agnostic** – Next.js, React Router, TanStack Router, Remix
* **Database-flexible** – Prisma, Drizzle, Kysely, MongoDB
* **Zero boilerplate** – no manual route or API wiring
* **Type-safe** – end-to-end TypeScript

You keep your codebase, database, and deployment.

---

## Minimal usage

```ts title="lib/stack.ts"
import { stack } from "@btst/stack"
import { blogBackendPlugin } from "@btst/stack/plugins/blog/api"
import { createMemoryAdapter } from "@btst/adapter-memory"

export const { handler, dbSchema } = stack({
  basePath: "/api/data",
  plugins: {
    blog: blogBackendPlugin()
  },
  adapter: (db) => createMemoryAdapter(db)({})
})
```

```tsx title="lib/stack-client.tsx"
import { createStackClient } from "@btst/stack/client"
import { blogClientPlugin } from "@btst/stack/plugins/blog/client"
import { QueryClient } from "@tanstack/react-query"

export const getStackClient = (queryClient: QueryClient) =>
  createStackClient({
    plugins: {
      blog: blogClientPlugin({
        apiBaseURL: "http://localhost:3000",
        apiBasePath: "/api/data",
        siteBaseURL: "http://localhost:3000",
        siteBasePath: "/pages",
        queryClient,
      })
    }
  })
```

Now you have a working blog with API, pages, SSR, and SEO. See the [full installation guide](https://www.better-stack.ai/docs/installation) for database adapters, auth hooks, and framework-specific setup.

## Database schemas & migrations

Optional CLI to generate schemas and run migrations from enabled plugins:

```bash
npm install -D @btst/cli
```

Generate drizzle schema:

```bash
npx @btst/cli generate --orm drizzle --config lib/stack.ts --output db/schema.ts
```

Supports Prisma, Drizzle, MongoDB and Kysely SQL dialects.

---

## Examples

* [Next.js App Router](./examples/nextjs)
* [React Router](./examples/react-router)
* [TanStack Router](./examples/tanstack)

---

## Learn more

Full documentation, guides, and plugin development:
👉 **[https://www.better-stack.ai](https://www.better-stack.ai)**

---

If this saves you time, a ⭐ helps others find it.

MIT © [olliethedev](https://github.com/olliethedev)
