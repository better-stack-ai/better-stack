import type { Adapter } from "@btst/stack/plugins/api";

let seeded = false;

export async function seedBlogData(adapter: Adapter) {
	if (seeded) return;
	seeded = true;

	try {
		// Check if posts already exist
		const existing = await adapter.findMany({ model: "post", limit: 1 });
		if (existing.length > 0) return;

		const now = new Date();

		await adapter.create({
			model: "post",
			data: {
				title: "Getting Started with BTST Blog",
				slug: "getting-started",
				content: `# Getting Started with BTST Blog

Welcome to the **BTST Blog plugin** demo! This post was seeded automatically when the server started.

## What you can do

- Browse published posts on this page
- Click a post to read the full article
- Use the **New Post** button to create your own post
- Edit or delete posts from the post detail page

## Markdown support

The editor supports full **Markdown** including:

- \`code blocks\`
- > Blockquotes
- Tables, lists, headings
- LaTeX math via KaTeX

Try creating a new post to see the editor in action!`,
				excerpt:
					"An introduction to the BTST blog plugin — browse posts, create new ones, and explore the Markdown editor.",
				published: true,
				publishedAt: now,
				createdAt: now,
				updatedAt: now,
			},
		});

		await adapter.create({
			model: "post",
			data: {
				title: "Building Full-Stack Apps with Plugins",
				slug: "full-stack-plugins",
				content: `# Building Full-Stack Apps with Plugins

BTST takes a plugin-first approach to full-stack development. Each plugin ships with:

- **Backend API routes** — typed HTTP endpoints
- **Database schema** — auto-migrated for your ORM
- **React components** — server-rendered, SEO-ready pages
- **React Query hooks** — for client-side data management

## Available plugins

| Plugin | Description |
|--------|-------------|
| Blog | Markdown blog with drafts, tags, and RSS |
| AI Chat | Streaming AI conversations |
| CMS | Headless content management |
| Kanban | Project boards and task tracking |
| Form Builder | Dynamic forms with submissions |
| UI Builder | Visual drag-and-drop page builder |

## How it works

You register backend plugins in \`lib/stack.ts\` and client plugins in \`lib/stack-client.ts\`. The framework handles routing, SSR, and hydration automatically.`,
				excerpt:
					"Explore how BTST plugins combine backend APIs, database schemas, and React components into one cohesive system.",
				published: true,
				publishedAt: new Date(now.getTime() - 86400000),
				createdAt: new Date(now.getTime() - 86400000),
				updatedAt: new Date(now.getTime() - 86400000),
			},
		});

		await adapter.create({
			model: "post",
			data: {
				title: "SEO and Meta Tags in BTST",
				slug: "seo-and-meta-tags",
				content: `# SEO and Meta Tags in BTST

BTST plugins generate proper meta tags for every page automatically.

## What's generated

Each blog post page produces:

- \`<title>\` — post title
- \`<meta name="description">\` — excerpt or auto-generated summary
- Open Graph tags (\`og:title\`, \`og:description\`, \`og:image\`)
- Twitter card tags
- Canonical URLs
- Article publish date and author

## Configuration

Pass your SEO configuration when initialising the client plugin:

\`\`\`ts
blogClientPlugin({
  seo: {
    siteName: "My Blog",
    author: "Your Name",
    twitterHandle: "@yourhandle",
    locale: "en_US",
    defaultImage: "https://example.com/og.png",
  },
})
\`\`\`

The plugin merges your config with post-specific data to produce the final meta tags.`,
				excerpt:
					"BTST plugins generate Open Graph and Twitter card meta tags for every page automatically.",
				published: true,
				publishedAt: new Date(now.getTime() - 172800000),
				createdAt: new Date(now.getTime() - 172800000),
				updatedAt: new Date(now.getTime() - 172800000),
			},
		});

		console.log("[demo] Blog seed complete — 3 posts created");
	} catch (err) {
		console.error("[demo] Blog seed failed:", err);
	}
}
