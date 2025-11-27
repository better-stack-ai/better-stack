# @BTST - Better Stack

<div align="center">

**Composable full-stack plugin system for React frameworks**

[![npm version](https://img.shields.io/npm/v/@btst/stack.svg)](https://www.npmjs.com/package/@btst/stack)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[📖 Documentation](https://www.better-stack.ai/docs) • [🐛 Issues](https://github.com/better-stack-ai/better-stack/issues)

</div>

---

## What Problem Does This Solve?

Your app needs a blog. Or a scheduling system. Or user feedback collection. Or an AI assistant. These are **horizontal features**—capabilities that cut across your entire app, not specific to your core domain.

Building them from scratch means weeks of work: routes, API endpoints, database schemas, authentication, SSR, metadata, hooks, forms, error handling...

Better Stack lets you **add these features in minutes** as composable plugins that work across any React framework.

- **Composable architecture** - Mix and match features like LEGO blocks. Add blog + scheduling + feedback + newsletters, all working together seamlessly
- **Framework agnostic** - One feature works with Next.js App Router, React Router, TanStack Router, Remix—switch frameworks without rewriting
- **Plugin overrides** - Leverage framework-specific features via overrides. Use Next.js `Image` and `Link`, React Router's `Link`, or any framework's components
- **Full-stack in one package** - Each feature includes routes, API endpoints, database schemas, React components, hooks, loaders, and metadata
- **Zero boilerplate** - No wiring up routes, API handlers, or query clients. Just configure and it works
- **First-class SSR** - Server-side rendering, data prefetching, and SEO metadata generation built-in
- **Lifecycle hooks** - Intercept at any point: authorization, data transformation, analytics, caching, webhooks
- **Horizontal features** - Perfect for blog, scheduling, feedback, newsletters, AI assistants, comments—anything reusable across apps


## Installation

```bash
npm install @btst/stack
```

For database schema management, install the CLI:

```bash
npm install -D @btst/cli
```

The CLI helps generate migrations, Prisma schemas, and other database artifacts from your plugin schemas.

Learn more about Better Stack, full installation, usage instructions and available plugins in the [documentation](https://www.better-stack.ai/docs).

## The Bigger Picture

Better Stack transforms how you think about building apps:

- **Open source** - Share complete features, not just code snippets. Someone can add a newsletter plugin to their Next.js app in minutes
- **Fast development** - Add 5 features in an afternoon instead of 5 months. Validate ideas faster
- **Framework and Database Agnostic** - Use any framework and database you want. Better Stack works with any modern framework and database.


Each plugin is a complete, self-contained horizontal full-stack feature. No framework lock-in. Just add it and it works.

## Learn More

For complete documentation, examples, and plugin development guides, visit **[https://www.better-stack.ai](https://www.better-stack.ai)**

## Examples

- [Next.js App Router](./examples/nextjs) - Next.js App Router example
- [React Router](./examples/react-router) - React Router example
- [TanStack Router](./examples/tanstack) - TanStack Router example

## License

MIT © [olliethedev](https://github.com/olliethedev)
