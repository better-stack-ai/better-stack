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
| **Media** | Media library with uploads, folders, picker UI, URL registration, and reusable image inputs |
| **OpenAPI** | Auto-generated API documentation with interactive Scalar UI |
| **Route Docs** | Auto-generated client route documentation with interactive navigation |
| **Better Auth UI** | Beautiful shadcn/ui authentication components for better-auth |
| **Comments** | Commenting system with moderation, likes, and nested replies |

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

## Shadcn Registry

Each plugin's UI layer is available as a [shadcn registry](https://ui.shadcn.com/docs/registry) block. Use it to **eject and fully customize** the page components while keeping all data-fetching and API logic from `@btst/stack`:

```bash
# Install a single plugin's UI (for example, Media)
npx shadcn@latest add https://github.com/better-stack-ai/better-stack/blob/main/packages/stack/registry/btst-media.json

# Or install the full collection
npx shadcn@latest add https://github.com/better-stack-ai/better-stack/blob/main/packages/stack/registry/registry.json
```

Components are copied into `src/components/btst/{plugin}/client/` — all relative imports remain valid and you can edit them freely.

---

## AI Agent Skills

If you're using an AI coding agent (Cursor, Windsurf, etc.) you can install the BTST integration skill so your agent understands the plugin system, adapter setup, and wiring patterns out of the box:

```bash
npx skills@latest add better-stack-ai/better-stack/.agents/skills/btst-integration
```

Or manually copy [`skills/btst-integration/SKILL.md`](./.agents/skills/btst-integration/SKILL.md) into your project's agent skills directory.

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

## Contributing

Bug reports, plugin PRs, and documentation improvements are welcome.
See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the plugin development guide, testing instructions, and submission checklist.

---

If this saves you time, a ⭐ helps others find it.

MIT © [olliethedev](https://github.com/olliethedev)
