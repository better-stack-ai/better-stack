# @btst/stack — Better Stack

<div align="center">

**Installable full-stack features for React apps**  
Framework-agnostic. Database-flexible. No lock-in.

[![npm](https://img.shields.io/npm/v/@btst/stack.svg)](https://www.npmjs.com/package/@btst/stack)
[![MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Docs](https://www.better-stack.ai/docs) · [Examples](./examples) · [Issues](https://github.com/better-stack-ai/better-stack/issues)

</div>

---

## What is Better Stack?

Better Stack lets you **install production-ready app features as npm packages**.

Instead of spending weeks building the same things again and again  
(routes, APIs, database schemas, SSR, SEO, forms…):

```bash
npm install @btst/stack
````

Enable the features you need and keep building your product.

### Examples of installable features

* Blog
* AI Chat
* CMS
* Newsletter
* Scheduling
* Kanban board
* Analytics dashboard
* Generic forms

Each feature ships **frontend + backend together**:
routes, APIs, database models, React components, SSR, and SEO — already wired.

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

lib/better-stack.ts:
```ts
import { betterStack } from "@btst/stack"
import { blogBackendPlugin } from "@btst/stack/plugins/blog/api"

export const { handler } = betterStack({
  plugins: {
    blog: blogBackendPlugin(blogConfig)
  }
})
```

lib/better-stack-client.tsx:
```tsx
import { createStackClient } from "@btst/stack/client"
import { blogClientPlugin } from "@btst/stack/plugins/blog/client"
import { QueryClient } from "@tanstack/react-query"

const client = createStackClient({
  plugins: {
    blog: blogClientPlugin(blogConfig)
  }
})
```
Now you have a working blog: API, DB schema, pages, SSR, and SEO.

## Database schemas & migrations

Optional CLI to generate schemas and run migrations from enabled plugins:

```bash
npm install -D @btst/cli
```

Generate drizzle schema:

```bash
npx @btst/cli generate --orm drizzle --config lib/better-stack.ts --output db/schema.ts
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
