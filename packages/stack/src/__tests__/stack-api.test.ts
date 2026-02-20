import { describe, it, expect } from "vitest";
import { stack } from "../api";
import { defineBackendPlugin } from "../plugins/api";
import { createDbPlugin } from "@btst/db";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { Adapter, DatabaseDefinition } from "@btst/db";
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

	it("exposes typed api namespace for plugins with api factory", () => {
		const backend = stack({
			basePath: "/api",
			plugins: { blog: blogBackendPlugin() },
			adapter: testAdapter,
		});

		expect(backend.api).toBeDefined();
		expect(backend.api.blog).toBeDefined();
		expect(typeof backend.api.blog.getAllPosts).toBe("function");
		expect(typeof backend.api.blog.getPostBySlug).toBe("function");
		expect(typeof backend.api.blog.getAllTags).toBe("function");
	});

	it("exposes kanban api namespace", () => {
		const backend = stack({
			basePath: "/api",
			plugins: { kanban: kanbanBackendPlugin() },
			adapter: testAdapter,
		});

		expect(backend.api.kanban).toBeDefined();
		expect(typeof backend.api.kanban.getAllBoards).toBe("function");
		expect(typeof backend.api.kanban.getBoardById).toBe("function");
	});

	it("plugins without api factory are not present in api", () => {
		const backend = stack({
			basePath: "/api",
			plugins: { noApi: noApiPlugin },
			adapter: testAdapter,
		});

		expect((backend.api as any).noApi).toBeUndefined();
	});

	it("api functions are bound to the shared adapter and return real data", async () => {
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

		// Retrieve via stack.api
		const posts = await backend.api.blog.getAllPosts();
		expect(posts.items).toHaveLength(1);
		expect(posts.items[0]!.slug).toBe("hello-world");

		// Verify same adapter - data is shared
		const bySlug = await backend.api.blog.getPostBySlug("hello-world");
		expect(bySlug).not.toBeNull();
		expect(bySlug!.title).toBe("Hello World");
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

		expect(typeof backend.api.blog.getAllPosts).toBe("function");
		expect(typeof backend.api.kanban.getAllBoards).toBe("function");
	});
});
