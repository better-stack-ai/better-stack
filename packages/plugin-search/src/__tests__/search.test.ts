import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { searchBackendPlugin } from "../api";
import { blogBackendPlugin } from "../../../plugin-blog/src/api/plugin";
import { blogPermissions } from "../../../plugin-blog/src/permissions";
import { cmsBackendPlugin } from "../../../plugin-cms/src/api/plugin";
import { schoolBackendPlugin } from "../../../plugin-school/src/api/plugin";
import { SCHOOL_COURSE_CONTENT_TYPE } from "../../../plugin-school/src/schemas";
import { schoolPermissions } from "../../../plugin-school/src/permissions";
import { ecommerceBackendPlugin } from "../../../plugin-ecommerce/src/api/plugin";
import { PRODUCT_CONTENT_TYPE } from "../../../plugin-ecommerce/src/schemas";
import { ecommercePermissions } from "../../../plugin-ecommerce/src/permissions";
import type {
	SchoolSearchOperations,
	EcommerceSearchOperations,
} from "../providers";

import type { BlogSearchOperations } from "../providers";
import { searchPermissions } from "../permissions";
import {
	blogSearchProvider,
	cmsSearchProvider,
	ecommerceSearchProvider,
	schoolSearchProvider,
} from "../providers";
import type { SearchProvider, SearchProviderResult } from "../types";

const item = (
	resourceId: string,
	title = resourceId,
): SearchProviderResult => ({
	resourceId,
	title,
	snippet: "Public content",
	href: `/records/${resourceId}`,
});
const provider = (
	id: string,
	items: SearchProviderResult[],
): SearchProvider => ({
	id,
	label: id,
	search: async () => ({ items, hasMore: false }),
});
function setup(providers: SearchProvider[] = [], allow = true) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [searchPermissions],
		rules: ({ search }) => [search.query.read.when(() => allow)],
	});
	return createBackendStack({
		basePath: "/api",
		plugins: { search: searchBackendPlugin({ providers }) },
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization,
			getIdentity: (request) =>
				request.headers.get("x-user")
					? { id: request.headers.get("x-user")! }
					: null,
		}),
	});
}
const request = (query = "q=hello", user?: string) =>
	new Request(`https://example.test/api/search?${query}`, {
		headers: user ? { "x-user": user } : undefined,
	});

describe("authorized search aggregation", () => {
	it("installs alone, does not enumerate blank queries, and shares HTTP/request behavior", async () => {
		const search = vi.fn(async () => ({ items: [item("a")], hasMore: false }));
		const stack = setup([{ id: "app", label: "Application", search }]);
		const blank = await stack
			.forRequest(request())
			.operations.search.search({ q: "  " });
		expect(blank.items).toEqual([]);
		expect(search).not.toHaveBeenCalled();
		const http = await stack.handler(request());
		expect(http.status).toBe(200);
		expect(await http.json()).toEqual(
			await stack
				.forRequest(request())
				.operations.search.search({ q: "hello" }),
		);
		expect(
			await setup()
				.forRequest(request())
				.operations.search.search({ q: "hello" }),
		).toMatchObject({ items: [], sources: [], hasMore: false });
	});

	it("passes original request and resolved identity, never client-supplied identity", async () => {
		const search = vi.fn(
			async ({ identity }: Parameters<SearchProvider["search"]>[0]) => ({
				items: identity?.id === "alice" ? [item("alice-private")] : [],
				hasMore: false,
			}),
		);
		const stack = setup([{ id: "app", label: "App", search }]);
		const req = request("q=hello&identity=alice&tags=admin", "bob");
		const response = await stack.handler(req);
		expect(response.status).toBe(200);
		expect((await response.json()).items).toEqual([]);
		expect(search).toHaveBeenLastCalledWith(
			expect.objectContaining({ request: req, identity: { id: "bob" } }),
		);
		expect(
			(
				await stack
					.forRequest(request("q=hello", "alice"))
					.operations.search.search({ q: "hello" })
			).items,
		).toHaveLength(1);
	});

	it("enforces Search permission before executing sources even in fixed-source mode", async () => {
		const search = vi.fn(async () => ({
			items: [item("secret")],
			hasMore: false,
		}));
		const stack = setup([{ id: "app", label: "App", search }], false);
		expect(
			(await stack.handler(request("q=hello&sources=app", "bob"))).status,
		).toBe(403);
		await expect(
			stack
				.forRequest(request())
				.operations.search.search({ q: "hello", sources: ["app"] }),
		).rejects.toThrow();
		expect(search).not.toHaveBeenCalled();
	});

	it("orders by stable source/resource IDs, removes source duplicates, and paginates without totals", async () => {
		const stack = setup([
			provider("zeta", [item("same")]),
			provider("alpha", [
				item("c"),
				item("a"),
				item("a", "duplicate"),
				item("b"),
			]),
		]);
		const page1 = await stack
			.forRequest(request())
			.operations.search.search({ q: "hello", limit: 2 });
		const page2 = await stack
			.forRequest(request())
			.operations.search.search({ q: "hello", limit: 2, page: 2 });
		expect(page1.items.map(({ key }) => key)).toEqual(["alpha:a", "alpha:b"]);
		expect(page1).toMatchObject({ hasMore: true, nextPage: 2 });
		expect(page2.items.map(({ key }) => key)).toEqual(["alpha:c", "zeta:same"]);
		expect(page2).toMatchObject({ hasMore: false, nextPage: null });
		expect(page1).not.toHaveProperty("total");
		const scoped = await stack
			.forRequest(request())
			.operations.search.search({ q: "hello", sources: ["zeta"] });
		expect(scoped.items.map(({ key }) => key)).toEqual(["zeta:same"]);
	});

	it("bounds query, sources, pages, fanout and result windows", async () => {
		const stack = setup([
			provider(
				"app",
				Array.from({ length: 201 }, (_, index) =>
					item(String(index).padStart(3, "0")),
				),
			),
		]);
		for (const query of [
			"q=" + "a".repeat(201),
			"q=x&limit=21",
			"q=x&page=11",
			"q=x&sources=missing",
			"q=x&sources=" + Array(9).fill("app").join(","),
		]) {
			expect((await stack.handler(request(query))).status).toBe(400);
		}
		const final = await stack
			.forRequest(request())
			.operations.search.search({ q: "x", page: 10 });
		expect(final.items).toHaveLength(20);
		expect(final).toMatchObject({
			hasMore: false,
			nextPage: null,
			truncated: true,
		});
		expect(() =>
			setup(Array.from({ length: 9 }, (_, i) => provider(`source-${i}`, []))),
		).toThrow("at most 8");
		expect(() => setup([provider("app", []), provider("app", [])])).toThrow(
			"Duplicate",
		);
	});

	it("fails visibly for unavailable or malformed sources without leaking their errors", async () => {
		const unavailable: SearchProvider = {
			id: "app",
			label: "App",
			search: async () => {
				throw new Error("private record secret");
			},
		};
		const response = await setup([unavailable]).handler(request());
		expect(response.status).toBe(502);
		expect(await response.text()).not.toContain("private record secret");
		for (const href of ["javascript:alert(1)", "//evil.test", "/\\evil.test"]) {
			expect(
				(
					await setup([provider("app", [{ ...item("a"), href }])]).handler(
						request(),
					)
				).status,
			).toBe(502);
		}
		await expect(setup().trusted.search.search({ q: "x" })).rejects.toThrow(
			"requires request context",
		);
	});
});

describe("optional public source adapters", () => {
	it("requests Blog public posts with domain matching, preserving request and normalizing markup", async () => {
		const req = request();
		const listPosts = vi.fn(async () => ({
			items: [
				{
					id: "visible",
					slug: "hello",
					title: "Hello",
					content: "body",
					excerpt: "<b>Public</b> **text**",
					published: true,
				},
				{
					id: "draft",
					slug: "draft",
					title: "Draft",
					content: "secret",
					excerpt: "secret",
					published: false,
				},
			],
			total: 2,
		}));
		const operations = vi.fn(() => ({ listPosts }));
		const result = await blogSearchProvider({ operations }).search({
			q: "hello",
			limit: 201,
			request: req,
			identity: null,
		});
		expect(operations).toHaveBeenCalledWith(req);
		expect(listPosts).toHaveBeenCalledWith({
			query: "hello",
			published: true,
			offset: 0,
			limit: 100,
		});
		expect(result.items).toEqual([
			{
				resourceId: "visible",
				title: "Hello",
				snippet: "Public text",
				href: "/pages/blog/hello",
			},
		]);
	});

	it("uses only published catalog courses and public products, retaining domain filter inputs", async () => {
		const context = {
			q: "hello",
			limit: 201,
			request: request(),
			identity: null,
		};
		const listCourses = vi.fn(async () => ({
			items: [
				{
					id: "c",
					slug: "course",
					title: "Course",
					description: "Public catalog",
					status: "published",
				},
				{
					id: "hidden",
					slug: "draft",
					title: "Secret",
					description: "Hidden",
					status: "draft",
				},
			],
		}));
		const courses = await schoolSearchProvider({
			operations: () => ({ listCourses }),
		}).search(context);
		expect(listCourses).toHaveBeenCalledWith({ query: "hello" });
		expect(courses.items.map(({ resourceId }) => resourceId)).toEqual(["c"]);
		const listProducts = vi.fn(async () => ({
			items: [
				{
					id: "p",
					slug: "product",
					name: "Product",
					description: "Public",
					status: "published",
				},
				{
					id: "hidden",
					slug: "draft",
					name: "Hidden",
					description: "Secret",
					status: "draft",
				},
			],
			total: 2,
		}));
		const products = await ecommerceSearchProvider({
			operations: () => ({ listProducts }),
		}).search(context);
		expect(listProducts).toHaveBeenCalledWith({
			search: "hello",
			limit: 100,
			offset: 0,
		});
		expect(products.items.map(({ resourceId }) => resourceId)).toEqual(["p"]);
	});

	it("requires an explicit CMS public projection and rejects domain-owned content types", async () => {
		const search = vi.fn(async () => ({
			items: [item("public")],
			hasMore: false,
		}));
		const cms = cmsSearchProvider({
			typeSlug: "article",
			label: "Articles",
			search,
		});
		expect(cms.id).toBe("cms-article");
		expect(() =>
			cmsSearchProvider({
				typeSlug: "school-course",
				label: "Courses",
				search,
			}),
		).toThrow("domain projection");
		expect(() =>
			cmsSearchProvider({
				typeSlug: "ecommerce-product",
				label: "Products",
				search,
			}),
		).toThrow("domain projection");
	});
});

describe("Blog operation integration", () => {
	it("keeps drafts out of aggregate and Blog-scoped results and preserves draft administration", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [searchPermissions, blogPermissions],
			rules: ({ search, blog }) => [
				search.query.read.allow(),
				blog.post.read.when(
					({ facts, identity }) =>
						facts.scope === "published" || identity?.id === "admin",
				),
			],
		});
		const stack = createBackendStack({
			basePath: "/api",
			plugins: {
				blog: blogBackendPlugin(),
				search: searchBackendPlugin({
					providers: [
						blogSearchProvider({
							operations: (req): BlogSearchOperations =>
								stack.forRequest(req).operations.blog,
						}),
					],
				}),
			},
			adapter: (db) => createMemoryAdapter(db)({}),
			auth: createServerAuth({
				authorization,
				getIdentity: (req) =>
					req.headers.get("x-user") ? { id: req.headers.get("x-user")! } : null,
			}),
		});
		await stack.trusted.blog.createPost({
			title: "Hello published",
			slug: "public",
			content: "Hello public content",
			excerpt: "Public snippet",
			published: true,
		});
		await stack.trusted.blog.createPost({
			title: "Hello draft secret",
			slug: "secret",
			content: "Hello classified body",
			excerpt: "Secret snippet",
			published: false,
		});
		for (const user of [undefined, "admin"]) {
			for (const sources of [undefined, ["blog"]]) {
				const result = await stack
					.forRequest(request("q=Hello", user))
					.operations.search.search({ q: "Hello", sources });
				expect(result.items.map(({ title }) => title)).toEqual([
					"Hello published",
				]);
				expect(JSON.stringify(result)).not.toContain("secret");
			}
		}
		const drafts = await stack
			.forRequest(request("", "admin"))
			.operations.blog.listPosts({ published: false, query: "Hello" });
		expect(drafts.items.map(({ slug }) => slug)).toEqual(["secret"]);
		await expect(
			stack
				.forRequest(request())
				.operations.blog.listPosts({ published: false, query: "Hello" }),
		).rejects.toThrow();
	});
});

describe("public catalog operation integrations", () => {
	it("excludes draft/archived courses and products and never federates private lesson content", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [searchPermissions, schoolPermissions, ecommercePermissions],
			rules: ({ search, school, ecommerce }) => [
				search.query.read.allow(),
				school.course.read.allow(),
				ecommerce.product.read.allow(),
			],
		});
		const stack = createBackendStack({
			basePath: "/api",
			plugins: {
				cms: cmsBackendPlugin({
					contentTypes: [SCHOOL_COURSE_CONTENT_TYPE, PRODUCT_CONTENT_TYPE],
				}),
				school: schoolBackendPlugin(),
				ecommerce: ecommerceBackendPlugin({
					paymentAdapter: {
						name: "test",
						createPayment: async () => ({}),
						handleWebhook: async () => ({ orderId: "unused", success: true }),
					},
				}),
				search: searchBackendPlugin({
					providers: [
						schoolSearchProvider({
							operations: (req): SchoolSearchOperations =>
								stack.forRequest(req).operations.school,
						}),
						ecommerceSearchProvider({
							operations: (req): EcommerceSearchOperations =>
								stack.forRequest(req).operations.ecommerce,
						}),
					],
				}),
			},
			adapter: (db) => createMemoryAdapter(db)({}),
			auth: createServerAuth({ authorization, getIdentity: () => null }),
		});
		const published = await stack.trusted.school.createCourse({
			title: "Shared public course",
			slug: "course",
			instructorId: "teacher",
			status: "published",
		});
		await stack.trusted.school.createLesson({
			courseId: published.id,
			data: {
				title: "Shared private lesson secret",
				type: "text",
				content: "Private lesson body secret",
				isFreePreview: false,
				order: 0,
			},
		});
		await stack.trusted.ecommerce.createProduct({
			slug: "product",
			data: {
				name: "Shared public product",
				price: 100,
				stock: 1,
				status: "published",
			},
		});
		const before = await stack
			.forRequest(request())
			.operations.search.search({ q: "Shared" });
		for (const status of ["draft", "archived"] as const) {
			await stack.trusted.school.createCourse({
				title: `Shared hidden course ${status}`,
				slug: status,
				instructorId: "teacher",
				status,
			});
			await stack.trusted.ecommerce.createProduct({
				slug: status,
				data: {
					name: `Shared hidden product ${status}`,
					price: 100,
					stock: 1,
					status,
				},
			});
		}
		const after = await stack
			.forRequest(request())
			.operations.search.search({ q: "Shared" });
		expect(after).toEqual(before);
		expect(after.items.map(({ title }) => title).sort()).toEqual([
			"Shared public course",
			"Shared public product",
		]);
		const privateOnly = await stack
			.forRequest(request())
			.operations.search.search({ q: "Private lesson body secret" });
		expect(privateOnly).toMatchObject({
			items: [],
			hasMore: false,
			nextPage: null,
			truncated: false,
		});
		const localCourses = await stack
			.forRequest(request())
			.operations.school.listCourses({ query: "Shared", pricing: "free" });
		expect(localCourses.items.map(({ id }) => id)).toEqual([published.id]);
		const localProducts = await stack
			.forRequest(request())
			.operations.ecommerce.listProducts({ search: "Shared", inStock: true });
		expect(localProducts.items.map(({ name }) => name)).toEqual([
			"Shared public product",
		]);
	});
});
