import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import {
	QueryClient,
	useInfiniteQuery,
	useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { cmsBackendPlugin } from "@btst/plugin-cms/api";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import { formBuilderBackendPlugin } from "@btst/plugin-form-builder/api";
import { formBuilderPermissions } from "@btst/plugin-form-builder/permissions";
import { JOB_BOARD_CONTENT_TYPE } from "../schemas";
import {
	archiveExpiredJobs,
	getAllJobs,
	getStoredJobItems,
	jobBoardBackendPlugin,
} from "../api";
import { jobBoardPermissions } from "../permissions";
import { createJobBoardQueryKeys } from "../query-keys";
import type { Job, JobsPage } from "../types";
import { useJobs, useSuspenseJobs } from "../client/hooks";

vi.mock("@tanstack/react-query", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-query")>()),
	useInfiniteQuery: vi.fn(() => ({ error: null, isFetching: false })),
	useSuspenseInfiniteQuery: vi.fn(() => ({ error: null, isFetching: false })),
}));
vi.mock("@btst/stack/context", async (importOriginal) => ({
	...(await importOriginal<typeof import("@btst/stack/context")>()),
	useStack: () => ({
		api: { baseURL: "http://localhost", basePath: "/api/data" },
		plugins: {
			jobBoard: {
				api: {
					baseURL: "http://localhost",
					basePath: "/api/data",
					browserHeaders: { "x-job-tenant": "base", "x-job-base": "retained" },
					credentials: "include",
				},
			},
		},
	}),
	usePluginOverrides: () => ({ headers: { "x-job-tenant": "override" } }),
}));
vi.mock("@btst/plugin-job-board/query-keys", () => import("../query-keys"));

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [
		cmsPermissions,
		jobBoardPermissions,
		formBuilderPermissions,
	] as const,
	rules: ({ cms, jobBoard, forms }) => [
		cms.contentType.read.when(({ identity }) => identity?.id === "admin"),
		cms.record.read.when(({ identity }) => identity?.id === "admin"),
		cms.record.create.when(({ identity }) => identity?.id === "admin"),
		cms.record.update.when(({ identity }) => identity?.id === "admin"),
		cms.record.delete.when(({ identity }) => identity?.id === "admin"),
		jobBoard.job.read.allow(),
		forms.form.create.when(({ identity }) => identity?.id === "admin"),
		forms.form.read.when(({ identity }) => identity?.id === "admin"),
		forms.form.update.when(({ identity }) => identity?.id === "admin"),
		forms.form.delete.when(({ identity }) => identity?.id === "admin"),
		forms.form.render.when(({ facts }) => facts.status === "active"),
		forms.submission.create.when(({ facts }) => facts.status === "active"),
	],
});

function setup(withForms = false) {
	let adapter!: DBAdapter;
	const shared = {
		basePath: "/api/data",
		adapter: (db: Parameters<typeof createMemoryAdapter>[0]) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
		auth: createServerAuth({
			authorization,
			getIdentity: ({ request }) => {
				const id =
					request.headers.get("x-user") ??
					(request.headers.has("x-admin") ? "admin" : null);
				return id ? { id } : null;
			},
		}),
	};
	const plugins = {
		cms: cmsBackendPlugin({ contentTypes: [JOB_BOARD_CONTENT_TYPE] }),
		jobBoard: jobBoardBackendPlugin(),
	};
	const stack = withForms
		? createBackendStack({
				...shared,
				plugins: { ...plugins, formBuilder: formBuilderBackendPlugin() },
			})
		: createBackendStack({ ...shared, plugins });
	async function request(
		path: string,
		method = "GET",
		body?: unknown,
		admin = false,
	) {
		return stack.handler(
			new Request(`http://localhost/api/data${path}`, {
				method,
				headers: {
					...(admin ? { "x-admin": "true" } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	}
	async function create(slug: string, data: Record<string, unknown> = {}) {
		const response = await request(
			"/content/job-posting",
			"POST",
			{
				slug,
				data: {
					title: slug,
					department: "Engineering",
					location: "London",
					employmentType: "full-time",
					remote: false,
					description: "Build useful software.",
					requirements: "Relevant experience.",
					status: "published",
					...data,
				},
			},
			true,
		);
		expect(response.status).toBe(200);
		return await response.json();
	}
	return {
		stack,
		request,
		create,
		get adapter() {
			return adapter;
		},
	};
}

describe("Job Board public API and SSG", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2030-01-10T12:00:00Z"));
	});
	afterEach(() => vi.useRealTimers());

	it("keeps CMS management private while published jobs follow its draft/publish/archive lifecycle", async () => {
		const { request, create, stack } = setup();
		const draft = await create("draft-job", { status: "draft" });
		expect((await request("/content/job-posting")).status).toBe(401);
		expect(
			(
				await stack.handler(
					new Request("http://localhost/api/data/content/job-posting", {
						headers: { "x-user": "reader" },
					}),
				)
			).status,
		).toBe(403);
		expect((await request("/jobs/draft-job")).status).toBe(404);
		expect((await (await request("/jobs")).json()).items).toEqual([]);
		const publish = await request(
			`/content/job-posting/${draft.id}`,
			"PUT",
			{ data: { status: "published" } },
			true,
		);
		expect(publish.status).toBe(200);
		expect(await (await request("/jobs/draft-job")).json()).toMatchObject({
			slug: "draft-job",
			status: "published",
		});
		const archive = await request(
			`/content/job-posting/${draft.id}`,
			"PUT",
			{ data: { status: "archived" } },
			true,
		);
		expect(archive.status).toBe(200);
		expect((await request("/jobs/draft-job")).status).toBe(404);
	});

	it("filters before pagination and derives taxonomy terms only from open jobs", async () => {
		const { request, create } = setup();
		await create("engineer-one", { remote: true });
		await create("engineer-two", { remote: true });
		await create("designer", {
			department: "Design",
			location: "Berlin",
			employmentType: "contract",
		});
		await create("secret-role", {
			status: "draft",
			department: "Secret department",
			location: "Secret location",
		});
		await create("closed-role", {
			closingDate: "2030-01-09",
			department: "Closed department",
		});
		const first = (await (
			await request(
				"/jobs?department=engineering&remote=true&employmentType=full-time&limit=1",
			)
		).json()) as JobsPage;
		expect(first.total).toBe(2);
		expect(first.items).toHaveLength(1);
		const second = (await (
			await request(
				"/jobs?department=engineering&remote=true&employmentType=full-time&limit=1&offset=1",
			)
		).json()) as JobsPage;
		expect(second.items).toHaveLength(1);
		expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
		expect(first.taxonomies).toEqual({
			departments: ["Design", "Engineering"],
			locations: ["Berlin", "London"],
			employmentTypes: ["contract", "full-time"],
		});
		expect(await (await request("/jobs/taxonomies")).json()).toEqual(
			first.taxonomies,
		);
		expect(
			(
				await (await request("/jobs?location=berlin&remote=false")).json()
			).items.map((job: Job) => job.slug),
		).toEqual(["designer"]);
		expect((await request("/jobs?remote=maybe")).status).toBe(400);
		expect((await request("/jobs?limit=101")).status).toBe(400);
		expect(JSON.stringify(first)).not.toMatch(
			/authorId|jsonSchema|Secret department|closed-role/,
		);
	});

	it("includes the full closing day, lazily archives expired postings, and permits clearing a CMS deadline", async () => {
		const { request, create } = setup();
		const closingToday = await create("closing-today", {
			closingDate: "2030-01-10",
		});
		const expired = await create("expired", { closingDate: "2030-01-09" });
		const draft = await create("expired-draft", {
			closingDate: "2030-01-09",
			status: "draft",
		});
		expect((await request("/jobs/closing-today")).status).toBe(200);
		expect((await request("/jobs/expired")).status).toBe(404);
		expect(
			(
				await (
					await request(
						`/content/job-posting/${expired.id}`,
						"GET",
						undefined,
						true,
					)
				).json()
			).parsedData.status,
		).toBe("archived");
		expect(
			(
				await (
					await request(
						`/content/job-posting/${draft.id}`,
						"GET",
						undefined,
						true,
					)
				).json()
			).parsedData.status,
		).toBe("draft");
		expect(
			(
				await request(
					`/content/job-posting/${closingToday.id}`,
					"PUT",
					{ data: { closingDate: null } },
					true,
				)
			).status,
		).toBe(200);
		vi.setSystemTime(new Date("2030-01-11T00:00:00Z"));
		expect(await (await request("/jobs/closing-today")).json()).toMatchObject({
			status: "published",
			closingDate: null,
		});
	});

	it("does not overwrite a concurrent CMS deadline extension when archival uses an older snapshot", async () => {
		const ctx = setup();
		const job = await ctx.create("extended", { closingDate: "2030-01-09" });
		const snapshot = await getStoredJobItems(ctx.adapter);
		expect(
			(
				await ctx.request(
					`/content/job-posting/${job.id}`,
					"PUT",
					{ data: { closingDate: "2030-02-01" } },
					true,
				)
			).status,
		).toBe(200);
		expect(await archiveExpiredJobs(ctx.adapter, snapshot)).toBe(0);
		expect(await (await ctx.request("/jobs/extended")).json()).toMatchObject({
			status: "published",
			closingDate: "2030-02-01",
		});
	});

	it("resolves only active application forms and also works without Form Builder registered", async () => {
		const withoutForms = setup();
		await withoutForms.create("no-form-backend", {
			applicationFormId: "unregistered-form",
		});
		expect(
			await (await withoutForms.request("/jobs/no-form-backend")).json(),
		).not.toHaveProperty("applicationFormSlug");
		const ctx = setup(true);
		const formResponse = await ctx.request(
			"/forms",
			"POST",
			{
				name: "Application",
				slug: "job-application",
				schema: JSON.stringify({
					type: "object",
					properties: { email: { type: "string" } },
				}),
				status: "active",
			},
			true,
		);
		expect(formResponse.status).toBe(200);
		const form = await formResponse.json();
		const posting = await ctx.create("with-form", {
			applicationFormId: form.id,
		});
		const job = await (await ctx.request("/jobs/with-form")).json();
		expect(job.applicationFormSlug).toBe("job-application");
		expect(job).not.toHaveProperty("schema");
		expect((await ctx.request("/forms/id/" + form.id)).status).toBe(401);
		const inactiveResponse = await ctx.request(
			"/forms",
			"POST",
			{
				name: "Inactive application",
				slug: "inactive-application",
				schema: form.schema,
				status: "inactive",
			},
			true,
		);
		expect(inactiveResponse.status).toBe(200);
		const inactive = await inactiveResponse.json();
		const update = await ctx.request(
			`/content/job-posting/${posting.id}`,
			"PUT",
			{ data: { applicationFormId: inactive.id } },
			true,
		);
		expect(update.status).toBe(200);
		expect(
			await (await ctx.request("/jobs/with-form")).json(),
		).not.toHaveProperty("applicationFormSlug");
	});

	it("shares list, department and detail SSG caches with the public resource factory", async () => {
		const ctx = setup();
		await ctx.create("engineer");
		await ctx.create("designer", { department: "Design" });
		await ctx.create("draft", { status: "draft" });
		const queryClient = new QueryClient();
		const queries = createJobBoardQueryKeys(async () => ({ data: null }));
		await ctx.stack.raw.jobBoard.prefetchForRoute("list", queryClient);
		const all = queryClient.getQueryData<{
			pages: JobsPage[];
			pageParams: number[];
		}>(queries.jobBoardJobs.list().queryKey);
		expect(all?.pages[0]?.total).toBe(2);
		expect(all?.pageParams).toEqual([0]);
		await ctx.stack.raw.jobBoard.prefetchForRoute("department", queryClient, {
			dept: "Engineering",
		});
		const department = queryClient.getQueryData<{ pages: JobsPage[] }>(
			queries.jobBoardJobs.list({ department: "engineering" }).queryKey,
		);
		expect(department?.pages[0]?.items.map((job) => job.slug)).toEqual([
			"engineer",
		]);
		await ctx.stack.raw.jobBoard.prefetchForRoute("detail", queryClient, {
			slug: "engineer",
		});
		expect(
			queryClient.getQueryData<Job>(
				queries.jobBoardJobs.detail("engineer").queryKey,
			)?.title,
		).toBe("engineer");
		await expect(
			ctx.stack.raw.jobBoard.prefetchForRoute("detail", queryClient, {
				slug: "draft",
			}),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(
			(await ctx.stack.trusted.jobBoard.getAllJobs({}))
				.map((job) => job.slug)
				.sort(),
		).toEqual(["designer", "engineer"]);
		expect(
			(await getAllJobs(ctx.adapter)).map((job) => job.slug).sort(),
		).toEqual(["designer", "engineer"]);
		queryClient.clear();
	});

	it("keeps both public hooks and direct HTTP pagination aligned with raw SSG at a nonzero initial offset", async () => {
		const ctx = setup();
		await ctx.create("first");
		await ctx.create("second");
		await ctx.create("third");
		const fetch = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation((input, init) => {
				const request = new Request(input, init);
				expect(request.headers.get("x-job-tenant")).toBe("override");
				expect(request.headers.get("x-job-base")).toBe("retained");
				expect(request.credentials).toBe("include");
				return ctx.stack.handler(request);
			});
		const filters = { offset: 1, limit: 1 };
		const rawClient = new QueryClient();
		const queries = createJobBoardQueryKeys(async () => ({ data: null }));
		await ctx.stack.raw.jobBoard.prefetchForRoute("list", rawClient, filters);
		const expected = rawClient.getQueryData<{
			pages: JobsPage[];
			pageParams: number[];
		}>(queries.jobBoardJobs.list(filters).queryKey)!;
		useJobs(filters);
		useSuspenseJobs(filters);
		type ListOptions = ReturnType<typeof queries.jobBoardJobs.list>;
		const options = [
			vi.mocked(useInfiniteQuery).mock.calls.at(-1)![0] as ListOptions,
			vi.mocked(useSuspenseInfiniteQuery).mock.calls.at(-1)![0] as ListOptions,
		];
		const clients: QueryClient[] = [rawClient];
		try {
			for (const query of options) {
				const client = new QueryClient();
				clients.push(client);
				expect(query.initialPageParam).toBe(1);
				expect(await client.fetchInfiniteQuery(query)).toEqual(expected);
				expect(await query.queryFn()).toEqual(expected.pages[0]);
				const nextOffset = query.getNextPageParam(expected.pages[0]!);
				expect(nextOffset).toBe(2);
				await ctx.stack.raw.jobBoard.prefetchForRoute("list", rawClient, {
					...filters,
					offset: nextOffset,
				});
				const next = rawClient.getQueryData<{ pages: JobsPage[] }>(
					queries.jobBoardJobs.list({ ...filters, offset: nextOffset })
						.queryKey,
				)!;
				expect(await query.queryFn({ pageParam: nextOffset })).toEqual(
					next.pages[0],
				);
			}
		} finally {
			fetch.mockRestore();
			clients.forEach((client) => client.clear());
		}
	});

	it("scans beyond the CMS page size before applying public filters", async () => {
		const ctx = setup();
		await ctx.create("old-open-job");
		const types = await (
			await ctx.request("/content-types", "GET", undefined, true)
		).json();
		const contentTypeId = types.find(
			(type: { slug: string }) => type.slug === "job-posting",
		).id;
		await Promise.all(
			Array.from({ length: 501 }, (_, index) =>
				ctx.adapter.create({
					model: "contentItem",
					data: {
						contentTypeId,
						slug: `draft-${index}`,
						data: JSON.stringify({
							title: "Private",
							department: "Secret",
							location: "Secret",
							employmentType: "full-time",
							remote: false,
							description: "Private",
							requirements: "Private",
							status: "draft",
						}),
						createdAt: new Date("2030-01-11T00:00:00Z"),
						updatedAt: new Date("2030-01-11T00:00:00Z"),
					},
				}),
			),
		);
		const page = (await (await ctx.request("/jobs")).json()) as JobsPage;
		expect(page.items.map((job) => job.slug)).toEqual(["old-open-job"]);
		expect(page.total).toBe(1);
		expect(page.taxonomies.departments).toEqual(["Engineering"]);
	});
});
