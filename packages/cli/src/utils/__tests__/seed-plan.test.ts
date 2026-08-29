import { describe, expect, it } from "vitest";
import {
	buildSeedRouteFile,
	buildSeedRouteFiles,
	buildSeedRunnerScript,
	seedRoutePath,
	seedApiPath,
} from "../seed-plan";

describe("seed-plan", () => {
	// ── seedRoutePath ────────────────────────────────────────────────────────

	it("returns correct paths per framework", () => {
		expect(seedRoutePath("blog", "nextjs")).toBe("app/api/seed-blog/route.ts");
		expect(seedRoutePath("blog", "react-router")).toBe(
			"app/routes/api.seed-blog.ts",
		);
		expect(seedRoutePath("blog", "tanstack")).toBe(
			"src/routes/api/seed-blog.ts",
		);
	});

	it("seedApiPath returns the fetch URL for any plugin", () => {
		expect(seedApiPath("blog")).toBe("/api/seed-blog");
		expect(seedApiPath("kanban")).toBe("/api/seed-kanban");
	});

	// ── buildSeedRouteFile ───────────────────────────────────────────────────

	it("returns null for plugins with no seed body (ai-chat, comments, media)", () => {
		expect(buildSeedRouteFile("ai-chat", "nextjs")).toBeNull();
		expect(buildSeedRouteFile("comments", "nextjs")).toBeNull();
		expect(buildSeedRouteFile("media", "nextjs")).toBeNull();
	});

	it.each(["blog", "kanban", "form-builder", "cms", "ui-builder"] as const)(
		"returns a non-null file for seeded plugin %s",
		(key) => {
			const file = buildSeedRouteFile(key, "nextjs");
			expect(file).not.toBeNull();
			expect(file?.path).toBe(seedRoutePath(key, "nextjs"));
		},
	);

	it("nextjs route exports GET and imports myStack and NextResponse", () => {
		const file = buildSeedRouteFile("blog", "nextjs");
		expect(file?.content).toContain("export async function GET()");
		expect(file?.content).toContain('import { myStack } from "@/lib/stack"');
		expect(file?.content).toContain("NextResponse.json");
	});

	it("react-router route exports loader and uses data()", () => {
		const file = buildSeedRouteFile("blog", "react-router");
		expect(file?.content).toContain("export async function loader()");
		expect(file?.content).toContain('import { myStack } from "~/lib/stack"');
		expect(file?.content).toContain("return data(");
	});

	it("tanstack route uses createFileRoute with correct path and GET handler", () => {
		const file = buildSeedRouteFile("blog", "tanstack");
		expect(file?.content).toContain("createFileRoute");
		expect(file?.content).toContain('"/api/seed-blog"');
		expect(file?.content).toContain("GET: async ()");
		expect(file?.content).toContain('import { myStack } from "@/lib/stack"');
		expect(file?.content).toContain("server:");
		expect(file?.content).toContain("handlers:");
	});

	it.each(["nextjs", "react-router", "tanstack"] as const)(
		"keeps every %s seed on its intended trusted operation surface",
		(framework) => {
			const trustSurfaces = [
				["blog", "blog"],
				["kanban", "kanban"],
				["form-builder", "formBuilder"],
				["cms", "cms"],
				["ui-builder", "cms"],
			] as const;

			for (const [plugin, trustSurface] of trustSurfaces) {
				const file = buildSeedRouteFile(plugin, framework);
				expect(file?.content).toContain(`myStack.trusted.${trustSurface}`);
				expect(file?.content).not.toContain("myStack.adapter");
				expect(file?.content).not.toContain("myStack.api");
			}
		},
	);

	it("uses canonical operation names and inputs in generated seed bodies", () => {
		const blog = buildSeedRouteFile("blog", "nextjs")?.content;
		expect(blog).toContain("blog.listPosts({ limit: 1 })");
		expect(blog).toContain("blog.createPost({");

		const kanban = buildSeedRouteFile("kanban", "nextjs")?.content;
		expect(kanban).toContain(
			'kanban.listBoards({ slug: "demo-board", limit: 1 })',
		);
		expect(kanban).toContain("kanban.getBoard({ id:");
		expect(kanban).toContain("kanban.createBoard({");
		expect(kanban).toContain("kanban.createColumn({");
		expect(kanban).toContain("kanban.createTask({");
		expect(kanban).not.toContain("@btst/stack/plugins/kanban/api");

		const formBuilder = buildSeedRouteFile("form-builder", "nextjs")?.content;
		expect(formBuilder).toContain("formBuilder.listForms({ limit: 1 })");
		expect(formBuilder).toContain("formBuilder.createForm({");

		for (const plugin of ["cms", "ui-builder"] as const) {
			const file = buildSeedRouteFile(plugin, "nextjs")?.content;
			expect(file).toContain("cms.listContentItems({");
			expect(file).toContain("cms.createContentItem({");
		}
	});

	// ── buildSeedRouteFiles ──────────────────────────────────────────────────

	it("filters out plugins with no seed body", () => {
		const files = buildSeedRouteFiles(["blog", "ai-chat", "kanban"], "nextjs");
		expect(files).toHaveLength(2);
		expect(files.map((f) => f.path)).not.toContain(
			seedRoutePath("ai-chat", "nextjs"),
		);
	});

	it("returns empty array for an all-no-seed-body list", () => {
		expect(
			buildSeedRouteFiles(["ai-chat", "comments", "media"], "nextjs"),
		).toEqual([]);
	});

	// ── buildSeedRunnerScript ────────────────────────────────────────────────

	it("embeds the correct port", () => {
		const script = buildSeedRunnerScript(["blog"], 3000);
		expect(script).toContain("localhost:3000");
	});

	it("includes all seed paths in SEEDS array", () => {
		const script = buildSeedRunnerScript(["blog", "kanban"], 3000);
		expect(script).toContain('"/api/seed-blog"');
		expect(script).toContain('"/api/seed-kanban"');
	});

	it("omits plugins with no seed body from SEEDS array", () => {
		const script = buildSeedRunnerScript(["blog", "ai-chat"], 3000);
		expect(script).not.toContain('"ai-chat"');
		expect(script).toContain('"/api/seed-blog"');
	});

	it("produces an empty SEEDS array only for plugins that have no seed data", () => {
		const script = buildSeedRunnerScript(["ai-chat", "media"], 5173);
		expect(script).toContain("const SEEDS = []");
	});
});
