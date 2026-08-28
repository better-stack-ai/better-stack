import { describe, it, expect } from "vitest";
import { stack } from "../api";
import { defineBackendPlugin } from "../plugins/api";
import { createDbPlugin } from "@btst/db";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter as Adapter, DatabaseDefinition } from "@btst/db";
import { blogBackendPlugin } from "../plugins/blog/api";
import { kanbanBackendPlugin } from "../plugins/kanban/api";

const testAdapter = (db: DatabaseDefinition): Adapter =>
	createMemoryAdapter(db)({});

/**
 * A minimal plugin with no `api` factory, to verify backward compatibility.
 */
const noApiPlugin = defineBackendPlugin({
	name: "no-api",
	dbPlugin: createDbPlugin("no-api", {}),
	routes: () => ({}),
});

describe("stack.api surface", () => {
	it("exposes adapter on the returned backend", () => {
		const backend = stack({
			basePath: "/api",
			plugins: { blog: blogBackendPlugin() },
			adapter: testAdapter,
		});

		expect(backend.adapter).toBeDefined();
		expect(typeof backend.adapter.findMany).toBe("function");
		expect(typeof backend.adapter.findOne).toBe("function");
		expect(typeof backend.adapter.create).toBe("function");
	});

	it("keeps stack.api narrow for SSG prefetch helpers", () => {
		const backend = stack({
			basePath: "/api",
			plugins: { blog: blogBackendPlugin() },
			adapter: testAdapter,
		});

		expect(backend.api).toBeDefined();
		expect(backend.api.blog).toBeDefined();
		expect(Object.keys(backend.api.blog)).toEqual(["prefetchForRoute"]);
	});

	it("exposes kanban api namespace", () => {
		const backend = stack({
			basePath: "/api",
			plugins: { kanban: kanbanBackendPlugin() },
			adapter: testAdapter,
		});

		expect(backend.api.kanban).toBeDefined();
		expect(Object.keys(backend.api.kanban)).toEqual(["prefetchForRoute"]);
	});

	it("plugins without api factory are not present in api", () => {
		const backend = stack({
			basePath: "/api",
			plugins: { noApi: noApiPlugin },
			adapter: testAdapter,
		});

		expect((backend.api as any).noApi).toBeUndefined();
	});

	it("uses internal operations for explicitly trusted business calls", async () => {
		const backend = stack({
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

		const posts = await backend.internal.blog.listPosts({});
		expect(posts.items).toHaveLength(1);
		expect(posts.items[0]!.slug).toBe("hello-world");
	});

	it("combines multiple plugins in a single stack call", () => {
		const backend = stack({
			basePath: "/api",
			plugins: {
				blog: blogBackendPlugin(),
				kanban: kanbanBackendPlugin(),
			},
			adapter: testAdapter,
		});

		expect(typeof backend.api.blog.prefetchForRoute).toBe("function");
		expect(typeof backend.api.kanban.prefetchForRoute).toBe("function");
	});
});
