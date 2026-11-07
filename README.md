# BTST

<div align="center">

## Add complete features to the React app you already own.

BTST is an open-source TypeScript system for installing full-stack features into existing React applications.

It is built for React/TypeScript developers and small product teams adding a substantial feature to an app they already have. A full-stack plugin can bring the routes, APIs, database schema, hooks, SSR-aware pages, and customizable UI that its feature needs.

**You own the whole application.** Your app, data, deployment, and ejected UI stay yours. BTST runs inside your stack as an open-source dependency you can inspect, fork, or replace, never as a required hosted control plane.

[**Quickstart with Blog**](#quickstart-blog-in-an-existing-nextjs-app) · [View the live Blog](https://www.better-stack.ai/p/blog) · [Read the docs](https://www.better-stack.ai/docs)

[![npm](https://img.shields.io/npm/v/@btst/stack.svg)](https://www.npmjs.com/package/@btst/stack)
[![MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](./LICENSE.md)

![BTST promise above a focused view of the real Blog route from the generated application.](docs/assets/product-proof/readme-hero.webp)

<sub>Real output from the repository's generated Next.js application.</sub>

</div>

## Where BTST fits

BTST is **more complete than a UI kit, more incremental than a starter application, and more ownable than a hosted feature service**.

| Starting point | What it gives you | Adoption boundary |
| --- | --- | --- |
| UI kit | Components and interaction primitives | Your team still builds the feature's routes, data model, APIs, and workflows |
| Starter application | An application foundation with initial features | You adopt its application structure as the place you start |
| Hosted feature service | A feature operated behind a vendor service boundary | Its control plane, runtime, or data path remains outside your application |
| **BTST** | An installable feature runtime, generated integration, and customizable views | Add one capability inside the app, database, and deployment you already operate |

Start with one plugin and add more only when they are useful. BTST does not replace your application foundation or require a hosted control plane.

![Diagram separating the application and operating boundaries a team owns from the BTST runtimes and plugins running inside it.](docs/assets/product-proof/ownership-diagram.svg)

<p align="center"><sub>BTST composes client and backend plugins inside the application; the app shell, ejected views, database, deployment, and external services remain yours.</sub></p>

## Quickstart: Blog in an existing Next.js app

This local evaluation uses the public stable releases with Node.js 22, an existing Next.js 15+ App Router application, and Radix-based shadcn/ui with CSS variables. If shadcn/ui is not configured yet, initialize that verified base and add the components Blog needs:

```bash
pnpm dlx shadcn@4.23.0 init --base radix --preset nova --css-variables
pnpm dlx shadcn@4.23.0 add button dropdown-menu sonner --yes
```

Render the generated `<Toaster />` in your root layout and start from a clean commit you can review. The [complete prerequisite checklist](https://www.better-stack.ai/docs/installation#quickstart-prerequisites) covers the remaining application requirements.

Run the released generator from the application root:

```bash
pnpm dlx @btst/codegen@6.2.0 init \
  --framework nextjs \
  --adapter memory \
  --plugins blog
```

The generator shows detected-file and conflict prompts before it writes. It installs `@btst/stack@6.2.0`, `@btst/plugin-blog@1.1.0`, `next-themes@0.4.6`, registers Blog on the backend and client, mounts the API and page routes, adds the plugin CSS, and wires the shared provider.

Set the trusted local origins in `.env.local`:

```dotenv
BTST_SITE_URL=http://localhost:3000
BTST_API_URL=http://localhost:3000
```

Then start the app and open the generated route:

```bash
pnpm dev
# http://localhost:3000/pages/blog
```

`/pages/blog` is the success condition. A fresh local route can be empty until you create content. The memory adapter resets with the process and is for evaluation and tests, not production persistence; Blog image uploads also remain an explicit application override. Continue with the [production and manual setup reference](https://www.better-stack.ai/docs/installation) before deploying.

![Real BTST Blog page with three published product-update posts in the generated Next.js application.](docs/assets/product-proof/blog-proof.webp)

<p align="center"><sub>The same generated Blog route after deterministic sample content is added.</sub></p>

### The registration that produces the route

Core v6 separates the plugin packages from the shared runtime: the backend plugin supplies Blog's server behavior and data model; the client plugin supplies its routes and UI. The generator provides the surrounding adapter, API/site runtime, QueryClient, catch-all routes, and provider wiring.

```ts
import { createBackendStack } from "@btst/stack"
import { createMemoryAdapter } from "@btst/adapter-memory"
import { blogBackendPlugin } from "@btst/plugin-blog/api"
import { serverAuth } from "./authorization.server"

createBackendStack({
  basePath: "/api/data",
  auth: serverAuth,
  adapter: (db) => createMemoryAdapter(db)({}),
  plugins: { blog: blogBackendPlugin() },
})
```

`serverAuth` is an application-owned identity and permission mapping, defined here in `authorization.server.ts`. Configure it for your authentication provider before exposing protected operations; follow the [authorization guide](https://www.better-stack.ai/docs/auth).

```tsx
import { createClientStack } from "@btst/stack/client"
import { blogClientPlugin } from "@btst/plugin-blog/client"
import type { QueryClient } from "@tanstack/react-query"

function createAppClientStack(queryClient: QueryClient, origin: string) {
  return createClientStack({
    api: { baseURL: origin, basePath: "/api/data" },
    site: { baseURL: origin, basePath: "/pages" },
    queryClient,
    plugins: { blog: blogClientPlugin() },
  })
}
```

![The current Blog backend and client registrations point to the real published Blog route they produce.](docs/assets/product-proof/code-to-result.webp)

Blog adds publishing routes, API operations, its data model, hooks, SSR-aware pages, editor UI, published-page metadata, and sitemap entries. Other plugins have different boundaries: one-sided and companion plugins are labeled instead of being forced into a full-stack claim.

## Released capabilities

Every capability below is installable from the released CLI. Follow its documentation for the actual payload, services, storage, auth, and adapter prerequisites.

| Capability | Topology | Outcome | Screen |
| --- | --- | --- | --- |
| [Blog](https://www.better-stack.ai/docs/plugins/blog) | Full-stack | Publishing, revision history, editorial review, scheduling, and public routes | [View](docs/assets/product-proof/blog-proof.webp) |
| [AI Chat](https://www.better-stack.ai/docs/plugins/ai-chat) | Full-stack | Streaming conversations, model integration, history, routes, and chat UI | [View](docs/assets/product-proof/ai-chat-proof.webp) |
| [CMS](https://www.better-stack.ai/docs/plugins/cms) | Full-stack | Typed content models, generated forms, publication policies, and revision history | [View](docs/assets/product-proof/cms-proof.webp) |
| [Form Builder](https://www.better-stack.ai/docs/plugins/form-builder) | Full-stack | Form authoring, conditional fields, uploads, validation, and submissions | [View](docs/assets/product-proof/form-builder-proof.webp) |
| [Kanban](https://www.better-stack.ai/docs/plugins/kanban) | Full-stack | Boards, columns, tasks, assignment, and drag-and-drop UI | [View](docs/assets/product-proof/kanban-proof.webp) |
| [CRM](https://www.better-stack.ai/docs/plugins/crm) | Full-stack | Contacts, duplicate review, transactional merges, and Kanban-backed deal ownership | [View](docs/assets/product-proof/crm-proof.webp) |
| [Newsletter](https://www.better-stack.ai/docs/plugins/newsletter) | Full-stack | Subscribers, campaigns, delivery recovery, and optional forms integration | [View](docs/assets/product-proof/newsletter-proof.webp) |
| [Calendar](https://www.better-stack.ai/docs/plugins/calendar) | Full-stack | Appointments, provider sync, team assignment, group capacity, and waitlists | [View](docs/assets/product-proof/calendar-proof.webp) |
| [School](https://www.better-stack.ai/docs/plugins/school) | Full-stack · requires CMS | Course authoring, enrollment, progress, and application-owned payments | [View](docs/assets/product-proof/school-proof.webp) |
| [Job Board](https://www.better-stack.ai/docs/plugins/job-board) | Full-stack · requires CMS and Form Builder | Job listings, applications, and hiring workflows | [View](docs/assets/product-proof/job-board-proof.webp) |
| [Ecommerce](https://www.better-stack.ai/docs/plugins/ecommerce) | Full-stack · requires CMS | Catalog, checkout, orders, protected digital delivery, and refund recovery | [View](docs/assets/product-proof/ecommerce-proof.webp) |
| [Affiliate](https://www.better-stack.ai/docs/plugins/affiliate) | Full-stack | Referral tracking, attribution, commissions, and payout workflows | [View](docs/assets/product-proof/affiliate-proof.webp) |
| [Analytics](https://www.better-stack.ai/docs/plugins/analytics) | Full-stack | Page and event tracking, dashboards, funnels, and experiment attribution | [View](docs/assets/product-proof/analytics-proof.webp) |
| [Feature Flags](https://www.better-stack.ai/docs/plugins/feature-flags) | Full-stack | Flag evaluation, variants, targeting, and experiment reporting | [View](docs/assets/product-proof/feature-flags-proof.webp) |
| [Feedback](https://www.better-stack.ai/docs/plugins/feedback) | Full-stack | Feature requests, voting, a public roadmap, and changelog | [View](docs/assets/product-proof/feedback-proof.webp) |
| [Helpdesk](https://www.better-stack.ai/docs/plugins/helpdesk) | Full-stack | Private support tickets, agent inbox, attachments, and response deadlines | [View](docs/assets/product-proof/helpdesk-proof.webp) |
| [Notifications](https://www.better-stack.ai/docs/plugins/notifications) | Full-stack | In-app inbox, preferences, delivery lifecycle, and optional plugin bridges | [View](docs/assets/product-proof/notifications-proof.webp) |
| [Search](https://www.better-stack.ai/docs/plugins/search) | Full-stack | Permission-aware search across registered application sources | [View](docs/assets/product-proof/search-proof.webp) |
| [Comments](https://www.better-stack.ai/docs/plugins/comments) | Full-stack | Threads, replies, reactions, moderation, and embeddable UI | [View](docs/assets/product-proof/comments-proof.webp) |
| [Media](https://www.better-stack.ai/docs/plugins/media) | Full-stack | Media storage, library routes, uploads, folders, and picker UI | [View](docs/assets/product-proof/media-proof.webp) |
| [UI Builder](https://www.better-stack.ai/docs/plugins/ui-builder) | Client-only · requires CMS | Visual page authoring and public rendering over CMS content | [View](docs/assets/product-proof/ui-builder-proof.webp) |
| [OpenAPI](https://www.better-stack.ai/docs/plugins/open-api) | Backend-only | Generated OpenAPI document and interactive API reference endpoint | [View](docs/assets/product-proof/openapi-proof.webp) |
| [Route Docs](https://www.better-stack.ai/docs/plugins/route-docs) | Client-only | Generated route reference and navigation UI | [View](docs/assets/product-proof/route-docs-proof.webp) |
| [Better Auth UI](https://www.better-stack.ai/docs/plugins/better-auth-ui) | Companion · requires Better Auth | Auth and account pages for an existing Better Auth backend | See companion docs |

[Explore the released catalog](https://www.better-stack.ai/docs/plugins) or compare complete generated setups in the [interactive playground](https://www.better-stack.ai/playground?plugins=blog,ai-chat,comments&framework=nextjs&view=preview).

### New plugin screens

These are real routes from the generated Next.js application, populated with synthetic local fixtures. The [capture record](docs/assets/product-proof/source/readme-gallery.json) identifies the source commits and the limits of each screen.

![Real BTST Feedback roadmap with planned, in-progress, and shipped feature requests.](docs/assets/product-proof/feedback-proof.webp)

Feedback stores requests and votes and presents them on a public roadmap.

![Real BTST Helpdesk agent inbox with synthetic tickets, priorities, assignments, and response deadlines.](docs/assets/product-proof/helpdesk-proof.webp)

Helpdesk presents private tickets in an agent inbox. Ticket search requires an application-supplied search implementation.

![Real BTST Notifications inbox populated by Kanban task and Helpdesk ticket assignment events.](docs/assets/product-proof/notifications-proof.webp)

Notifications receives real assignment events through the optional plugin bridges; this screen proves in-app delivery only.

![Real BTST Search page showing results from registered Blog and application sources.](docs/assets/product-proof/search-proof.webp)

Search combines registered sources while preserving their application-owned permission checks.

## Compatibility and prerequisites

The maintained and tested Core v6 integration paths are:

| Framework | Maintained integration |
| --- | --- |
| Next.js 15+ App Router | Route handlers, request-aware and static pages, metadata, and sitemap factories |
| React Router 7+ | Framework routes, SSR loaders, navigation, metadata, and sitemap response helpers |
| TanStack Start | File routes, SSR loaders, navigation, metadata, and sitemap response helpers |

React Router 8 requires Node.js 22.22+ and React/React DOM 19.2.7+. Other React integrations may be possible through custom adapters, but they are not part of that maintained matrix.

Versioned adapters are published for Prisma, Drizzle, Kysely, and MongoDB. Support is not blanket-equivalent: plugins that need isolated transactions have stricter persistent-adapter requirements, and the generated Form Builder and Media configurations reject MongoDB. The memory adapter is local and single-process only. Check [compatibility and prerequisites](https://www.better-stack.ai/docs/installation#compatibility-and-prerequisites) and the [adapter guide](https://www.better-stack.ai/docs/databases/adapters) for current versions and limits.

## Keep the view code, too

BTST's packaged runtime keeps data fetching and behavior upgradeable. When a plugin offers a shadcn v4 registry block, it copies the view layer into your application. Edit that code freely, then pass pages back through the plugin's component overrides where available or render copied components directly; hooks and API behavior can remain package dependencies.

[Read the ejection guide](https://www.better-stack.ai/docs/shadcn-registry)

## Go deeper

- [Installation and production setup](https://www.better-stack.ai/docs/installation): frameworks, providers, auth, origins, adapters, and migrations
- [How BTST works](https://www.better-stack.ai/docs/how-it-works): backend/client composition and ownership boundaries
- [CLI reference](https://www.better-stack.ai/docs/cli): initialize, generate schemas, migrate, and seed
- [Build a plugin](https://www.better-stack.ai/docs/plugins/development): create a backend-only, client-only, or full-stack capability
- [API reference](https://www.better-stack.ai/docs/api-reference): stack factories, runtime services, and framework adapters
- [6.2 upgrade guide](https://www.better-stack.ai/docs/release-6-2): current package versions, new workflows, and database migrations
- [Core v6 migration guide](https://www.better-stack.ai/docs/migration-v6): move older integrations to independent plugin packages

### Optional AI-agent guidance

After you understand the human installation path, you can give a coding agent the repository's BTST integration skill:

```bash
npx skills@latest add better-stack-ai/better-stack/.agents/skills/btst-integration
```

## Contributing and license

Bug reports, plugin contributions, and documentation improvements are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow, tests, and submission checklist; public-facing copy follows the [BTST message and claims contract](./docs/positioning.md).

BTST is released under the [MIT License](./LICENSE.md).

If BTST is useful to you, a star helps other React developers find it.
