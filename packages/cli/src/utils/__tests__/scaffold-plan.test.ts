import { describe, expect, it } from "vitest";
import { buildScaffoldPlan } from "../scaffold-plan";

describe("scaffold plan", () => {
	it("builds expected files for nextjs", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		expect(plan.files.map((file) => file.path)).toEqual([
			"lib/stack.ts",
			"lib/stack-client.tsx",
			"lib/query-client.ts",
			"app/api/data/[[...all]]/route.ts",
			"app/pages/[[...all]]/page.tsx",
			"app/pages/layout.tsx",
		]);
		expect(plan.files[0]?.content).toContain("blogBackendPlugin()");
		expect(plan.files[1]?.content).toContain("blogClientPlugin");
		expect(plan.files[1]?.content).toContain("const baseURL = getBaseURL()");
		expect(plan.files[5]?.content).toContain(
			'import { StackProvider } from "@btst/stack/context"',
		);
		expect(plan.files[5]?.content).toContain(
			"navigate: (path: string) => router.push(path)",
		);
		expect(plan.files[5]?.content).toContain(
			'Link: ({ href, ...props }: any) => <Link href={href || "#"} {...props} />',
		);
		expect(plan.pagesLayoutPath).toBe("app/pages/layout.tsx");
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
		"does not emit baseURL declarations when no plugins are selected (%s)",
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
			if (framework === "nextjs") {
				const pagesLayoutFile = plan.files.find((file) =>
					file.path.endsWith("app/pages/layout.tsx"),
				);
				expect(pagesLayoutFile?.content).toBeDefined();
				expect(pagesLayoutFile?.content).not.toContain("StackProvider");
				expect(pagesLayoutFile?.content).not.toContain("useRouter");
			}
		},
	);

	it.each(["nextjs", "react-router", "tanstack"] as const)(
		"emits baseURL declarations when plugins are selected (%s)",
		async (framework) => {
			const plan = await buildScaffoldPlan({
				framework,
				adapter: "memory",
				plugins: ["blog"],
				alias: "@/",
				cssFile:
					framework === "nextjs" ? "app/globals.css" : "src/styles/app.css",
			});

			const stackClientFile = plan.files.find((file) =>
				file.path.endsWith("stack-client.tsx"),
			);
			expect(stackClientFile?.content).toBeDefined();
			expect(stackClientFile?.content).toContain(
				"const baseURL = getBaseURL()",
			);
			expect(stackClientFile?.content).toContain(
				'if (typeof window !== "undefined")',
			);
		},
	);

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

	it("wires ui-builder content type into cms backend config", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["cms", "ui-builder"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain(
			"cms: cmsBackendPlugin({ contentTypes: [UI_BUILDER_CONTENT_TYPE] }),",
		);
	});

	it("uses camelCase config keys for client plugins", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ai-chat", "cms", "ui-builder", "form-builder"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackClientFile = plan.files.find((file) =>
			file.path.endsWith("stack-client.tsx"),
		);
		expect(stackClientFile?.content).toContain("aiChat: aiChatClientPlugin({");
		expect(stackClientFile?.content).toContain(
			"uiBuilder: uiBuilderClientPlugin({",
		);
		expect(stackClientFile?.content).toContain(
			"formBuilder: formBuilderClientPlugin({",
		);
		expect(stackClientFile?.content).not.toContain('"ai-chat":');
		expect(stackClientFile?.content).not.toContain('"ui-builder":');
		expect(stackClientFile?.content).not.toContain('"form-builder":');
	});

	it("renders ai-chat backend plugin with compile-safe placeholder model", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["ai-chat"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain(
			"aiChat: aiChatBackendPlugin({ model: undefined as any }),",
		);
	});

	it("renders cms backend plugin with compile-safe placeholder config", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["cms"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain(
			"cms: cmsBackendPlugin({ contentTypes: [] }),",
		);
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
	});

	it("renders media backend plugin with compile-safe placeholder config", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["media"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		const stackFile = plan.files.find((file) => file.path.endsWith("stack.ts"));
		expect(stackFile?.content).toContain(
			"media: mediaBackendPlugin({ storageAdapter: undefined as any }),",
		);
	});

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
			"const queryClient = getOrCreateQueryClient()",
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
			"const queryClient = getOrCreateQueryClient()",
		);
		expect(pagesRouteFile?.content).not.toContain("context.queryClient");
	});
});
