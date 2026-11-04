import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import {
	formBuilderBackendPlugin,
	FORM_QUERY_KEYS,
} from "@btst/plugin-form-builder/api";
import { formBuilderClientPlugin } from "@btst/plugin-form-builder/client";
import { formBuilderPermissions } from "@btst/plugin-form-builder/permissions";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

const require = createRequire(import.meta.url);
assert.equal(formBuilderClientPlugin().id, "formBuilder");
assert.equal(
	require("@btst/plugin-form-builder/client").formBuilderClientPlugin().id,
	"formBuilder",
);
assert.throws(() => require.resolve("@btst/plugin-ai-chat/api"), {
	code: "MODULE_NOT_FOUND",
});

// Match the existing isolated-memory test adapter: every public call shares the
// transaction queue, while the adapter's own transaction retains rollback.
function serializedMemoryAdapter(db) {
	const adapter = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	async function withLock(run) {
		let release;
		const previous = tail;
		tail = new Promise((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	}
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
		result[method] = (input) => withLock(() => adapter[method](input));
	}
	return result;
}

async function verifyOperations({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	formBuilderBackendPlugin,
	formBuilderPermissions,
	FORM_QUERY_KEYS,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [formBuilderPermissions],
		rules: ({ forms }) => [
			forms.form.create.when(({ identity }) => identity !== null),
			forms.form.read.when(
				({ identity, facts }) => identity?.id === facts.ownerId,
			),
			forms.form.render.allow(),
			forms.submission.create.allow(),
			forms.submission.read.when(
				({ identity, facts }) => identity?.id === facts.ownerId,
			),
		],
	});
	const auth = createServerAuth({
		authorization,
		getIdentity: ({ request }) => {
			const id = request.headers.get("x-owner");
			return id ? { id } : null;
		},
	});
	const schema = JSON.stringify({
		type: "object",
		properties: { name: { type: "string", minLength: 1 } },
		required: ["name"],
	});
	const unsafe = createBackendStack({
		basePath: "/api",
		plugins: { formBuilder: formBuilderBackendPlugin() },
		adapter: (db) => createMemoryAdapter(db)({}),
		auth,
	});
	const unsafeForm = await unsafe.trusted.formBuilder.createForm({
		name: "Unsafe",
		slug: "unsafe",
		schema,
	});
	await assert.rejects(
		unsafe.trusted.formBuilder.submitForm({
			slug: unsafeForm.slug,
			data: { name: "Ada" },
		}),
		{ code: "ATOMIC_TRANSACTION_REQUIRED" },
	);
	const stack = createBackendStack({
		basePath: "/api",
		plugins: { formBuilder: formBuilderBackendPlugin() },
		adapter: serializedMemoryAdapter,
		auth,
	});
	const request = (id) =>
		new Request("https://example.test/api", {
			headers: id ? { "x-owner": id } : {},
		});
	const owner = stack.forRequest(request("owner")).operations.formBuilder;
	await stack.adapter.create({
		model: "form",
		forceAllowId: true,
		data: {
			id: "existing-form",
			name: "Existing v5 form",
			slug: "existing-form",
			schema,
			status: "active",
			createdBy: "owner",
			createdAt: new Date("2026-01-01T00:00:00Z"),
			updatedAt: new Date("2026-01-01T00:00:00Z"),
		},
	});
	assert.equal(
		(await owner.getFormById({ id: "existing-form" })).name,
		"Existing v5 form",
	);
	const form = await owner.createForm({
		name: "Packed contact",
		slug: "packed-contact",
		schema,
		successMessage: "Packed submission accepted",
	});
	const anonymous = stack.forRequest(request()).operations.formBuilder;
	await assert.rejects(anonymous.submitForm({ slug: form.slug, data: {} }), {
		code: "SUBMISSION_VALIDATION_FAILED",
	});
	const submission = await anonymous.submitForm({
		slug: form.slug,
		data: { name: "Ada" },
	});
	assert.equal(submission.formId, form.id);
	assert.deepEqual(JSON.parse(submission.data), { name: "Ada" });
	const list = await owner.listSubmissions({ formId: form.id, query: {} });
	assert.equal(list.total, 1);
	assert.equal(list.items[0].id, submission.id);
	assert.equal("data" in list.items[0], false);
	await assert.rejects(
		stack
			.forRequest(request("other"))
			.operations.formBuilder.getFormById({ id: form.id }),
		{ statusCode: 403 },
	);
	await assert.rejects(
		owner.createForm({ name: "", slug: "invalid", schema }),
		/Name is required/,
	);
	const queryClient = new QueryClient();
	await stack.raw.formBuilder.prefetchForRoute("editForm", queryClient, {
		id: form.id,
	});
	assert.equal(
		queryClient.getQueryData(FORM_QUERY_KEYS.formForUpdate(form.id)).id,
		form.id,
	);
	await stack.raw.formBuilder.prefetchForRoute("submissions", queryClient, {
		id: form.id,
	});
	const prefetched = queryClient.getQueryData(
		FORM_QUERY_KEYS.submissionsList({ formId: form.id, limit: 20, offset: 0 }),
	);
	assert.equal(prefetched.pages[0].total, 1);
	assert.equal("data" in prefetched.pages[0].items[0], false);
}

await verifyOperations({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	formBuilderBackendPlugin,
	formBuilderPermissions,
	FORM_QUERY_KEYS,
});
await verifyOperations({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-form-builder/api"),
	...require("@btst/plugin-form-builder/permissions"),
});
console.log(
	"Packed Form Builder ESM/CJS forms, submissions, authorization, isolated adapters, existing data and SSG passed",
);
