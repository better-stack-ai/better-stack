import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { buildScaffoldPlan } from "../scaffold-plan";
import { PLUGINS } from "../constants";

describe("scaffold plan", () => {
	it.each(["memory", "mongodb"] as const)(
		"rejects Form Builder with the unsupported %s generated adapter configuration",
		async (adapter) => {
			await expect(
				buildScaffoldPlan({
					framework: "nextjs",
					adapter,
					plugins: ["form-builder"],
					alias: "@/",
					cssFile: "app/globals.css",
				}),
			).rejects.toThrow(
				"requires an adapter with isolated transaction support",
			);
		},
	);

	it.each(["prisma", "drizzle", "kysely"] as const)(
		"enables isolated transactions for Form Builder in the %s scaffold",
		async (adapter) => {
			const plan = await buildScaffoldPlan({
				framework: "nextjs",
				adapter,
				plugins: ["form-builder"],
				alias: "@/",
				cssFile: "app/globals.css",
			});
			const stackFile = plan.files.find((file) => file.path === "lib/stack.ts");
			expect(stackFile?.content).toContain("transaction: true");
			expect(stackFile?.content).toContain(")({}),");
			if (adapter === "drizzle") {
				expect(stackFile?.content).toContain("BTST_DRIZZLE_PROVIDER");
				expect(stackFile?.content).toContain("provider: drizzleProvider");
				expect(stackFile?.content).not.toContain('provider: "pg"');
			}
			if (adapter === "kysely") {
				expect(stackFile?.content).not.toContain('type: "postgres"');
			}
		},
	);

	it.each(["prisma", "drizzle", "kysely"] as const)(
		"enables isolated transactions for Media in the %s scaffold",
		async (adapter) => {
			const plan = await buildScaffoldPlan({
				framework: "nextjs",
				adapter,
				plugins: ["media"],
				alias: "@/",
				cssFile: "app/globals.css",
			});
			const stackFile = plan.files.find((file) => file.path === "lib/stack.ts");
			expect(stackFile?.content).toContain("transaction: true");
		},
	);

	it.each(["prisma", "drizzle", "kysely"] as const)(
		"enables isolated transactions for AI Chat in the %s scaffold",
		async (adapter) => {
			const plan = await buildScaffoldPlan({
				framework: "nextjs",
				adapter,
				plugins: ["ai-chat"],
				alias: "@/",
				cssFile: "app/globals.css",
			});
			const stackFile = plan.files.find((file) => file.path === "lib/stack.ts");
			expect(stackFile?.content).toContain("transaction: true");
		},
	);

	it("rejects Media with the unsupported MongoDB generated configuration", async () => {
		await expect(
			buildScaffoldPlan({
				framework: "nextjs",
				adapter: "mongodb",
				plugins: ["media"],
				alias: "@/",
				cssFile: "app/globals.css",
			}),
		).rejects.toThrow(
			"Media requires an adapter with isolated transaction support",
		);
	});

	it("keeps the serialized memory adapter available for Media scaffolds", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["media"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const stackFile = plan.files.find((file) => file.path === "lib/stack.ts");
		expect(stackFile?.content).toContain("createMemoryAdapter");
		expect(stackFile?.content).not.toContain("transaction: true");
	});

	it("emits the required configurable provider for Drizzle without Form Builder", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "drizzle",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const stackFile = plan.files.find((file) => file.path === "lib/stack.ts");
		expect(stackFile?.content).toContain("BTST_DRIZZLE_PROVIDER");
		expect(stackFile?.content).toContain("provider: drizzleProvider");
		expect(stackFile?.content).not.toContain("transaction: true");
	});

	it("builds expected files for nextjs", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const paths = plan.files.map((file) => file.path);
		// Core BTST files are always present
		expect(paths).toEqual(
			expect.arrayContaining([
				"lib/stack.ts",
				"lib/stack-client.tsx",
				"lib/query-client.ts",
				"app/api/data/[[...all]]/route.ts",
				"app/pages/[[...all]]/page.tsx",
				"app/pages/layout.tsx",
			]),
		);
		// Navbar + mode-toggle generated for all frameworks
		expect(paths).toContain("components/navbar.tsx");
		expect(paths).toContain("components/mode-toggle.tsx");
		// Blog triggers sitemap + SSG pages
		expect(paths).toContain("app/sitemap.ts");
		expect(paths).toContain("app/pages/ssg-blog/page.tsx");
		expect(paths).toContain("app/pages/ssg-blog/[slug]/page.tsx");

		const stackFile = plan.files.find((f) => f.path === "lib/stack.ts");
		expect(stackFile?.content).toContain("blogBackendPlugin()");
		expect(stackFile?.content).toContain(
			"type AppStack = ReturnType<typeof createAppStack>",
		);
		expect(stackFile?.content).toContain(
			'import { createBackendStack } from "@btst/stack/api"',
		);
		expect(stackFile?.content).not.toContain(
			'import { stack } from "@btst/stack"',
		);
		expect(stackFile?.content).not.toContain(
			"__btst_stack__?: ReturnType<typeof stack>",
		);
		const stackClientFile = plan.files.find(
			(f) => f.path === "lib/stack-client.tsx",
		);
		expect(stackClientFile?.content).toContain("blogClientPlugin");
		expect(stackClientFile?.content).toContain("createClientStack({");
		expect(stackClientFile?.content).not.toContain("createStackClient");
		expect(stackClientFile?.content).toContain("options?: StackClientOptions");
		expect(stackClientFile?.content).not.toContain("getStackClientForRequest");
		expect(stackClientFile?.content).toContain(
			'site: { baseURL: siteOrigin, basePath: "/pages" }',
		);
		expect(stackClientFile?.content).toContain("blog: blogClientPlugin(),");
		expect(stackClientFile?.content).not.toContain("apiBaseURL:");
		const stackClientServerFile = plan.files.find(
			(f) => f.path === "lib/stack-client.server.ts",
		);
		expect(stackClientServerFile?.content).toContain(
			"resolveTrustedClientOrigins",
		);
		expect(stackClientServerFile?.content).toContain(
			"export function getStackClientForRequest(",
		);
		expect(stackClientServerFile?.content).toContain(
			"BTST_REQUEST_HEADERS_SERVER_MARKER",
		);
		expect(stackClientServerFile?.content).not.toContain("VERCEL_URL");
		expect(stackClientFile?.content).not.toContain("VERCEL_URL");
		const pagesLayoutFile = plan.files.find(
			(f) => f.path === "app/pages/layout.tsx",
		);
		const pagesClientLayoutFile = plan.files.find(
			(f) => f.path === "app/pages/client-layout.tsx",
		);
		expect(pagesLayoutFile?.content).toContain("getServerClientOrigins()");
		expect(pagesLayoutFile?.content).not.toContain("force-dynamic");
		expect(pagesClientLayoutFile?.content).toContain(
			'import { StackProvider } from "@btst/stack/context"',
		);
		expect(pagesClientLayoutFile?.content).toContain(
			'import { nextRouter } from "@btst/stack/next"',
		);
		expect(pagesClientLayoutFile?.content).toContain("router={nextRouter()}");
		expect(pagesClientLayoutFile?.content).toContain("stack={browserStack}");
		expect(pagesClientLayoutFile?.content).not.toContain("navigate: (path");
		expect(pagesClientLayoutFile?.content).not.toContain("Link: (");
		expect(pagesClientLayoutFile?.content).not.toContain("apiBaseURL:");
		expect(pagesClientLayoutFile?.content).not.toContain("apiBasePath:");
		expect(pagesClientLayoutFile?.content).not.toContain("as never");
		expect(plan.pagesLayoutPath).toBe("app/pages/layout.tsx");
		const pagesRouteFile = plan.files.find(
			(f) => f.path === "app/pages/[[...all]]/page.tsx",
		);
		expect(pagesRouteFile?.content).toContain("getStackClientForRequest");
		expect(pagesRouteFile?.content).toContain("new Headers(await headers())");
	});

	it("resolves src-prefixed Next.js pages layout path", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "src/app/globals.css",
		});

		expect(plan.pagesLayoutPath).toBe("src/app/pages/layout.tsx");
	});

	it.each(["nextjs", "react-router", "tanstack"] as const)(
		"emits the provider shell without client plugin entries (%s)",
		async (framework) => {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "memory",
				plugins: [],
				alias: "@/",
				cssFile:
					framework === "nextjs" ? "app/globals.css" : "src/styles/app.css",
			});

			const stackClientFile = plan.files.find((file) =>
				file.path.endsWith("stack-client.tsx"),
			);
			expect(stackClientFile?.content).toBeDefined();
			expect(stackClientFile?.content).not.toContain("const getBaseURL()");
			expect(stackClientFile?.content).not.toContain("const getBaseURL =");
			expect(stackClientFile?.content).not.toContain(
				'const baseURL = "http://localhost:3000"',
			);
			const layoutSuffix =
				framework === "nextjs"
					? "app/pages/layout.tsx"
					: framework === "react-router"
						? "routes/pages/_layout.tsx"
						: "routes/pages/route.tsx";
			const pagesLayoutFile = plan.files.find((file) =>
				framework === "nextjs"
					? file.path.endsWith("app/pages/client-layout.tsx")
					: file.path.endsWith(layoutSuffix),
			);
			expect(pagesLayoutFile?.content).toBeDefined();
			expect(pagesLayoutFile?.content).toContain("StackProvider");
			expect(pagesLayoutFile?.content).toContain("stack={browserStack}");
			expect(pagesLayoutFile?.content).not.toContain(
				"getStackClientForRequest",
			);
			const routerFactory =
				framework === "nextjs"
					? "nextRouter()"
					: framework === "react-router"
						? "reactRouter()"
						: "tanstackRouter()";
			expect(pagesLayoutFile?.content).toContain(`router={${routerFactory}}`);
		},
	);

	it.each(["nextjs", "react-router", "tanstack"] as const)(
		"emits canonical shared runtime for mixed canonical plugins (%s)",
		async (framework) => {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "memory",
				plugins: ["blog", "comments"],
				alias: "@/",
				cssFile:
					framework === "nextjs" ? "app/globals.css" : "src/styles/app.css",
			});

			const stackClientFile = plan.files.find((file) =>
				file.path.endsWith("stack-client.tsx"),
			);
			expect(stackClientFile?.content).toBeDefined();
			expect(stackClientFile?.content).toContain(
				"const siteOrigin = getSiteOrigin(options?.siteOrigin)",
			);
			expect(stackClientFile?.content).toContain(
				'if (typeof window !== "undefined")',
			);
			expect(stackClientFile?.content).toContain(
				'site: { baseURL: siteOrigin, basePath: "/pages" }',
			);
			expect(stackClientFile?.content).toContain("queryClient,");
			expect(stackClientFile?.content).toContain("blog: blogClientPlugin(),");
			expect(stackClientFile?.content).toContain(
				"comments: commentsClientPlugin(),",
			);
			expect(stackClientFile?.content).not.toContain("apiBaseURL:");

			const pagesLayoutFile = plan.files.find((file) =>
				file.content.includes("<StackProvider"),
			);
			expect(pagesLayoutFile?.content).not.toContain("as never");
		},
	);

	it.each(["nextjs", "react-router", "tanstack"] as const)(
		"keeps request headers in request-scoped route stacks for %s",
		async (framework) => {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "memory",
				plugins: ["blog"],
				alias: "@/",
				cssFile:
					framework === "nextjs" ? "app/globals.css" : "src/styles/app.css",
			});
			const pageRoute = plan.files.find(
				(file) =>
					file.path.endsWith("app/pages/[[...all]]/page.tsx") ||
					file.path.endsWith("routes/pages/$.tsx"),
			);
			const layout = plan.files.find((file) =>
				file.content.includes("<StackProvider"),
			);
			const requestStack = plan.files.find((file) =>
				file.path.endsWith("stack-client.server.ts"),
			);

			expect(pageRoute?.content).toContain("getStackClientForRequest");
			expect(pageRoute?.content).toContain("headers:");
			expect(pageRoute?.content).toContain("stack-client.server");
			expect(requestStack?.content).toContain("resolveTrustedClientOrigins");
			expect(requestStack?.content).toContain(
				"configuredApiOrigin: configuredApiOrigin()",
			);
			expect(requestStack?.content).toContain(
				'isProduction: process.env.NODE_ENV === "production"',
			);
			expect(requestStack?.content).not.toContain(
				"baseURL: new URL(request.url).origin",
			);
			if (framework === "nextjs") {
				expect(layout?.content).toContain(
					"getStackClient(queryClient, clientOrigins)",
				);
			} else {
				expect(layout?.content).toContain("apiOrigin");
				expect(layout?.content).toContain("siteOrigin");
				expect(layout?.content).toContain(
					"getStackClient(queryClient, { apiOrigin, siteOrigin })",
				);
			}
			expect(layout?.content).not.toContain("getStackClientForRequest");
			expect(layout?.content).not.toContain("request.headers");

			if (framework === "nextjs") {
				expect(pageRoute?.content).toContain('from "next/headers"');
				expect(pageRoute?.content).toContain("new Headers(await headers())");
			} else if (framework === "react-router") {
				expect(pageRoute?.content).toContain("page.createLoader");
				expect(pageRoute?.content).toContain("request.headers");
				expect(pageRoute?.content).toContain("new URL(request.url).origin");
			} else {
				expect(pageRoute?.content).toContain("createIsomorphicFn");
				expect(pageRoute?.content).toContain("getRequest()");
				expect(pageRoute?.content).toContain(
					"getStackClient(queryClient, await getTrustedClientOrigins())",
				);
			}
		},
	);

	it("preserves backend-only and client-only plugin registrations", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["open-api", "route-docs"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const backend = plan.files.find((file) => file.path === "lib/stack.ts");
		const client = plan.files.find(
			(file) => file.path === "lib/stack-client.tsx",
		);

		expect(backend?.content).toContain("openApi: openApiBackendPlugin()");
		expect(backend?.content).not.toContain("routeDocs:");
		expect(client?.content).toContain("routeDocs: routeDocsClientPlugin()");
		expect(client?.content).not.toContain("openApi:");
	});

	it("keeps generated static work on explicit trusted and raw surfaces", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "prisma",
			plugins: ["blog", "cms", "form-builder", "kanban"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const staticPages = plan.files.filter((file) =>
			file.path.includes("/ssg-"),
		);
		const staticSource = staticPages.map((file) => file.content).join("\n");

		expect(staticPages.length).toBeGreaterThan(0);
		expect(staticSource).toContain("myStack.trusted.blog.listPosts");
		expect(staticSource).toContain("myStack.trusted.cms.listContentTypes");
		expect(staticSource).toContain("myStack.raw.blog.prefetchForRoute");
		expect(staticSource).toContain("myStack.raw.cms.prefetchForRoute");
		expect(staticSource).toContain("myStack.raw.formBuilder.prefetchForRoute");
		expect(staticSource).toContain("myStack.raw.kanban.prefetchForRoute");
		expect(staticSource).not.toContain("myStack.api.");
	});

	it("ships a compile fixture that uses only public extension definitions", async () => {
		const source = await readFile(
			new URL(
				"../../../scripts/fixtures/third-party-plugin.tsx",
				import.meta.url,
			),
			"utf8",
		);

		expect(source).toContain('from "@btst/stack/plugins/api"');
		expect(source).toContain('from "@btst/stack/plugins/client"');
		expect(source).toContain("function thirdPartyProbeBackendPlugin()");
		expect(source).toContain("function thirdPartyProbeClientPlugin()");
		expect(source).toContain("defineBackendPlugin({");
		expect(source).toContain("defineClientPlugin<ThirdPartyProbeOverrides>()");
		expect(source).toContain("thirdPartyProbe: thirdPartyProbeBackendPlugin()");
		expect(source).toContain("thirdPartyProbe: thirdPartyProbeClientPlugin()");
		expect(source).toContain("createBackendStack({");
		expect(source).toContain("createClientStack({");
		expect(source).toContain(
			'overrides={{ thirdPartyProbe: { label: "Third-party probe" } }}',
		);
		expect(source).not.toContain("/src/");
		expect(source).not.toContain("StackProvider<");
	});

	it("does not register ui-builder as a backend plugin entry", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ui-builder"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).not.toContain("uiBuilder:");
		expect(stackFile?.content).not.toContain("UI_BUILDER_CONTENT_TYPE");
	});

	it("wires ui-builder correctly when cms is auto-injected (as init.ts does)", async () => {
		// The CLI normalises ["ui-builder"] → ["cms", "ui-builder"] before calling
		// buildScaffoldPlan, so cms is always present when ui-builder is selected.
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["cms", "ui-builder"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		const stackClientFile = plan.files.find((file) =>
			file.path.endsWith("stack-client.tsx"),
		);

		// cms backend must be registered with article type and UI_BUILDER_CONTENT_TYPE
		expect(stackFile?.content).toContain("cms: cmsBackendPlugin({");
		expect(stackFile?.content).toContain('slug: "article"');
		expect(stackFile?.content).toContain("UI_BUILDER_CONTENT_TYPE");
		// ui-builder client plugin must be registered
		expect(stackClientFile?.content).toContain(
			"uiBuilder: uiBuilderClientPlugin(),",
		);
		// cms client plugin must also be registered
		expect(stackClientFile?.content).toContain("cms: cmsClientPlugin(),");
		expect(stackClientFile?.content).not.toContain("apiBaseURL:");
	});

	it("wires ui-builder content type into cms backend config", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["cms", "ui-builder"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain("cms: cmsBackendPlugin({");
		expect(stackFile?.content).toContain('slug: "article"');
		expect(stackFile?.content).toContain("UI_BUILDER_CONTENT_TYPE");
	});

	it("uses camelCase config keys for client plugins", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "prisma",
			plugins: [
				"ai-chat",
				"cms",
				"comments",
				"ui-builder",
				"form-builder",
				"kanban",
			],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackClientFile = plan.files.find((file) =>
			file.path.endsWith("stack-client.tsx"),
		);
		expect(stackClientFile?.content).toContain(
			'aiChat: aiChatClientPlugin({ mode: "public" }),',
		);
		expect(stackClientFile?.content).toContain('basePath: "/api/data"');
		expect(stackClientFile?.content).toContain('basePath: "/pages"');
		expect(stackClientFile?.content).toContain("queryClient,");
		expect(stackClientFile?.content).not.toMatch(
			/aiChat: aiChatClientPlugin\(\{[^}]*apiBaseURL/s,
		);
		expect(stackClientFile?.content).toContain(
			"uiBuilder: uiBuilderClientPlugin(),",
		);
		expect(stackClientFile?.content).toContain(
			"formBuilder: formBuilderClientPlugin(),",
		);
		expect(stackClientFile?.content).toContain(
			"comments: commentsClientPlugin(),",
		);
		expect(stackClientFile?.content).toContain("kanban: kanbanClientPlugin(),");
		expect(stackClientFile?.content).not.toContain('"ai-chat":');
		expect(stackClientFile?.content).not.toContain('"ui-builder":');
		expect(stackClientFile?.content).not.toContain('"form-builder":');
	});

	it("renders ai-chat backend plugin with openai model and public mode", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ai-chat"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain(
			'aiChat: aiChatBackendPlugin({ model: openai("gpt-4o-mini"), access: "public" }),',
		);
		expect(stackFile?.content).toContain(
			'import { openai } from "@ai-sdk/openai"',
		);

		const pagesLayoutFile = plan.files.find((file) =>
			file.path.endsWith("app/pages/client-layout.tsx"),
		);
		// PageAIContextProvider belongs in the root layout, not the pages layout
		expect(pagesLayoutFile?.content).not.toContain("PageAIContextProvider");
		expect(pagesLayoutFile?.content).toContain(
			'import { ChatLayout } from "@btst/stack/plugins/ai-chat/client"',
		);
		expect(pagesLayoutFile?.content).toContain('layout="widget"');
		expect(pagesLayoutFile?.content).not.toContain('mode: "public" as const,');
		expect(pagesLayoutFile?.content).not.toContain("overrides=");
		// Widget must be hidden on the chat route itself
		expect(pagesLayoutFile?.content).toContain("usePathname");
		expect(pagesLayoutFile?.content).toContain(
			'pathname.startsWith("/pages/chat")',
		);
		expect(pagesLayoutFile?.content).not.toContain('"ai-chat":');
	});

	it("renders cms backend plugin with default article content type", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["cms"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain("cms: cmsBackendPlugin({");
		expect(stackFile?.content).toContain('slug: "article"');
		expect(stackFile?.content).toContain('import { z } from "zod"');
		// Without ui-builder, UI_BUILDER_CONTENT_TYPE should not appear
		expect(stackFile?.content).not.toContain("UI_BUILDER_CONTENT_TYPE");
	});

	it("renders comments backend plugin with compile-safe placeholder config", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["comments"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain(
			"comments: commentsBackendPlugin({ allowPosting: false }),",
		);

		const stackClientFile = plan.files.find((file) =>
			file.path.endsWith("stack-client.tsx"),
		);
		expect(stackClientFile?.content).toContain(
			"comments: commentsClientPlugin(),",
		);
	});

	it("renders Media with the local storage adapter instead of an unsafe placeholder", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["media"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain(
			"media: mediaBackendPlugin({ storageAdapter: localAdapter() }),",
		);
		expect(stackFile?.content).toContain(
			'import { localAdapter } from "@btst/stack/plugins/media/api/adapters/local"',
		);
		expect(stackFile?.content).not.toContain("undefined as any");
	});

	it.each(["nextjs", "react-router", "tanstack"] as const)(
		"emits plugin-only Media and Route Docs factories for %s",
		async (framework) => {
			const browserSiteURLExpression =
				framework === "nextjs"
					? "process.env.NEXT_PUBLIC_SITE_URL"
					: "import.meta.env.VITE_PUBLIC_SITE_URL";
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "memory",
				plugins: ["media", "route-docs"],
				alias: "@/",
				cssFile:
					framework === "nextjs" ? "app/globals.css" : "src/styles/app.css",
			});
			const stackClientFile = plan.files.find((file) =>
				file.path.endsWith("stack-client.tsx"),
			);
			const pagesLayoutFile = plan.files.find((file) =>
				file.content.includes("<StackProvider"),
			);

			expect(stackClientFile?.content).toContain("media: mediaClientPlugin(),");
			expect(stackClientFile?.content).toContain(
				"routeDocs: routeDocsClientPlugin(),",
			);
			expect(stackClientFile?.content).not.toContain("apiBaseURL:");
			expect(stackClientFile?.content).not.toContain("siteBasePath:");
			expect(stackClientFile?.content).toContain(
				`return ${browserSiteURLExpression} || window.location.origin`,
			);
			expect(stackClientFile?.content).toContain(
				"const siteOrigin = getSiteOrigin(options?.siteOrigin)",
			);
			expect(stackClientFile?.content).toContain(
				"if (serverOrigin) return serverOrigin",
			);
			expect(stackClientFile?.content).toContain(
				"if (process.env.BTST_SITE_URL) return process.env.BTST_SITE_URL",
			);
			expect(pagesLayoutFile?.content).not.toContain("as never");
			expect(pagesLayoutFile?.content).not.toContain('"media": {');
			expect(pagesLayoutFile?.content).not.toContain("queryClient:");
		},
	);

	it("uses shared query client utility in react-router pages route template", async () => {
		const plan = await buildScaffoldPlan({
			framework: "react-router",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/app.css",
		});

		const pagesRouteFile = plan.files.find((file) =>
			file.path.endsWith("routes/pages/$.tsx"),
		);
		expect(pagesRouteFile).toBeDefined();
		expect(pagesRouteFile?.content).toContain(
			'import { getOrCreateQueryClient } from "@/lib/query-client"',
		);
		expect(pagesRouteFile?.content).toContain(
			"getQueryClient: getOrCreateQueryClient",
		);
		expect(pagesRouteFile?.content).not.toContain("new QueryClient()");
	});

	it("uses shared query client utility in tanstack pages route template", async () => {
		const plan = await buildScaffoldPlan({
			framework: "tanstack",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "src/styles/app.css",
		});

		const pagesRouteFile = plan.files.find((file) =>
			file.path.endsWith("routes/pages/$.tsx"),
		);
		expect(pagesRouteFile).toBeDefined();
		expect(pagesRouteFile?.content).toContain(
			'import { getOrCreateQueryClient } from "@/lib/query-client"',
		);
		expect(pagesRouteFile?.content).toContain(
			"getQueryClient: getOrCreateQueryClient",
		);
		expect(pagesRouteFile?.content).not.toContain("context.queryClient");
	});

	it("always generates app/routes/pages/_layout.tsx for react-router regardless of plugin selection", async () => {
		// Regression: the playground skeleton's routes.ts hard-references this file
		// via layout("routes/pages/_layout.tsx", [...]), so it must always be present.
		const plan = await buildScaffoldPlan({
			framework: "react-router",
			adapter: "memory",
			plugins: [],
			alias: "~/",
			cssFile: "app/app.css",
		});

		const layoutPath = "app/routes/pages/_layout.tsx";
		expect(plan.files.map((f) => f.path)).toContain(layoutPath);
		expect(plan.pagesLayoutPath).toBe(layoutPath);
	});

	it("always generates src/routes/pages/route.tsx for tanstack regardless of plugin selection", async () => {
		const plan = await buildScaffoldPlan({
			framework: "tanstack",
			adapter: "memory",
			plugins: [],
			alias: "@/",
			cssFile: "src/styles/globals.css",
		});

		const layoutPath = "src/routes/pages/route.tsx";
		expect(plan.files.map((f) => f.path)).toContain(layoutPath);
		expect(plan.pagesLayoutPath).toBe(layoutPath);
	});

	it("builds expected files for react-router including pages layout", async () => {
		const plan = await buildScaffoldPlan({
			framework: "react-router",
			adapter: "memory",
			plugins: ["blog"],
			alias: "~/",
			cssFile: "app/app.css",
		});

		const paths = plan.files.map((f) => f.path);
		expect(paths).toEqual(
			expect.arrayContaining([
				"app/lib/stack.ts",
				"app/lib/stack-client.tsx",
				"app/lib/query-client.ts",
				"app/routes/api/data/$.ts",
				"app/routes/pages/$.tsx",
				"app/routes/pages/_layout.tsx",
			]),
		);
		// Navbar + mode-toggle for react-router
		expect(paths).toContain("app/components/navbar.tsx");
		expect(paths).toContain("app/components/mode-toggle.tsx");
		// Blog triggers sitemap
		expect(paths).toContain("app/routes/sitemap.xml.ts");
		expect(plan.pagesLayoutPath).toBe("app/routes/pages/_layout.tsx");

		const layoutFile = plan.files.find((f) => f.path.endsWith("_layout.tsx"));
		expect(layoutFile?.content).toContain(
			'import { StackProvider } from "@btst/stack/context"',
		);
		expect(layoutFile?.content).toContain(
			'import { reactRouter } from "@btst/stack/react-router"',
		);
		expect(layoutFile?.content).toContain("router={reactRouter()}");
		expect(layoutFile?.content).toContain("stack={browserStack}");
		expect(layoutFile?.content).not.toContain("navigate: (path");
		expect(layoutFile?.content).not.toContain("RouterLink");
		expect(layoutFile?.content).not.toContain("router.push");
		expect(layoutFile?.content).not.toContain("router.replace");
		expect(layoutFile?.content).not.toContain("router.refresh");
	});

	it("builds expected files for tanstack including pages layout", async () => {
		const plan = await buildScaffoldPlan({
			framework: "tanstack",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "src/styles/globals.css",
		});

		const paths = plan.files.map((f) => f.path);
		expect(paths).toEqual(
			expect.arrayContaining([
				"src/lib/stack.ts",
				"src/lib/stack-client.tsx",
				"src/lib/query-client.ts",
				"src/routes/api/data/$.ts",
				"src/routes/pages/$.tsx",
				"src/routes/pages/route.tsx",
			]),
		);
		// Navbar + mode-toggle for tanstack
		expect(paths).toContain("src/components/navbar.tsx");
		expect(paths).toContain("src/components/mode-toggle.tsx");
		// Blog triggers sitemap
		expect(paths).toContain("src/routes/sitemap[.]xml.ts");
		expect(plan.pagesLayoutPath).toBe("src/routes/pages/route.tsx");

		const layoutFile = plan.files.find((f) => f.path.endsWith("route.tsx"));
		expect(layoutFile?.content).toContain(
			'import { StackProvider } from "@btst/stack/context"',
		);
		expect(layoutFile?.content).toContain(
			'import { tanstackRouter } from "@btst/stack/tanstack"',
		);
		expect(layoutFile?.content).toContain("router={tanstackRouter()}");
		expect(layoutFile?.content).toContain("stack={browserStack}");
		expect(layoutFile?.content).not.toContain("navigate: (path");
		expect(layoutFile?.content).not.toContain("RouterLink");
		expect(layoutFile?.content).toContain('createFileRoute("/pages")');
		expect(layoutFile?.content).not.toContain("router.push");
		expect(layoutFile?.content).not.toContain("router.replace");
	});

	it("excludes provider-specific authentication integrations from generated projects", () => {
		const allKeys = PLUGINS.map((p) => p.key);
		expect(allKeys).not.toContain(["better", "auth", "ui"].join("-"));
		expect(JSON.stringify(PLUGINS)).not.toContain(
			["@btst", "better-auth-ui"].join("/"),
		);
	});

	it.each(["nextjs", "react-router", "tanstack"] as const)(
		"uses entry factories and shared provider wiring in every %s scaffold",
		async (framework) => {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "prisma",
				plugins: [
					"blog",
					"ai-chat",
					"cms",
					"form-builder",
					"ui-builder",
					"kanban",
					"comments",
					"media",
				],
				alias: framework === "react-router" ? "~/" : "@/",
				cssFile:
					framework === "nextjs" ? "app/globals.css" : "src/styles/globals.css",
			});

			const routerFactory =
				framework === "nextjs"
					? "nextRouter()"
					: framework === "react-router"
						? "reactRouter()"
						: "tanstackRouter()";
			const pageFactory =
				framework === "nextjs"
					? "createNextPage"
					: framework === "react-router"
						? "createReactRouterPage"
						: "createTanStackPageOptions";
			const apiFactory =
				framework === "nextjs"
					? "toNextRouteHandlers"
					: framework === "react-router"
						? "toReactRouterHandlers"
						: "toTanStackHandlers";

			const pageRoute = plan.files.find(
				(file) =>
					file.path.includes("routes/pages/$.tsx") ||
					file.path.includes("app/pages/[[...all]]/page.tsx"),
			);
			const apiRoute = plan.files.find(
				(file) =>
					file.path.includes("api/data") &&
					(file.path.endsWith("route.ts") || file.path.endsWith("$.ts")),
			);
			expect(pageRoute?.content).toContain(pageFactory);
			expect(pageRoute?.content).not.toContain(".router.getRoute(");
			expect(apiRoute?.content).toContain(apiFactory);

			const providerFiles = plan.files.filter((file) =>
				file.content.includes("<StackProvider"),
			);
			expect(providerFiles.length).toBeGreaterThan(0);
			for (const file of providerFiles) {
				expect(file.content, file.path).toContain(`router={${routerFactory}}`);
				expect(file.content, file.path).toContain("stack={browserStack}");
				expect(file.content, file.path).not.toContain("StackProvider<");
				expect(file.content, file.path).not.toContain("as never");
				expect(file.content, file.path).not.toContain("apiBaseURL: baseURL");
				expect(file.content, file.path).not.toContain(
					'apiBasePath: "/api/data"',
				);
				expect(file.content, file.path).not.toContain("navigate: (path");
				expect(file.content, file.path).not.toContain("Link: (");
			}
		},
	);

	// ── New template tests (Phase 2) ────────────────────────────────────────

	it.each(["nextjs", "react-router", "tanstack"] as const)(
		"always emits navbar and mode-toggle for %s",
		async (framework) => {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "memory",
				plugins: [],
				alias: "@/",
				cssFile:
					framework === "nextjs" ? "app/globals.css" : "src/styles/globals.css",
			});
			const paths = plan.files.map((f) => f.path);
			const componentDir =
				framework === "react-router"
					? "app/components"
					: framework === "tanstack"
						? "src/components"
						: "components";
			expect(paths).toContain(`${componentDir}/navbar.tsx`);
			expect(paths).toContain(`${componentDir}/mode-toggle.tsx`);

			const navbar = plan.files.find((f) => f.path.endsWith("navbar.tsx"));
			expect(navbar?.content).toContain("export function Navbar()");
			expect(navbar?.content).toContain("ModeToggle");
			const modeToggle = plan.files.find((f) =>
				f.path.endsWith("mode-toggle.tsx"),
			);
			expect(modeToggle?.content).toContain("export function ModeToggle()");
			expect(modeToggle?.content).toContain("useTheme");
		},
	);

	it("emits sitemap.ts for nextjs when blog plugin selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("app/sitemap.ts");
		const sitemap = plan.files.find((f) => f.path === "app/sitemap.ts");
		expect(sitemap?.content).toContain("stack.generateSitemap()");
		expect(sitemap?.content).toContain("getStackClientForRequest");
		expect(sitemap?.content).toContain("MetadataRoute.Sitemap");
	});

	it("emits sitemap.ts for nextjs when cms plugin selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["cms"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.files.map((f) => f.path)).toContain("app/sitemap.ts");
	});

	it("does NOT emit sitemap for nextjs when no blog/cms/kanban plugins selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ai-chat"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.files.map((f) => f.path)).not.toContain("app/sitemap.ts");
	});

	it("emits sitemap.xml.ts for react-router when cms plugin selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "react-router",
			adapter: "memory",
			plugins: ["cms"],
			alias: "~/",
			cssFile: "app/app.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("app/routes/sitemap.xml.ts");
		const sitemap = plan.files.find(
			(f) => f.path === "app/routes/sitemap.xml.ts",
		);
		expect(sitemap?.content).toContain("sitemapEntryToXmlString");
		expect(sitemap?.content).toContain("application/xml");
	});

	it("emits sitemap.xml.ts for tanstack when kanban plugin selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "tanstack",
			adapter: "memory",
			plugins: ["kanban"],
			alias: "@/",
			cssFile: "src/styles/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("src/routes/sitemap[.]xml.ts");
		const sitemap = plan.files.find(
			(f) => f.path === "src/routes/sitemap[.]xml.ts",
		);
		expect(sitemap?.content).toContain("createFileRoute");
		expect(sitemap?.content).toContain("sitemapEntryToXmlString");
	});

	it("emits next.config.ts for nextjs when ai-chat selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ai-chat"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("next.config.ts");
		const config = plan.files.find((f) => f.path === "next.config.ts");
		expect(config?.content).toContain("NEXT_PUBLIC_HAS_OPENAI_KEY");
		expect(config?.content).not.toContain("remotePatterns");
	});

	it("emits next.config.ts with images when media selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["media"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const config = plan.files.find((f) => f.path === "next.config.ts");
		expect(config?.content).toContain("remotePatterns");
		expect(config?.content).not.toContain("NEXT_PUBLIC_HAS_OPENAI_KEY");
	});

	it("emits next.config.ts with both env and images when ai-chat + media selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ai-chat", "media"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const config = plan.files.find((f) => f.path === "next.config.ts");
		expect(config?.content).toContain("NEXT_PUBLIC_HAS_OPENAI_KEY");
		expect(config?.content).toContain("remotePatterns");
	});

	it("does NOT emit next.config.ts for nextjs when no ai-chat or media selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.files.map((f) => f.path)).not.toContain("next.config.ts");
	});

	it("does NOT emit next.config.ts for react-router or tanstack", async () => {
		for (const framework of ["react-router", "tanstack"] as const) {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "memory",
				plugins: ["ai-chat", "media"],
				alias: "@/",
				cssFile: "src/styles/globals.css",
			});
			expect(plan.files.map((f) => f.path)).not.toContain("next.config.ts");
		}
	});

	it("emits generateMetadata export in nextjs pages-route", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: [],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const pagesRoute = plan.files.find(
			(f) => f.path === "app/pages/[[...all]]/page.tsx",
		);
		expect(pagesRoute?.content).toContain("generateMetadata");
		expect(pagesRoute?.content).toContain("createNextPage");
	});

	it("emits SSG pages for nextjs when blog selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("app/pages/ssg-blog/page.tsx");
		expect(paths).toContain("app/pages/ssg-blog/[slug]/page.tsx");

		const blogList = plan.files.find(
			(f) => f.path === "app/pages/ssg-blog/page.tsx",
		);
		expect(blogList?.content).toContain("generateStaticParams");
		expect(blogList?.content).toContain("prefetchForRoute");
		expect(blogList?.content).toContain("revalidate = 3600");
	});

	it("emits SSG CMS page for nextjs when cms selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["cms"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("app/pages/ssg-cms/[typeSlug]/page.tsx");
		expect(paths).not.toContain("app/pages/ssg-blog/page.tsx");
	});

	it("emits SSG forms page for nextjs when form-builder selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "prisma",
			plugins: ["form-builder"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.files.map((f) => f.path)).toContain(
			"app/pages/ssg-forms/page.tsx",
		);
	});

	it("emits SSG kanban page for nextjs when kanban selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["kanban"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.files.map((f) => f.path)).toContain(
			"app/pages/ssg-kanban/page.tsx",
		);
	});

	it("does NOT emit SSG pages for react-router or tanstack", async () => {
		for (const framework of ["react-router", "tanstack"] as const) {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "prisma",
				plugins: ["blog", "cms", "form-builder", "kanban"],
				alias: "@/",
				cssFile: "src/styles/globals.css",
			});
			const paths = plan.files.map((f) => f.path);
			expect(paths.some((p) => p.includes("ssg-"))).toBe(false);
		}
	});

	it("emits public-chat page for nextjs when ai-chat selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ai-chat"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("app/public-chat/page.tsx");
		const page = plan.files.find((f) => f.path === "app/public-chat/page.tsx");
		expect(page?.content).toContain("ChatLayout");
		expect(page?.content).toContain("getStackClient(queryClient)");
		expect(page?.content).toContain("stack={browserStack}");
		expect(page?.content).not.toContain("createClientStack");
		expect(page?.content).not.toContain('<ChatLayout mode="public"');
		expect(page?.content).not.toContain("overrides=");
		expect(page?.content).not.toContain('"ai-chat":');
	});

	it("emits public-chat route for react-router when ai-chat selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "react-router",
			adapter: "memory",
			plugins: ["ai-chat"],
			alias: "~/",
			cssFile: "app/app.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("app/routes/public-chat.tsx");
		const route = plan.files.find(
			(f) => f.path === "app/routes/public-chat.tsx",
		);
		expect(route?.content).toContain("ChatLayout");
		expect(route?.content).toContain("getStackClient(queryClient)");
		expect(route?.content).toContain("stack={browserStack}");
		expect(route?.content).not.toContain("createClientStack");
		expect(route?.content).not.toContain('<ChatLayout mode="public"');
	});

	it("emits public-chat route for tanstack when ai-chat selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "tanstack",
			adapter: "memory",
			plugins: ["ai-chat"],
			alias: "@/",
			cssFile: "src/styles/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("src/routes/public-chat.tsx");
		const route = plan.files.find(
			(f) => f.path === "src/routes/public-chat.tsx",
		);
		expect(route?.content).toContain("createFileRoute");
		expect(route?.content).toContain("ChatLayout");
		expect(route?.content).toContain("getStackClient(queryClient)");
		expect(route?.content).toContain("stack={browserStack}");
		expect(route?.content).not.toContain("createClientStack");
		expect(route?.content).not.toContain('<ChatLayout mode="public"');
	});

	it("does NOT emit public-chat routes when ai-chat not selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.files.map((f) => f.path)).not.toContain(
			"app/public-chat/page.tsx",
		);
	});

	it("emits form-demo page for nextjs when form-builder selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "prisma",
			plugins: ["form-builder"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("app/form-demo/[slug]/page.tsx");
		const page = plan.files.find(
			(f) => f.path === "app/form-demo/[slug]/page.tsx",
		);
		expect(page?.content).toContain("FormRenderer");
	});

	it("emits form-demo route for react-router when form-builder selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "react-router",
			adapter: "prisma",
			plugins: ["form-builder"],
			alias: "~/",
			cssFile: "app/app.css",
		});
		expect(plan.files.map((f) => f.path)).toContain("app/routes/form-demo.tsx");
	});

	it("emits form-demo route for tanstack when form-builder selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "tanstack",
			adapter: "prisma",
			plugins: ["form-builder"],
			alias: "@/",
			cssFile: "src/styles/globals.css",
		});
		expect(plan.files.map((f) => f.path)).toContain(
			"src/routes/form-demo.$slug.tsx",
		);
	});

	it("emits preview pages for nextjs when ui-builder selected (with cms)", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["cms", "ui-builder"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		const paths = plan.files.map((f) => f.path);
		expect(paths).toContain("app/preview/[slug]/page.tsx");
		expect(paths).toContain("app/preview/[slug]/client.tsx");
		const client = plan.files.find(
			(f) => f.path === "app/preview/[slug]/client.tsx",
		);
		expect(client?.content).toContain("PageRenderer");
		expect(client?.content).not.toContain("defaultComponentRegistry");
		expect(client?.content).not.toContain("componentRegistry=");
		expect(client?.content).toContain("getStackClient(queryClient)");
		expect(client?.content).toContain("stack={browserStack}");
		expect(client?.content).not.toContain("StackProvider<");
		expect(client?.content).not.toContain('"ui-builder":');
	});

	it("emits preview route for react-router when ui-builder selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "react-router",
			adapter: "memory",
			plugins: ["cms", "ui-builder"],
			alias: "~/",
			cssFile: "app/app.css",
		});
		expect(plan.files.map((f) => f.path)).toContain("app/routes/preview.tsx");
		const preview = plan.files.find((f) => f.path === "app/routes/preview.tsx");
		expect(preview?.content).toContain("stack={browserStack}");
		expect(preview?.content).not.toContain("defaultComponentRegistry");
		expect(preview?.content).not.toContain("componentRegistry=");
		expect(preview?.content).not.toContain("StackProvider<");
		expect(preview?.content).not.toContain('"ui-builder":');
	});

	it("emits preview route for tanstack when ui-builder selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "tanstack",
			adapter: "memory",
			plugins: ["cms", "ui-builder"],
			alias: "@/",
			cssFile: "src/styles/globals.css",
		});
		expect(plan.files.map((f) => f.path)).toContain(
			"src/routes/preview.$slug.tsx",
		);
		const preview = plan.files.find(
			(f) => f.path === "src/routes/preview.$slug.tsx",
		);
		expect(preview?.content).toContain("stack={browserStack}");
		expect(preview?.content).not.toContain("defaultComponentRegistry");
		expect(preview?.content).not.toContain("componentRegistry=");
		expect(preview?.content).not.toContain("StackProvider<");
		expect(preview?.content).not.toContain('"ui-builder":');
	});

	it.each([
		["nextjs", "app/preview/[slug]/client.tsx", "app/globals.css"],
		["react-router", "app/routes/preview.tsx", "app/app.css"],
		["tanstack", "src/routes/preview.$slug.tsx", "src/styles/globals.css"],
	] as const)(
		"emits required Kanban overrides in the %s UI Builder preview",
		async (framework, previewPath, cssFile) => {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "memory",
				plugins: ["cms", "ui-builder", "kanban"],
				alias: "@/",
				cssFile,
			});
			const preview = plan.files.find((file) => file.path === previewPath);

			expect(preview?.content).toContain("kanban: {");
			expect(preview?.content).toContain("resolveUser: async () => null");
			expect(preview?.content).toContain("searchUsers: async () => []");
			expect(preview?.content).not.toContain("StackProvider<");
		},
	);

	it("returns cssImports for selected plugins", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog", "ai-chat"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.cssImports).toContain("@btst/stack/plugins/blog/css");
		expect(plan.cssImports).toContain("@btst/stack/plugins/ai-chat/css");
		expect(plan.cssImports.every((c) => !c.includes("open-api"))).toBe(true);
	});

	it("returns extraPackages for ai-chat and deduplicates them", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ai-chat"],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.extraPackages).toContain("@ai-sdk/openai");
		expect(plan.extraPackages).toContain("ai");
		expect(plan.extraPackages.length).toBe(new Set(plan.extraPackages).size);
	});

	it("returns empty cssImports and extraPackages when no plugins selected", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: [],
			alias: "@/",
			cssFile: "app/globals.css",
		});
		expect(plan.cssImports).toEqual([]);
		expect(plan.extraPackages).toEqual([]);
	});
});
