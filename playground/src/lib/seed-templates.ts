import type { PluginKey, Framework } from "@btst/codegen/lib";

// ── Seed route file paths per framework ─────────────────────────────────────

export function seedRoutePath(
	pluginKey: PluginKey,
	framework: Framework,
): string {
	const name = pluginKey; // e.g. "blog", "kanban"
	if (framework === "nextjs") return `app/api/seed-${name}/route.ts`;
	if (framework === "react-router") return `app/routes/api.seed-${name}.ts`;
	return `src/routes/api/seed-${name}.ts`;
}

export function seedApiPath(pluginKey: PluginKey): string {
	return `/api/seed-${pluginKey}`;
}

// ── Per-plugin seed logic (framework-agnostic body) ──────────────────────────
// Each value is a function body string using `myStack` from the stack import.

const BLOG_SEED_BODY = `
  const adapter = myStack.adapter
  const existing = await adapter.findMany({ model: "post", limit: 1 })
  if (existing.length > 0) return { ok: true, skipped: true }
  const now = new Date()
  await adapter.create({
    model: "post",
    data: {
      title: "Getting Started with BTST Blog",
      slug: "getting-started",
      content: \`# Getting Started with BTST Blog

Welcome to the **BTST Blog plugin** demo! This post was seeded automatically when the server started.

## What you can do

- Browse published posts on this page
- Click a post to read the full article
- Use the **New Post** button to create your own post
- Edit or delete posts from the post detail page

## Markdown support

The editor supports full **Markdown** including code blocks, blockquotes, tables, lists, and headings.

Try creating a new post to see the editor in action!\`,
      excerpt: "An introduction to the BTST blog plugin — browse posts, create new ones, and explore the Markdown editor.",
      published: true,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  })
  await adapter.create({
    model: "post",
    data: {
      title: "Building Full-Stack Apps with Plugins",
      slug: "full-stack-plugins",
      content: \`# Building Full-Stack Apps with Plugins

BTST takes a plugin-first approach to full-stack development. Each plugin ships with backend API routes, database schema, React components, and React Query hooks.

| Plugin | Description |
|--------|-------------|
| Blog | Markdown blog with drafts, tags, and RSS |
| AI Chat | Streaming AI conversations |
| CMS | Headless content management |
| Kanban | Project boards and task tracking |
| Form Builder | Dynamic forms with submissions |
| UI Builder | Visual drag-and-drop page builder |\`,
      excerpt: "Explore how BTST plugins combine backend APIs, database schemas, and React components into one cohesive system.",
      published: true,
      publishedAt: new Date(now.getTime() - 86400000),
      createdAt: new Date(now.getTime() - 86400000),
      updatedAt: new Date(now.getTime() - 86400000),
    },
  })
  await adapter.create({
    model: "post",
    data: {
      title: "SEO and Meta Tags in BTST",
      slug: "seo-and-meta-tags",
      content: \`# SEO and Meta Tags in BTST

BTST plugins generate proper meta tags for every page automatically including title, description, Open Graph, and Twitter card tags.\`,
      excerpt: "BTST plugins generate Open Graph and Twitter card meta tags for every page automatically.",
      published: true,
      publishedAt: new Date(now.getTime() - 172800000),
      createdAt: new Date(now.getTime() - 172800000),
      updatedAt: new Date(now.getTime() - 172800000),
    },
  })
  console.log("[seed] blog: 3 posts created")
  return { ok: true }
`;

const KANBAN_SEED_BODY = `
  const { findOrCreateKanbanBoard, getKanbanColumnsByBoardId, createKanbanTask } = await import("@btst/stack/plugins/kanban/api")
  const adapter = myStack.adapter
  const board = await findOrCreateKanbanBoard(adapter, "demo-board", "BTST Demo Board", ["To Do", "In Progress", "In Review", "Done"])
  const columns = await getKanbanColumnsByBoardId(adapter, board.id)
  if (!columns || columns.length === 0) return { ok: true, skipped: true }
  const todoCol = columns.find((c) => c.title === "To Do")
  const inProgressCol = columns.find((c) => c.title === "In Progress")
  const doneCol = columns.find((c) => c.title === "Done")
  if (!todoCol || !inProgressCol || !doneCol) return { ok: true, skipped: true }
  const existingTasks = await adapter.findMany({ model: "kanbanTask", where: [{ field: "columnId", value: todoCol.id, operator: "eq" }], limit: 1 })
  if (existingTasks.length > 0) return { ok: true, skipped: true }
  await createKanbanTask(adapter, { title: "Set up the BTST stack", columnId: doneCol.id, description: "Install @btst/stack and configure the adapter", priority: "HIGH" })
  await createKanbanTask(adapter, { title: "Add the Kanban plugin", columnId: doneCol.id, description: "Register kanbanBackendPlugin and kanbanClientPlugin", priority: "HIGH" })
  await createKanbanTask(adapter, { title: "Configure custom columns", columnId: inProgressCol.id, description: "Customize the board columns to fit the team workflow", priority: "MEDIUM" })
  await createKanbanTask(adapter, { title: "Invite team members", columnId: inProgressCol.id, description: "Add colleagues to the demo board", priority: "LOW" })
  await createKanbanTask(adapter, { title: "Connect to a real database", columnId: todoCol.id, description: "Replace the in-memory adapter with Prisma, Drizzle, or another supported ORM", priority: "MEDIUM" })
  await createKanbanTask(adapter, { title: "Add authentication", columnId: todoCol.id, description: "Protect the kanban routes with your auth solution", priority: "HIGH" })
  await createKanbanTask(adapter, { title: "Deploy to production", columnId: todoCol.id, description: "Deploy the app to Vercel, Fly.io, or your preferred hosting", priority: "URGENT" })
  console.log("[seed] kanban: 1 board, 4 columns, 7 tasks created")
  return { ok: true }
`;

const FORM_BUILDER_SEED_BODY = `
  const adapter = myStack.adapter
  const existing = await adapter.findMany({ model: "form", limit: 1 })
  if (existing.length > 0) return { ok: true, skipped: true }
  const contactFormSchema = JSON.stringify({
    type: "object",
    properties: {
      name: { type: "string", title: "Your Name", "x-field-type": "text" },
      email: { type: "string", format: "email", title: "Email Address", "x-field-type": "text" },
      subject: { type: "string", title: "Subject", "x-field-type": "text" },
      message: { type: "string", title: "Message", "x-field-type": "textarea" },
      newsletter: { type: "boolean", title: "Subscribe to newsletter", "x-field-type": "switch", default: false },
    },
    required: ["name", "email", "message"],
  })
  const feedbackFormSchema = JSON.stringify({
    type: "object",
    properties: {
      rating: { type: "string", title: "Rating", "x-field-type": "select", enum: ["1","2","3","4","5"], enumNames: ["⭐ Poor","⭐⭐ Fair","⭐⭐⭐ Good","⭐⭐⭐⭐ Very Good","⭐⭐⭐⭐⭐ Excellent"] },
      category: { type: "string", title: "Category", "x-field-type": "radio", enum: ["product","support","documentation","other"], enumNames: ["Product","Support","Documentation","Other"] },
      comments: { type: "string", title: "Comments", "x-field-type": "textarea" },
    },
    required: ["rating", "category"],
  })
  const now = new Date()
  await adapter.create({ model: "form", data: { name: "Contact Us", slug: "contact-us", description: "A simple contact form for getting in touch.", schema: contactFormSchema, successMessage: "Thanks for reaching out! We'll get back to you soon.", status: "active", createdAt: now, updatedAt: now } })
  await adapter.create({ model: "form", data: { name: "Feedback Form", slug: "feedback", description: "Share your feedback about our product and services.", schema: feedbackFormSchema, successMessage: "Thank you for your feedback!", status: "active", createdAt: new Date(now.getTime() - 86400000), updatedAt: new Date(now.getTime() - 86400000) } })
  console.log("[seed] form-builder: 2 forms created")
  return { ok: true }
`;

const CMS_SEED_BODY = `
  const api = myStack.api
  const existing = await api.cms.getAllContentItems("article", { limit: 1 })
  if (existing.items && existing.items.length > 0) return { ok: true, skipped: true }
  await api.cms.createContentItem("article", { slug: "welcome-to-btst-cms", data: { title: "Welcome to BTST CMS", summary: "An introduction to managing structured content with the BTST CMS plugin.", body: "The BTST CMS plugin lets you define your content types as Zod schemas and get a fully functional headless CMS automatically.", publishedAt: new Date().toISOString(), published: true } })
  await api.cms.createContentItem("article", { slug: "getting-started-with-content-types", data: { title: "Getting Started with Content Types", summary: "Learn how to define and manage content types in the BTST CMS plugin.", body: "Content types are defined as Zod schemas in your stack configuration. Each schema field maps to a form field in the CMS editor.", publishedAt: new Date(Date.now() - 86400000).toISOString(), published: true } })
  await api.cms.createContentItem("article", { slug: "headless-cms-benefits", data: { title: "Benefits of a Headless CMS", summary: "Explore why headless CMS architecture is ideal for modern web applications.", body: "A headless CMS separates content management from presentation, giving developers full control over how content is displayed.", publishedAt: new Date(Date.now() - 172800000).toISOString(), published: false } })
  console.log("[seed] cms: 3 articles created")
  return { ok: true }
`;

const UI_BUILDER_SEED_BODY = `
  const { UI_BUILDER_TYPE_SLUG } = await import("@btst/stack/plugins/ui-builder")
  const api = myStack.api
  const existing = await api.cms.getAllContentItems(UI_BUILDER_TYPE_SLUG, { limit: 1 })
  if (existing.items && existing.items.length > 0) return { ok: true, skipped: true }
  const initialLayers = [{ id: "page-root", type: "div", name: "Page", props: { className: "min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-8" }, children: [{ id: "welcome-card", type: "Card", name: "Welcome Card", props: { className: "w-full max-w-md shadow-xl" }, children: [{ id: "card-content", type: "CardContent", name: "Card Content", props: {}, children: [{ id: "welcome-text", type: "CardDescription", name: "Welcome Message", props: { className: "text-base leading-relaxed" }, children: "Welcome to UI Builder! Edit this page in the visual editor." }] }] }] }]
  const initialVariables = [{ id: "userName", name: "User Name", type: "string", defaultValue: "Alex" }]
  await api.cms.createContentItem(UI_BUILDER_TYPE_SLUG, { slug: "welcome", data: { layers: JSON.stringify(initialLayers), variables: JSON.stringify(initialVariables), status: "published" } })
  console.log("[seed] ui-builder: 1 sample page created")
  return { ok: true }
`;

// ── Route wrappers per framework ─────────────────────────────────────────────

function nextjsRoute(
	pluginKey: PluginKey,
	alias: string,
	body: string,
): string {
	return `import { myStack } from "${alias}lib/stack"
import { NextResponse } from "next/server"

let seeded = false

export async function GET() {
  if (seeded) return NextResponse.json({ ok: true, skipped: true })
  seeded = true
  try {
    const result = await (async () => {${body}    })()
    return NextResponse.json(result ?? { ok: true })
  } catch (err) {
    console.error("[seed] ${pluginKey} failed:", err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
`;
}

function reactRouterRoute(
	pluginKey: PluginKey,
	alias: string,
	body: string,
): string {
	return `import { data } from "react-router"
import { myStack } from "${alias}lib/stack"

let seeded = false

export async function loader() {
  if (seeded) return data({ ok: true, skipped: true })
  seeded = true
  try {
    const result = await (async () => {${body}    })()
    return data(result ?? { ok: true })
  } catch (err) {
    console.error("[seed] ${pluginKey} failed:", err)
    return data({ ok: false }, { status: 500 })
  }
}
`;
}

function tanstackRoute(
	pluginKey: PluginKey,
	alias: string,
	body: string,
): string {
	return `import { createAPIFileRoute } from "@tanstack/react-start/api"
import { myStack } from "${alias}lib/stack"

let seeded = false

export const Route = createAPIFileRoute("/api/seed-${pluginKey}")({
  GET: async () => {
    if (seeded) return Response.json({ ok: true, skipped: true })
    seeded = true
    try {
      const result = await (async () => {${body}      })()
      return Response.json(result ?? { ok: true })
    } catch (err) {
      console.error("[seed] ${pluginKey} failed:", err)
      return Response.json({ ok: false }, { status: 500 })
    }
  },
})
`;
}

// ── Public API ───────────────────────────────────────────────────────────────

type SeedBody = string;

const SEED_BODIES: Partial<Record<PluginKey, SeedBody>> = {
	blog: BLOG_SEED_BODY,
	kanban: KANBAN_SEED_BODY,
	"form-builder": FORM_BUILDER_SEED_BODY,
	cms: CMS_SEED_BODY,
	"ui-builder": UI_BUILDER_SEED_BODY,
};

const FRAMEWORK_ALIASES: Record<Framework, string> = {
	nextjs: "@/",
	"react-router": "~/",
	tanstack: "@/",
};

export interface SeedRouteFile {
	path: string;
	content: string;
}

/**
 * Build the seed route file for a given plugin and framework.
 * Returns null if the plugin has no seed data.
 */
export function buildSeedRouteFile(
	pluginKey: PluginKey,
	framework: Framework,
): SeedRouteFile | null {
	const body = SEED_BODIES[pluginKey];
	if (!body) return null;

	const alias = FRAMEWORK_ALIASES[framework];
	const path = seedRoutePath(pluginKey, framework);

	let content: string;
	if (framework === "nextjs") {
		content = nextjsRoute(pluginKey, alias, body);
	} else if (framework === "react-router") {
		content = reactRouterRoute(pluginKey, alias, body);
	} else {
		content = tanstackRoute(pluginKey, alias, body);
	}

	return { path, content };
}

/**
 * Build seed route files for all given plugins.
 * Plugins without seed data are silently skipped.
 */
export function buildSeedRouteFiles(
	pluginKeys: PluginKey[],
	framework: Framework,
): SeedRouteFile[] {
	return pluginKeys.flatMap((key) => {
		const file = buildSeedRouteFile(key, framework);
		return file ? [file] : [];
	});
}

/**
 * Generate the seed-runner.mjs script that polls the dev server and
 * calls each seed route once it's ready.
 */
export function buildSeedRunnerScript(
	pluginKeys: PluginKey[],
	port: number,
): string {
	const seedPaths = pluginKeys
		.filter((k) => k in SEED_BODIES)
		.map((k) => `"/api/seed-${k}"`)
		.join(", ");

	return `#!/usr/bin/env node
// Auto-generated by BTST Playground — seeds sample data for selected plugins.
const BASE = "http://localhost:${port}"
const SEEDS = [${seedPaths}]

async function waitForServer(maxAttempts = 90, delay = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delay))
    try {
      await fetch(\`\${BASE}/\`)
      return true
    } catch {}
  }
  return false
}

async function main() {
  console.log("[seed] Waiting for dev server on port ${port}...")
  const ready = await waitForServer()
  if (!ready) {
    console.log("[seed] Dev server never became ready — giving up")
    return
  }
  for (const route of SEEDS) {
    try {
      const res = await fetch(\`\${BASE}\${route}\`)
      const data = await res.json()
      console.log(\`[seed] \${route}: \`, data)
    } catch (err) {
      console.error(\`[seed] \${route} failed:\`, err.message)
    }
  }
}

main()
`;
}
