import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as cms from "@btst/plugin-cms/api";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import * as forms from "@btst/plugin-form-builder/api";
import { formBuilderPermissions } from "@btst/plugin-form-builder/permissions";
import * as jobs from "@btst/plugin-job-board/api";
import * as config from "@btst/plugin-job-board";
import { jobBoardPermissions } from "@btst/plugin-job-board/permissions";
import { jobBoardClientPlugin } from "@btst/plugin-job-board/client";

const require = createRequire(import.meta.url);
assert.equal(jobBoardClientPlugin().id, "jobBoard");
assert.equal(
	require("@btst/plugin-job-board/client").jobBoardClientPlugin().id,
	"jobBoard",
);
assert.throws(() => require.resolve("@btst/plugin-ai-chat/api"), {
	code: "MODULE_NOT_FOUND",
});

// Same isolated-memory seam as the existing Form Builder fixture: preserve the
// adapter's rollback implementation and serialize public calls around it.
function serializedMemory(db) {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	const result = { ...adapter, id: "serialized-memory-test" };
	for (const method of [
		"create",
		"findOne",
		"findMany",
		"count",
		"update",
		"updateMany",
		"delete",
		"deleteMany",
		"consumeOne",
		"transaction",
	]) {
		result[method] = async (input) => {
			let release;
			const previous = tail;
			tail = new Promise((resolve) => {
				release = resolve;
			});
			await previous;
			try {
				return await adapter[method](input);
			} finally {
				release();
			}
		};
	}
	return result;
}

async function verify(api, withForms) {
	const authorization = api.defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [
			api.cmsPermissions,
			api.jobBoardPermissions,
			api.formBuilderPermissions,
		],
		rules: ({ cms, jobBoard, forms }) => [
			cms.contentType.read.when(({ identity }) => identity?.id === "admin"),
			cms.record.read.when(({ identity }) => identity?.id === "admin"),
			cms.record.create.when(({ identity }) => identity?.id === "admin"),
			jobBoard.job.read.when(({ identity }) => identity?.id !== "blocked"),
			forms.form.create.when(({ identity }) => identity?.id === "admin"),
			forms.form.read.when(({ identity }) => identity?.id === "admin"),
			forms.form.render.when(({ facts }) => facts.status === "active"),
			forms.submission.create.when(({ facts }) => facts.status === "active"),
		],
	});
	const auth = api.createServerAuth({
		authorization,
		getIdentity: ({ request }) => {
			const id = request.headers.get("x-user");
			return id ? { id } : null;
		},
	});
	assert.throws(
		() =>
			api.createBackendStack({
				adapter: serializedMemory,
				auth,
				plugins: { jobBoard: api.jobBoardBackendPlugin() },
			}),
		/Job Board requires the CMS backend/,
	);
	if (withForms) {
		const unsafe = api.createBackendStack({
			adapter: (db) => createMemoryAdapter(db)({}),
			auth,
			plugins: { formBuilder: api.formBuilderBackendPlugin() },
		});
		const unsafeForm = await unsafe.trusted.formBuilder.createForm({
			name: "Unsafe",
			slug: "unsafe",
			status: "active",
			schema: JSON.stringify({ type: "object", properties: {} }),
		});
		await assert.rejects(
			unsafe.trusted.formBuilder.submitForm({
				slug: unsafeForm.slug,
				data: {},
			}),
			{ code: "ATOMIC_TRANSACTION_REQUIRED" },
		);
	}
	const stack = api.createBackendStack({
		basePath: "/api",
		adapter: withForms ? serializedMemory : (db) => createMemoryAdapter(db)({}),
		auth,
		plugins: {
			cms: api.cmsBackendPlugin({ contentTypes: [api.JOB_BOARD_CONTENT_TYPE] }),
			jobBoard: api.jobBoardBackendPlugin(),
			...(withForms ? { formBuilder: api.formBuilderBackendPlugin() } : {}),
		},
	});
	const request = (id) =>
		new Request("https://example.test/api", {
			headers: id ? { "x-user": id } : {},
		});
	const admin = stack.forRequest(request("admin")).operations;
	const visitor = stack.forRequest(request()).operations;
	const data = {
		title: "Packed role",
		department: "Engineering",
		location: "London",
		employmentType: "full-time",
		remote: true,
		description: "Build useful software.",
		requirements: "Relevant experience.",
		status: "published",
		closingDate: "2099-02-01",
		applicationFormId: "unregistered-form",
	};
	if (withForms) {
		const form = await admin.formBuilder.createForm({
			name: "Application",
			slug: "application",
			status: "active",
			schema: JSON.stringify({
				type: "object",
				properties: { name: { type: "string", minLength: 1 } },
				required: ["name"],
			}),
		});
		data.applicationFormId = form.id;
		const submission = await visitor.formBuilder.submitForm({
			slug: form.slug,
			data: { name: "Ada" },
		});
		assert.equal(submission.formId, form.id);
		await assert.rejects(visitor.formBuilder.getFormById({ id: form.id }), {
			statusCode: 401,
		});
	}
	const item = await admin.cms.createContentItem({
		typeSlug: "job-posting",
		body: { slug: "packed-role", data },
	});
	await stack.adapter.create({
		model: "contentItem",
		forceAllowId: true,
		data: {
			id: "v5-job-posting",
			contentTypeId: item.contentTypeId,
			slug: "existing-v5-role",
			data: JSON.stringify({ ...data, title: "Existing v5 role" }),
			authorId: "admin",
			createdAt: new Date("2025-01-01T00:00:00Z"),
			updatedAt: new Date("2025-01-01T00:00:00Z"),
		},
	});
	const legacy = await visitor.jobBoard.getJob({ slug: "existing-v5-role" });
	assert.equal(legacy.id, "v5-job-posting");
	assert.equal(legacy.title, "Existing v5 role");
	assert.equal(legacy.closingDate, "2099-02-01");
	assert.equal(
		legacy.applicationFormSlug,
		withForms ? "application" : undefined,
	);
	assert.equal("schema" in legacy, false);
	assert.equal(typeof legacy.createdAt, "string");
	await assert.rejects(
		stack
			.forRequest(request("blocked"))
			.operations.jobBoard.getJob({ slug: "packed-role" }),
		{ statusCode: 403 },
	);
	await assert.rejects(
		visitor.cms.getContentItem({ typeSlug: "job-posting", id: item.id }),
		{ statusCode: 401 },
	);
	await assert.rejects(
		visitor.jobBoard.listJobs({ limit: 0 }),
		(error) => error.name === "ZodError" && error.issues[0].path[0] === "limit",
	);
	await admin.cms.createContentItem({
		typeSlug: "job-posting",
		body: { slug: "private-draft", data: { ...data, status: "draft" } },
	});
	const page = await visitor.jobBoard.listJobs({});
	assert.equal(page.total, 2);
	assert.equal(
		page.items.some((job) => job.slug === "private-draft"),
		false,
	);
	const cache = new QueryClient();
	await stack.raw.jobBoard.prefetchForRoute("detail", cache, {
		slug: "packed-role",
	});
	assert.equal(
		cache.getQueryData(api.JOB_BOARD_QUERY_KEYS.detail("packed-role")).id,
		item.id,
	);
	await stack.raw.jobBoard.prefetchForRoute("department", cache, {
		dept: "Engineering",
	});
	assert.equal(
		cache.getQueryData(
			api.JOB_BOARD_QUERY_KEYS.list({ department: "Engineering" }),
		).pages[0].total,
		2,
	);
	const restored = api.createBackendStack({
		basePath: "/api",
		adapter: () => stack.adapter,
		auth,
		plugins: {
			cms: api.cmsBackendPlugin({ contentTypes: [api.JOB_BOARD_CONTENT_TYPE] }),
			jobBoard: api.jobBoardBackendPlugin(),
			...(withForms ? { formBuilder: api.formBuilderBackendPlugin() } : {}),
		},
	});
	assert.equal(
		(await restored.trusted.jobBoard.getJob({ slug: "existing-v5-role" })).id,
		"v5-job-posting",
	);
}

const esm = {
	...core,
	...auth,
	...server,
	...cms,
	...forms,
	...jobs,
	...config,
	cmsPermissions,
	formBuilderPermissions,
	jobBoardPermissions,
};
const cjs = Object.assign(
	{},
	...[
		"@btst/stack/api",
		"@btst/stack/authorization",
		"@btst/stack/authorization/server",
		"@btst/plugin-cms/api",
		"@btst/plugin-cms/permissions",
		"@btst/plugin-form-builder/api",
		"@btst/plugin-form-builder/permissions",
		"@btst/plugin-job-board/api",
		"@btst/plugin-job-board",
		"@btst/plugin-job-board/permissions",
	].map((name) => require(name)),
);
for (const api of [esm, cjs])
	for (const withForms of [false, true]) await verify(api, withForms);
console.log(
	"Packed Job Board ESM/CJS CMS data, optional forms, authorization, validation and SSG passed",
);
