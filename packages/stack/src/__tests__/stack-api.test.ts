import { describe, it, expect } from "vitest";
import { createBackendStack } from "../api";
import { defineBackendPlugin } from "../plugins/api";
import { createDbPlugin } from "@btst/db";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter as Adapter, DatabaseDefinition } from "@btst/db";
import { blogBackendPlugin } from "../plugins/blog/api";
import { kanbanBackendPlugin } from "../plugins/kanban/api";

const testAdapter = (db: DatabaseDefinition): Adapter =>
	createMemoryAdapter(db)({});

/**
 * A minimal plugin with no `raw` factory.
 */
const noRawPlugin = defineBackendPlugin({
	id: "noRaw",
	dbPlugin: createDbPlugin("no-raw", {}),
	routes: () => ({}),
});

describe("stack.raw surface", () => {
	it("exposes adapter on the returned backend", () => {
		const backend = createBackendStack({
			basePath: "/api",
			plugins: { blog: blogBackendPlugin() },
			adapter: testAdapter,
		});

		expect(backend.adapter).toBeDefined();
		expect(typeof backend.adapter.findMany).toBe("function");
		expect(typeof backend.adapter.findOne).toBe("function");
		expect(typeof backend.adapter.create).toBe("function");
	});

	it("keeps stack.raw narrow for SSG prefetch helpers", () => {
		const backend = createBackendStack({
			basePath: "/api",
			plugins: { blog: blogBackendPlugin() },
			adapter: testAdapter,
		});

		expect(backend.raw).toBeDefined();
		expect(backend.raw.blog).toBeDefined();
		expect(Object.keys(backend.raw.blog)).toEqual(["prefetchForRoute"]);
	});

	it("exposes the Kanban raw namespace", () => {
		const backend = createBackendStack({
			basePath: "/api",
			plugins: { kanban: kanbanBackendPlugin() },
			adapter: testAdapter,
		});

		expect(backend.raw.kanban).toBeDefined();
		expect(Object.keys(backend.raw.kanban)).toEqual(["prefetchForRoute"]);
	});

	it("omits plugins without a raw factory", () => {
		const backend = createBackendStack({
			basePath: "/api",
			plugins: { noRaw: noRawPlugin },
			adapter: testAdapter,
		});

		expect((backend.raw as any).noRaw).toBeUndefined();
	});

	it("uses trusted operations for explicitly trusted business calls", async () => {
		const backend = createBackendStack({
			basePath: "/api",
			plugins: { blog: blogBackendPlugin() },
			adapter: testAdapter,
		});

		// Seed data via adapter directly
		await backend.adapter.create({
			model: "post",
			data: {
				title: "Hello World",
				slug: "hello-world",
				content: "Content",
				excerpt: "",
				published: true,
				tags: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const posts = await backend.trusted.blog.listPosts({});
		expect(posts.items).toHaveLength(1);
		expect(posts.items[0]!.slug).toBe("hello-world");
	});

	it("does not retain ambiguous server aliases", () => {
		const backend = createBackendStack({
			basePath: "/api",
			plugins: { blog: blogBackendPlugin() },
			adapter: testAdapter,
		});
		const request = backend.forRequest(new Request("https://example.test/api"));

		expect("api" in backend).toBe(false);
		expect("internal" in backend).toBe(false);
		expect("api" in request).toBe(false);
		expect(Object.keys(request)).toEqual(["operations"]);
	});

	it("combines multiple plugins in a single stack call", () => {
		const backend = createBackendStack({
			basePath: "/api",
			plugins: {
				blog: blogBackendPlugin(),
				kanban: kanbanBackendPlugin(),
			},
			adapter: testAdapter,
		});

		expect(typeof backend.raw.blog.prefetchForRoute).toBe("function");
		expect(typeof backend.raw.kanban.prefetchForRoute).toBe("function");
	});
});
