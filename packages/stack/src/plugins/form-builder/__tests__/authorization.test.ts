import { createMemoryAdapter } from "@btst/adapter-memory";
import { type DBAdapter, defineDb, type DatabaseDefinition } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import type { StackServerAuthProvider } from "../../../shared/auth-types";
import { FORM_QUERY_KEYS, formBuilderBackendPlugin } from "../api";
import { formBuilderPermissions } from "../permissions";
import type { Form, FormBuilderBackendHooks, FormSubmission } from "../types";

const rawMemoryAdapter = (db: DatabaseDefinition) =>
	createMemoryAdapter(db)({});

/**
 * The published memory adapter rolls back by restoring its whole shared data
 * structure and does not isolate concurrent calls. Wrap every public adapter
 * call in the same queue so mutation tests exercise real transaction isolation.
 */
function serializedMemoryAdapter(db: DatabaseDefinition): DBAdapter {
	const adapter = rawMemoryAdapter(db);
	let tail = Promise.resolve();

	const withLock = async <T>(run: () => Promise<T>): Promise<T> => {
		let release = () => {};
		const previous = tail;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	};

	return {
		...adapter,
		id: "serialized-memory-test",
		create: ((input) =>
			withLock(() => adapter.create(input))) as DBAdapter["create"],
		findOne: ((input) =>
			withLock(() => adapter.findOne(input))) as DBAdapter["findOne"],
		findMany: ((input) =>
			withLock(() => adapter.findMany(input))) as DBAdapter["findMany"],
		count: (input) => withLock(() => adapter.count(input)),
		update: ((input) =>
			withLock(() => adapter.update(input))) as DBAdapter["update"],
		updateMany: (input) => withLock(() => adapter.updateMany(input)),
		delete: ((input) =>
			withLock(() => adapter.delete(input))) as DBAdapter["delete"],
		deleteMany: (input) => withLock(() => adapter.deleteMany(input)),
		consumeOne: ((input) =>
			withLock(() => adapter.consumeOne(input))) as DBAdapter["consumeOne"],
		transaction: ((callback) =>
			withLock(() =>
				adapter.transaction(callback),
			)) as DBAdapter["transaction"],
	};
}

const memoryAdapter = serializedMemoryAdapter;

describe("Form Builder authorization inventory", () => {
	it("covers every maintained HTTP and programmatic operation with a stable descriptor", () => {
		const plugin = formBuilderBackendPlugin();
		const adapter = memoryAdapter(defineDb({}).use(plugin.dbPlugin));
		const operations = plugin.operations?.(adapter);

		expect(Object.keys(operations ?? {}).sort()).toEqual([
			"createForm",
			"deleteForm",
			"deleteSubmission",
			"getFormById",
			"getFormBySlug",
			"getFormForUpdate",
			"getSubmission",
			"listForms",
			"listSubmissions",
			"submitForm",
			"updateForm",
		]);
		expect(
			Object.fromEntries(
				Object.entries(operations ?? {}).map(([key, operation]) => [
					key,
					operation.permission.id,
				]),
			),
		).toEqual({
			listForms: "forms:form.read",
			getFormBySlug: "forms:form.render",
			getFormById: "forms:form.read",
			getFormForUpdate: "forms:form.update",
			createForm: "forms:form.create",
			updateForm: "forms:form.update",
			deleteForm: "forms:form.delete",
			submitForm: "forms:submission.create",
			listSubmissions: "forms:submission.read",
			getSubmission: "forms:submission.read",
			deleteSubmission: "forms:submission.delete",
		});
		expect(
			formBuilderPermissions.form.read({ scope: "collection" }),
		).toMatchObject({ id: "forms:form.read" });
		expect(formBuilderPermissions.form.create()).toMatchObject({
			id: "forms:form.create",
		});
		expect(
			formBuilderPermissions.submission.delete({
				formId: "form-1",
				submissionId: "submission-1",
				exists: true,
			}),
		).toMatchObject({ id: "forms:submission.delete" });
		expect(() =>
			formBuilderPermissions.form.update({
				formId: "form-1",
				// @ts-expect-error Form update facts require the catalog's status vocabulary.
				status: "draft",
			}),
		).toThrow();
		expect(() =>
			// @ts-expect-error Submission delete facts must explicitly declare existence.
			formBuilderPermissions.submission.delete({
				formId: "form-1",
				submissionId: "submission-1",
			}),
		).toThrow();
	});
});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [formBuilderPermissions] as const,
	rules: ({ forms }) => [
		forms.form.read.when(
			({ identity, facts }) =>
				identity?.role === "admin" ||
				(facts.scope === "record" && identity?.id === facts.ownerId),
		),
		forms.form.render.allow(),
		forms.form.create.when(({ identity }) => identity?.role === "admin"),
		forms.form.update.when(
			({ identity, facts }) =>
				identity?.role === "admin" || identity?.id === facts.ownerId,
		),
		forms.form.delete.when(
			({ identity, facts }) =>
				identity?.role === "admin" || identity?.id === facts.ownerId,
		),
		forms.submission.create.allow(),
		forms.submission.read.when(
			({ identity, facts }) =>
				identity?.role === "admin" ||
				identity?.id === facts.ownerId ||
				(facts.scope === "record" && identity?.id === facts.submittedBy),
		),
		forms.submission.delete.when(
			({ identity, facts }) =>
				identity?.role === "admin" ||
				identity?.id === facts.ownerId ||
				identity?.id === facts.submittedBy,
		),
	],
});

type Identity = { id: string; role: "user" | "admin" };

function createAuth(
	getIdentity: (
		request: Request,
	) => Identity | null | Promise<Identity | null> = (request) => {
		const id = request.headers.get("x-user-id");
		const role = request.headers.get("x-user-role");
		if (!id || (role !== "user" && role !== "admin")) return null;
		return { id, role };
	},
	definition = authorization,
) {
	return createServerAuth({
		authorization: definition,
		getIdentity: ({ request }) => getIdentity(request),
	});
}

function makeBackend(options?: {
	hooks?: FormBuilderBackendHooks;
	auth?: StackServerAuthProvider;
	adapter?: (db: DatabaseDefinition) => DBAdapter;
}) {
	return stack({
		basePath: "/api",
		plugins: {
			formBuilder: formBuilderBackendPlugin({ hooks: options?.hooks }),
		},
		adapter: options?.adapter ?? memoryAdapter,
		...(options?.auth ? { auth: options.auth } : {}),
	});
}

function request(
	path: string,
	options?: { method?: string; identity?: Identity; body?: unknown },
) {
	const headers = new Headers();
	if (options?.identity) {
		headers.set("x-user-id", options.identity.id);
		headers.set("x-user-role", options.identity.role);
	}
	if (options?.body !== undefined)
		headers.set("content-type", "application/json");
	return new Request(`http://localhost/api${path}`, {
		method: options?.method ?? "GET",
		headers,
		...(options?.body !== undefined
			? { body: JSON.stringify(options.body) }
			: {}),
	});
}

const activeSchema = JSON.stringify({
	type: "object",
	properties: { name: { type: "string" } },
	required: ["name"],
});

async function seedForm(
	backend: ReturnType<typeof makeBackend>,
	overrides: Partial<Form> = {},
) {
	const now = new Date("2026-01-01T00:00:00.000Z");
	return backend.adapter.create<Form>({
		model: "form",
		data: {
			name: "Contact",
			slug: "contact",
			schema: activeSchema,
			status: "active",
			createdBy: "owner-1",
			createdAt: now,
			updatedAt: now,
			...overrides,
		},
	});
}

async function seedSubmission(
	backend: ReturnType<typeof makeBackend>,
	formId: string,
	overrides: Partial<FormSubmission> = {},
) {
	return backend.adapter.create<FormSubmission>({
		model: "formSubmission",
		data: {
			formId,
			data: JSON.stringify({ name: "Ada" }),
			submittedBy: "submitter-1",
			submittedAt: new Date("2026-01-02T00:00:00.000Z"),
			...overrides,
		},
	});
}

const owner = { id: "owner-1", role: "user" } as const;
const viewer = { id: "viewer-1", role: "user" } as const;
const admin = { id: "admin-1", role: "admin" } as const;

describe("Form Builder operation-first authorization", () => {
	it("preserves permissive compatibility when stack authorization is omitted", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			hooks: {
				onBeforeFormUpdated: () => {
					events.push("before");
				},
				onAfterFormUpdated: () => {
					events.push("after");
				},
			},
		});
		const form = await seedForm(backend);
		const response = await backend.handler(
			request(`/forms/${form.id}`, {
				method: "PUT",
				body: { name: "Compatible" },
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ name: "Compatible" });
		expect(events).toEqual(["before", "after"]);
	});

	it("bridges protected RC checks with trusted facts and keeps public declarations explicit", async () => {
		const getIdentity = vi.fn(({ request }: { request: Request }) => {
			const id = request.headers.get("x-user-id");
			return id ? { id } : null;
		});
		const can = vi.fn(
			({
				action,
				params,
				identity,
			}: {
				action: string;
				params?: Record<string, unknown>;
				identity: { id: string } | null;
			}) => action === "update" && identity?.id === params?.ownerId,
		);
		const backend = makeBackend({ auth: { getIdentity, can } });
		const form = await seedForm(backend);

		await backend
			.forRequest(request(`/forms/${form.id}`, { identity: owner }))
			.api.formBuilder.updateForm({
				id: form.id,
				data: { name: "RC owner" },
			});
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "form-builder:form",
				action: "update",
				params: expect.objectContaining({
					id: form.id,
					ownerId: owner.id,
					status: "active",
				}),
			}),
		);
		can.mockClear();

		await expect(
			backend
				.forRequest(request(`/forms/${form.id}`, { identity: viewer }))
				.api.formBuilder.updateForm({
					id: form.id,
					data: { name: "Denied" },
				}),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(can).toHaveBeenCalledOnce();
		can.mockClear();

		await backend
			.forRequest(request("/forms/contact"))
			.api.formBuilder.getFormBySlug({ slug: "contact" });
		await backend
			.forRequest(request("/forms/contact/submit"))
			.api.formBuilder.submitForm({
				slug: "contact",
				data: { name: "Public RC" },
			});
		expect(can).not.toHaveBeenCalled();
	});

	it("keeps public render and submission explicitly anonymous across HTTP, request, and internal transports", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeGetForm: (slug, context) => {
					events.push(`read:${slug}:${context.identity?.id ?? "anonymous"}`);
				},
				onBeforeSubmission: (slug, data, context) => {
					events.push(`submit:${slug}:${context.identity?.id ?? "anonymous"}`);
					return data;
				},
				onAfterSubmission: (submission, _form, context) => {
					events.push(
						`saved:${submission.id}:${context.identity?.id ?? "anonymous"}`,
					);
				},
			},
		});
		const form = await seedForm(backend);

		const renderResponse = await backend.handler(request("/forms/contact"));
		expect(renderResponse.status).toBe(200);
		expect(await renderResponse.json()).toMatchObject({
			id: form.id,
			slug: "contact",
		});
		expect(
			await backend
				.forRequest(request("/forms/contact"))
				.api.formBuilder.getFormBySlug({ slug: "contact" }),
		).toMatchObject({ id: form.id });
		expect(
			await backend.internal.formBuilder.getFormBySlug({ slug: "contact" }),
		).toMatchObject({ id: form.id });

		const submitResponse = await backend.handler(
			request("/forms/contact/submit", {
				method: "POST",
				body: { data: { name: "Ada" } },
			}),
		);
		expect(submitResponse.status).toBe(200);
		const submitted = (await submitResponse.json()) as FormSubmission;
		expect(submitted.formId).toBe(form.id);
		expect(
			await backend
				.forRequest(request("/forms/contact/submit"))
				.api.formBuilder.submitForm({
					slug: "contact",
					data: { name: "Grace" },
				}),
		).toMatchObject({ formId: form.id });
		expect(
			await backend.internal.formBuilder.submitForm({
				slug: "contact",
				data: { name: "Lin" },
			}),
		).toMatchObject({ formId: form.id });
		expect(events).toHaveLength(9);
	});

	it("returns 401 for anonymous callers and 403 for authenticated non-owners before lifecycle hooks", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeFormUpdated: () => {
					events.push("before");
				},
				onError: () => {
					events.push("error");
				},
			},
		});
		const form = await seedForm(backend);

		const anonymous = await backend.handler(
			request(`/forms/${form.id}`, {
				method: "PUT",
				body: { name: "Anonymous" },
			}),
		);
		const denied = await backend.handler(
			request(`/forms/${form.id}`, {
				method: "PUT",
				identity: viewer,
				body: { name: "Viewer" },
			}),
		);
		expect(anonymous.status).toBe(401);
		expect(denied.status).toBe(403);
		expect(events).toEqual([]);
	});

	it("fails closed across every protected HTTP operation", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeListForms: () => {
					events.push("list-forms");
				},
				onBeforeGetForm: () => {
					events.push("get-form");
				},
				onBeforeGetFormForUpdate: () => {
					events.push("get-form-for-update");
				},
				onBeforeFormCreated: () => {
					events.push("create-form");
				},
				onBeforeFormUpdated: () => {
					events.push("update-form");
				},
				onBeforeFormDeleted: () => {
					events.push("delete-form");
				},
				onBeforeListSubmissions: () => {
					events.push("list-submissions");
				},
				onBeforeGetSubmission: () => {
					events.push("get-submission");
				},
				onBeforeSubmissionDeleted: () => {
					events.push("delete-submission");
				},
				onError: () => {
					events.push("error");
				},
			},
		});
		const form = await seedForm(backend);
		const submission = await seedSubmission(backend, form.id);
		const protectedRequests = [
			() => request("/forms"),
			() => request(`/forms/id/${form.id}`),
			() => request(`/forms/id/${form.id}/edit`),
			() =>
				request("/forms", {
					method: "POST",
					body: {
						name: "Denied",
						slug: "denied",
						schema: activeSchema,
					},
				}),
			() =>
				request(`/forms/${form.id}`, {
					method: "PUT",
					body: { name: "Denied" },
				}),
			() => request(`/forms/${form.id}`, { method: "DELETE" }),
			() => request(`/forms/${form.id}/submissions`),
			() => request(`/forms/${form.id}/submissions/${submission.id}`),
			() =>
				request(`/forms/${form.id}/submissions/${submission.id}`, {
					method: "DELETE",
				}),
		];

		for (const createRequest of protectedRequests) {
			expect((await backend.handler(createRequest())).status).toBe(401);
			const denied = createRequest();
			denied.headers.set("x-user-id", viewer.id);
			denied.headers.set("x-user-role", viewer.role);
			expect((await backend.handler(denied)).status).toBe(403);
		}
		expect(events).toEqual([]);
	});

	it("uses server-derived ownership rather than spoofed browser facts", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const form = await seedForm(backend);
		expect(
			authorization.can(
				formBuilderPermissions.form.update({
					formId: form.id,
					ownerId: viewer.id,
					status: "active",
				}),
				viewer,
			),
		).toBe(true);

		await expect(
			backend
				.forRequest(request(`/forms/${form.id}`, { identity: viewer }))
				.api.formBuilder.updateForm({
					id: form.id,
					data: { name: "Spoofed" },
				}),
		).rejects.toMatchObject({ statusCode: 403 });
		const unchanged = await backend.adapter.findOne<Form>({
			model: "form",
			where: [{ field: "id", value: form.id }],
		});
		expect(unchanged?.name).toBe("Contact");
	});

	it("loads editor and submission page data through their exact permissions", async () => {
		const exactPageAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
			permissions: [formBuilderPermissions] as const,
			rules: ({ forms }) => [
				forms.form.read.when(() => false),
				forms.form.update.when(
					({ identity, facts }) => identity?.id === facts.ownerId,
				),
				forms.submission.read.when(
					({ identity, facts }) => identity?.id === facts.ownerId,
				),
			],
		});
		const backend = makeBackend({
			auth: createAuth(undefined, exactPageAuthorization),
		});
		const form = await seedForm(backend);
		await seedSubmission(backend, form.id);

		await expect(
			backend
				.forRequest(request(`/forms/id/${form.id}`, { identity: owner }))
				.api.formBuilder.getFormById({ id: form.id }),
		).rejects.toMatchObject({ statusCode: 403 });
		await expect(
			backend
				.forRequest(request(`/forms/id/${form.id}/edit`, { identity: owner }))
				.api.formBuilder.getFormForUpdate({ id: form.id }),
		).resolves.toMatchObject({ id: form.id, createdBy: owner.id });
		const editorResponse = await backend.handler(
			request(`/forms/id/${form.id}/edit`, { identity: owner }),
		);
		expect(editorResponse.status).toBe(200);
		expect(await editorResponse.json()).toMatchObject({ id: form.id });
		await expect(
			backend
				.forRequest(request(`/forms/id/${form.id}/edit`, { identity: viewer }))
				.api.formBuilder.getFormForUpdate({ id: form.id }),
		).rejects.toMatchObject({ statusCode: 403 });
		const list = await backend
			.forRequest(request(`/forms/${form.id}/submissions`, { identity: owner }))
			.api.formBuilder.listSubmissions({
				formId: form.id,
				query: { limit: 20, offset: 0 },
			});
		expect(list).toMatchObject({
			form: { id: form.id, createdBy: owner.id },
			total: 1,
		});
		expect(Object.keys(list.form).sort()).toEqual(["createdBy", "id", "name"]);
		const submissionsResponse = await backend.handler(
			request(`/forms/${form.id}/submissions`, { identity: owner }),
		);
		expect(submissionsResponse.status).toBe(200);
		const submissionsBody = await submissionsResponse.json();
		expect(submissionsBody).toMatchObject({
			form: { id: form.id, createdBy: owner.id },
			total: 1,
		});
		expect(Object.keys(submissionsBody.form).sort()).toEqual([
			"createdBy",
			"id",
			"name",
		]);
		await expect(
			backend.internal.formBuilder.getFormForUpdate({ id: form.id }),
		).resolves.toMatchObject({ id: form.id });
	});

	it("never exposes record contents from a collection-authorized submission list", async () => {
		const collectionOnlyAuthorization = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
			permissions: [formBuilderPermissions] as const,
			rules: ({ forms }) => [
				forms.submission.read.when(({ facts }) => facts.scope === "collection"),
			],
		});
		const backend = makeBackend({
			auth: createAuth(undefined, collectionOnlyAuthorization),
		});
		const form = await seedForm(backend);
		const submission = await seedSubmission(backend, form.id, {
			data: JSON.stringify({ secret: "never-list-this" }),
			ipAddress: "203.0.113.1",
			userAgent: "sensitive-agent",
		});

		const requestList = await backend
			.forRequest(request(`/forms/${form.id}/submissions`, { identity: owner }))
			.api.formBuilder.listSubmissions({
				formId: form.id,
				query: { limit: 20, offset: 0 },
			});
		expect(requestList.items).toEqual([
			{
				id: submission.id,
				formId: form.id,
				submittedAt: submission.submittedAt.toISOString(),
				submittedBy: submission.submittedBy,
			},
		]);

		const response = await backend.handler(
			request(`/forms/${form.id}/submissions`, { identity: owner }),
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.items).toEqual(requestList.items);
		expect(JSON.stringify(body)).not.toContain("never-list-this");
		expect(JSON.stringify(body)).not.toContain("203.0.113.1");
		expect(JSON.stringify(body)).not.toContain("sensitive-agent");
		const internalList = await backend.internal.formBuilder.listSubmissions({
			formId: form.id,
			query: { limit: 20, offset: 0 },
		});
		expect(internalList.items).toEqual(requestList.items);

		await expect(
			backend
				.forRequest(
					request(`/forms/${form.id}/submissions/${submission.id}`, {
						identity: owner,
					}),
				)
				.api.formBuilder.getSubmission({
					formId: form.id,
					submissionId: submission.id,
				}),
		).rejects.toMatchObject({ statusCode: 403 });
		const recordResponse = await backend.handler(
			request(`/forms/${form.id}/submissions/${submission.id}`, {
				identity: owner,
			}),
		);
		expect(recordResponse.status).toBe(403);
	});

	it("allows owners and admins while keeping collection scoping in server execution", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const form = await seedForm(backend);
		const submission = await seedSubmission(backend, form.id);

		const updated = await backend
			.forRequest(request(`/forms/${form.id}`, { identity: owner }))
			.api.formBuilder.updateForm({ id: form.id, data: { name: "Owned" } });
		expect(updated.name).toBe("Owned");
		await expect(
			backend
				.forRequest(request(`/forms/id/${form.id}`, { identity: owner }))
				.api.formBuilder.getFormById({ id: form.id }),
		).resolves.toMatchObject({ id: form.id, createdBy: owner.id });
		const requestApi = backend.forRequest(
			request(`/forms/${form.id}/submissions`, { identity: owner }),
		).api.formBuilder as unknown as {
			listSubmissions(input: {
				formId: string;
				query: { limit: number; offset: number };
			}): Promise<{
				readonly form: { readonly id: string; readonly createdBy?: string };
				readonly items: ReadonlyArray<{ readonly id: string }>;
			}>;
		};
		const list = (await requestApi.listSubmissions({
			formId: form.id,
			query: { limit: 20, offset: 0 },
		})) as {
			readonly form: { readonly id: string; readonly createdBy?: string };
			readonly items: ReadonlyArray<{ readonly id: string }>;
		};
		expect(list.form).toMatchObject({ id: form.id, createdBy: owner.id });
		expect(list.items.map((item) => item.id)).toEqual([submission.id]);
		expect(Object.keys(list.items[0] ?? {}).sort()).toEqual([
			"formId",
			"id",
			"submittedAt",
			"submittedBy",
		]);
		const detail = await backend
			.forRequest(
				request(`/forms/${form.id}/submissions/${submission.id}`, {
					identity: owner,
				}),
			)
			.api.formBuilder.getSubmission({
				formId: form.id,
				submissionId: submission.id,
			});
		expect(detail).toMatchObject({ id: submission.id, formId: form.id });
		expect("form" in detail).toBe(false);
		await expect(
			backend
				.forRequest(request("/forms", { identity: admin }))
				.api.formBuilder.createForm({
					name: "Admin form",
					slug: "admin-form",
					schema: activeSchema,
					status: "active",
				}),
		).resolves.toMatchObject({ slug: "admin-form", createdBy: admin.id });
		await expect(
			backend
				.forRequest(request("/forms", { identity: admin }))
				.api.formBuilder.listForms({ limit: 20, offset: 0 }),
		).resolves.toMatchObject({ total: 2 });
		await expect(
			backend
				.forRequest(
					request(`/forms/${form.id}/submissions/${submission.id}`, {
						identity: owner,
					}),
				)
				.api.formBuilder.deleteSubmission({
					formId: form.id,
					submissionId: submission.id,
				}),
		).resolves.toEqual({ success: true });
		await expect(
			backend
				.forRequest(request(`/forms/${form.id}`, { identity: owner }))
				.api.formBuilder.deleteForm({ id: form.id }),
		).resolves.toEqual({ success: true });
	});

	it("keeps validation and hooks active for trusted internal calls without resolving identity", async () => {
		const getIdentity = vi.fn(() => {
			throw new Error("internal must not resolve identity");
		});
		const events: string[] = [];
		const backend = makeBackend({
			auth: createAuth(getIdentity),
			hooks: {
				onBeforeFormCreated: (_input, context) => {
					events.push(`before:${context.identity?.id ?? "internal"}`);
				},
				onAfterFormCreated: (_form, context) => {
					events.push(`after:${context.identity?.id ?? "internal"}`);
				},
			},
		});

		await expect(
			backend.internal.formBuilder.createForm({
				name: "",
				slug: "invalid",
				schema: activeSchema,
				status: "active",
			}),
		).rejects.toThrow();
		expect(events).toEqual([]);
		await backend.internal.formBuilder.createForm({
			name: "Internal",
			slug: "internal",
			schema: activeSchema,
			status: "active",
		});
		expect(events).toEqual(["before:internal", "after:internal"]);
		expect(getIdentity).not.toHaveBeenCalled();
	});

	it("fails closed for missing rules and preserves identity/rule failures as errors", async () => {
		const missing = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
			permissions: [formBuilderPermissions] as const,
			rules: ({ forms }) => [forms.form.render.allow()],
		});
		const missingBackend = makeBackend({
			auth: createAuth(undefined, missing),
		});
		const form = await seedForm(missingBackend);
		await expect(
			missingBackend
				.forRequest(request(`/forms/${form.id}`, { identity: owner }))
				.api.formBuilder.updateForm({ id: form.id, data: { name: "Denied" } }),
		).rejects.toMatchObject({ statusCode: 403 });

		const identityFailure = makeBackend({
			auth: createAuth(() => {
				throw new Error("session unavailable");
			}),
		});
		const identityForm = await seedForm(identityFailure, { slug: "identity" });
		await expect(
			identityFailure
				.forRequest(request(`/forms/${identityForm.id}`))
				.api.formBuilder.updateForm({
					id: identityForm.id,
					data: { name: "Nope" },
				}),
		).rejects.toThrow("session unavailable");

		const failing = defineAuthorization({
			identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
			permissions: [formBuilderPermissions] as const,
			rules: ({ forms }) => [
				forms.form.update.when(() => {
					throw new Error("policy unavailable");
				}),
			],
		});
		const ruleFailure = makeBackend({ auth: createAuth(undefined, failing) });
		const ruleForm = await seedForm(ruleFailure, { slug: "rule" });
		await expect(
			ruleFailure
				.forRequest(request(`/forms/${ruleForm.id}`, { identity: owner }))
				.api.formBuilder.updateForm({
					id: ruleForm.id,
					data: { name: "Nope" },
				}),
		).rejects.toThrow("policy unavailable");

		const factFailureEvents: string[] = [];
		const factFailure = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeFormUpdated: () => {
					factFailureEvents.push("before");
				},
				onError: () => {
					factFailureEvents.push("error");
				},
			},
		});
		const factForm = await seedForm(factFailure, { slug: "facts" });
		vi.spyOn(factFailure.adapter, "findOne").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		await expect(
			factFailure
				.forRequest(request(`/forms/${factForm.id}`, { identity: owner }))
				.api.formBuilder.updateForm({
					id: factForm.id,
					data: { name: "Nope" },
				}),
		).rejects.toThrow("database unavailable");
		expect(factFailureEvents).toEqual([]);
	});

	it.each(["update", "delete", "deleteSubmission"] as const)(
		"rechecks trusted snapshots before %s hooks observe a stale owner",
		async (operation) => {
			const events: string[] = [];
			let backend: ReturnType<typeof makeBackend>;
			let raced = false;
			backend = makeBackend({
				auth: createAuth(async () => {
					if (!raced) {
						raced = true;
						const form = await backend.adapter.findOne<Form>({
							model: "form",
							where: [{ field: "slug", value: `race-${operation}` }],
						});
						if (form) {
							await backend.adapter.update({
								model: "form",
								where: [{ field: "id", value: form.id }],
								update: {
									createdBy: "new-owner",
									updatedAt: new Date("2026-02-01T00:00:00.000Z"),
								},
							});
						}
					}
					return owner;
				}),
				hooks: {
					onBeforeFormUpdated: () => {
						events.push("update-hook");
					},
					onBeforeFormDeleted: () => {
						events.push("delete-hook");
					},
					onBeforeSubmissionDeleted: () => {
						events.push("submission-hook");
					},
				},
			});
			const form = await seedForm(backend, { slug: `race-${operation}` });
			const submission = await seedSubmission(backend, form.id);
			const api = backend.forRequest(request("/race", { identity: owner })).api
				.formBuilder;
			const result =
				operation === "update"
					? api.updateForm({ id: form.id, data: { name: "Stale" } })
					: operation === "delete"
						? api.deleteForm({ id: form.id })
						: api.deleteSubmission({
								formId: form.id,
								submissionId: submission.id,
							});
			await expect(result).rejects.toMatchObject({ statusCode: 409 });
			expect(events).toEqual([]);
		},
	);

	it.each(["update", "delete", "submit", "deleteSubmission"] as const)(
		"atomically rejects a %s write-boundary race before domain hooks run",
		async (operation) => {
			const events: string[] = [];
			const backend = makeBackend({
				auth: createAuth(),
				hooks: {
					onBeforeFormUpdated: () => {
						events.push("update-hook");
					},
					onBeforeFormDeleted: () => {
						events.push("delete-hook");
					},
					onBeforeSubmission: () => {
						events.push("submit-hook");
					},
					onBeforeSubmissionDeleted: () => {
						events.push("submission-hook");
					},
				},
			});
			const form = await seedForm(backend, { slug: `cas-${operation}` });
			const submission = await seedSubmission(backend, form.id);
			const transaction = backend.adapter.transaction.bind(backend.adapter);
			let raced = false;
			vi.spyOn(backend.adapter, "transaction").mockImplementation(
				async (callback) =>
					transaction(async (tx) => {
						const updateMany = tx.updateMany.bind(tx);
						vi.spyOn(tx, "updateMany").mockImplementation(async (input) => {
							if (!raced && input.model === "form") {
								raced = true;
								await tx.update<Form>({
									model: "form",
									where: [{ field: "id", value: form.id }],
									update:
										operation === "submit"
											? {
													status: "inactive",
													updatedAt: new Date("2026-03-01T00:00:00.000Z"),
												}
											: {
													createdBy: viewer.id,
													updatedAt: new Date("2026-03-01T00:00:00.000Z"),
												},
								});
							}
							return updateMany(input);
						});
						return callback(tx);
					}),
			);

			const api = backend.forRequest(request("/cas", { identity: owner })).api
				.formBuilder;
			const result =
				operation === "update"
					? api.updateForm({ id: form.id, data: { name: "Raced" } })
					: operation === "delete"
						? api.deleteForm({ id: form.id })
						: operation === "submit"
							? api.submitForm({
									slug: form.slug,
									data: { name: "Raced" },
								})
							: api.deleteSubmission({
									formId: form.id,
									submissionId: submission.id,
								});

			await expect(result).rejects.toMatchObject({ statusCode: 409 });
			expect(raced).toBe(true);
			expect(events).toEqual([]);
			expect(
				await backend.adapter.findOne<Form>({
					model: "form",
					where: [{ field: "id", value: form.id }],
				}),
			).toMatchObject({
				createdBy: owner.id,
				status: "active",
				name: "Contact",
			});
			expect(
				await backend.adapter.count({
					model: "formSubmission",
					where: [{ field: "formId", value: form.id }],
				}),
			).toBe(1);
		},
	);

	it.each(["update", "delete", "submit", "deleteSubmission"] as const)(
		"fails closed for %s before hooks or claims on a sequential transaction fallback",
		async (operation) => {
			const events: string[] = [];
			const backend = makeBackend({
				auth: createAuth(),
				hooks: {
					onBeforeFormUpdated: () => {
						events.push("update-hook");
					},
					onBeforeFormDeleted: () => {
						events.push("delete-hook");
					},
					onBeforeSubmission: () => {
						events.push("submit-hook");
					},
					onBeforeSubmissionDeleted: () => {
						events.push("submission-hook");
					},
				},
			});
			const form = await seedForm(backend, { slug: `sequential-${operation}` });
			const submission = await seedSubmission(backend, form.id);
			const adapterConfig = backend.adapter.options?.adapterConfig;
			expect(adapterConfig).toBeDefined();
			if (!adapterConfig) throw new Error("Missing adapter config");
			adapterConfig.transaction = false;
			const api = backend.forRequest(
				request("/sequential", { identity: owner }),
			).api.formBuilder;
			const result =
				operation === "update"
					? api.updateForm({ id: form.id, data: { name: "Unsafe" } })
					: operation === "delete"
						? api.deleteForm({ id: form.id })
						: operation === "submit"
							? api.submitForm({
									slug: form.slug,
									data: { name: "Unsafe" },
								})
							: api.deleteSubmission({
									formId: form.id,
									submissionId: submission.id,
								});

			await expect(result).rejects.toMatchObject({
				statusCode: 500,
				code: "ATOMIC_TRANSACTION_REQUIRED",
			});
			expect(events).toEqual([]);
			expect(
				await backend.adapter.findOne<Form>({
					model: "form",
					where: [{ field: "id", value: form.id }],
				}),
			).toMatchObject({ name: "Contact", createdBy: owner.id });
			expect(
				await backend.adapter.count({
					model: "formSubmission",
					where: [{ field: "formId", value: form.id }],
				}),
			).toBe(1);
		},
	);

	it("serializes a public submission hook and a competing status update", async () => {
		let enteredHook: (() => void) | undefined;
		let releaseHook: (() => void) | undefined;
		const entered = new Promise<void>((resolve) => {
			enteredHook = resolve;
		});
		const release = new Promise<void>((resolve) => {
			releaseHook = resolve;
		});
		const backend = makeBackend({
			auth: createAuth(),
			hooks: {
				onBeforeSubmission: async (_slug, data) => {
					enteredHook?.();
					await release;
					return data;
				},
			},
		});
		const form = await seedForm(backend, { slug: "post-claim-race" });
		const pending = backend
			.forRequest(request("/post-claim-race"))
			.api.formBuilder.submitForm({
				slug: form.slug,
				data: { name: "Raced" },
			});
		await entered;
		const winningUpdate = backend.adapter.update<Form>({
			model: "form",
			where: [{ field: "id", value: form.id }],
			update: {
				status: "inactive",
				updatedAt: new Date("2026-04-01T00:00:00.000Z"),
			},
		});
		releaseHook?.();

		await expect(pending).resolves.toMatchObject({ formId: form.id });
		await winningUpdate;
		expect(
			await backend.adapter.findOne<Form>({
				model: "form",
				where: [{ field: "id", value: form.id }],
			}),
		).toMatchObject({ status: "inactive" });
		expect(
			await backend.adapter.count({
				model: "formSubmission",
				where: [{ field: "formId", value: form.id }],
			}),
		).toBe(1);
	});

	it("preserves a winning status race and runs no stale-caller hooks or writes", async () => {
		const events: string[] = [];
		let backend: ReturnType<typeof makeBackend>;
		let raced = false;
		backend = makeBackend({
			adapter: rawMemoryAdapter,
			auth: createAuth(async () => {
				if (!raced) {
					raced = true;
					const form = await backend.adapter.findOne<Form>({
						model: "form",
						where: [{ field: "slug", value: "memory-status-race" }],
					});
					if (form) {
						await backend.adapter.update<Form>({
							model: "form",
							where: [{ field: "id", value: form.id }],
							update: {
								status: "inactive",
								updatedAt: new Date("2026-05-01T00:00:00.000Z"),
							},
						});
					}
				}
				return null;
			}),
			hooks: {
				onBeforeSubmission: () => {
					events.push("before");
				},
				onAfterSubmission: () => {
					events.push("after");
				},
			},
		});
		const form = await seedForm(backend, { slug: "memory-status-race" });

		await expect(
			backend
				.forRequest(request("/memory-status-race"))
				.api.formBuilder.submitForm({
					slug: form.slug,
					data: { name: "Stale" },
				}),
		).rejects.toMatchObject({ statusCode: 409, code: "FORM_STATE_CHANGED" });
		expect(events).toEqual([]);
		expect(
			await backend.adapter.findOne<Form>({
				model: "form",
				where: [{ field: "id", value: form.id }],
			}),
		).toMatchObject({ status: "inactive" });
		expect(
			await backend.adapter.count({
				model: "formSubmission",
				where: [{ field: "formId", value: form.id }],
			}),
		).toBe(0);
	});

	it("fails closed on the non-isolating memory adapter before hooks or claims", async () => {
		const beforeUpdate = vi.fn();
		const backend = makeBackend({
			adapter: rawMemoryAdapter,
			auth: createAuth(),
			hooks: { onBeforeFormUpdated: beforeUpdate },
		});
		const form = await seedForm(backend, { slug: "memory-no-isolation" });

		await expect(
			backend
				.forRequest(request("/memory-no-isolation", { identity: owner }))
				.api.formBuilder.updateForm({
					id: form.id,
					data: { name: "Unsafe" },
				}),
		).rejects.toMatchObject({
			statusCode: 500,
			code: "ATOMIC_TRANSACTION_REQUIRED",
		});
		expect(beforeUpdate).not.toHaveBeenCalled();
		expect(
			await backend.adapter.findOne<Form>({
				model: "form",
				where: [{ field: "id", value: form.id }],
			}),
		).toMatchObject({ name: "Contact", createdBy: owner.id });
	});

	it.each(["form", "submission"] as const)(
		"rolls back a %s delete when its conditional target reports no match",
		async (target) => {
			const backend = makeBackend({ auth: createAuth() });
			const form = await seedForm(backend, { slug: `delete-zero-${target}` });
			const submission = await seedSubmission(backend, form.id);
			const transaction = backend.adapter.transaction.bind(backend.adapter);
			vi.spyOn(backend.adapter, "transaction").mockImplementation(
				async (callback) =>
					transaction(async (tx) => {
						const deleteMany = tx.deleteMany.bind(tx);
						vi.spyOn(tx, "deleteMany").mockImplementation(async (input) => {
							if (
								(target === "form" && input.model === "form") ||
								(target === "submission" && input.model === "formSubmission")
							) {
								return 0;
							}
							return deleteMany(input);
						});
						return callback(tx);
					}),
			);

			const api = backend.forRequest(
				request("/delete-zero", { identity: owner }),
			).api.formBuilder;
			await expect(
				target === "form"
					? api.deleteForm({ id: form.id })
					: api.deleteSubmission({
							formId: form.id,
							submissionId: submission.id,
						}),
			).rejects.toMatchObject({ statusCode: 409 });
			expect(
				await backend.adapter.findOne<Form>({
					model: "form",
					where: [{ field: "id", value: form.id }],
				}),
			).not.toBeNull();
			expect(
				await backend.adapter.findOne<FormSubmission>({
					model: "formSubmission",
					where: [{ field: "id", value: submission.id }],
				}),
			).not.toBeNull();
		},
	);

	it("delivers the captured form to the submission after hook even if the row disappears after commit", async () => {
		const afterSubmission = vi.fn();
		const backend = makeBackend({
			auth: createAuth(),
			hooks: { onAfterSubmission: afterSubmission },
		});
		const form = await seedForm(backend, { slug: "after-snapshot" });
		const transaction = backend.adapter.transaction.bind(backend.adapter);
		vi.spyOn(backend.adapter, "transaction").mockImplementation(
			async (callback) => {
				const result = await transaction(callback);
				await backend.adapter.deleteMany({
					model: "form",
					where: [{ field: "id", value: form.id }],
				});
				return result;
			},
		);

		await expect(
			backend
				.forRequest(request("/after-snapshot"))
				.api.formBuilder.submitForm({
					slug: form.slug,
					data: { name: "Captured" },
				}),
		).resolves.toMatchObject({ formId: form.id });
		expect(afterSubmission).toHaveBeenCalledWith(
			expect.objectContaining({ formId: form.id }),
			expect.objectContaining({ id: form.id, slug: form.slug }),
			expect.objectContaining({ formId: form.id, formSlug: form.slug }),
		);
	});

	it("rejects a collection-read race before returning submission rows", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const form = await seedForm(backend, { slug: "read-race" });
		await seedSubmission(backend, form.id);
		const transaction = backend.adapter.transaction.bind(backend.adapter);
		let raced = false;
		vi.spyOn(backend.adapter, "transaction").mockImplementation(
			async (callback) =>
				transaction(async (tx) => {
					const findMany = tx.findMany.bind(tx);
					vi.spyOn(tx, "findMany").mockImplementation(async (input) => {
						const result = await findMany(input);
						if (!raced && input.model === "formSubmission") {
							raced = true;
							await tx.update<Form>({
								model: "form",
								where: [{ field: "id", value: form.id }],
								update: {
									createdBy: viewer.id,
									updatedAt: new Date("2026-03-01T00:00:00.000Z"),
								},
							});
						}
						return result;
					});
					return callback(tx);
				}),
		);

		await expect(
			backend
				.forRequest(request("/read-race", { identity: owner }))
				.api.formBuilder.listSubmissions({
					formId: form.id,
					query: { limit: 20, offset: 0 },
				}),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(raced).toBe(true);
	});

	it("keeps raw SSG/data helpers outside request and internal operation namespaces", () => {
		const backend = makeBackend({ auth: createAuth() });
		const requestApi = backend.forRequest(request("/forms")).api.formBuilder;
		expect("prefetchForRoute" in requestApi).toBe(false);
		expect("getAllForms" in requestApi).toBe(false);
		expect("prefetchForRoute" in backend.internal.formBuilder).toBe(false);
		expect(Object.keys(requestApi).sort()).toEqual(
			Object.keys(backend.internal.formBuilder).sort(),
		);
	});

	it("hydrates protected route data under permission-aligned SSG keys", async () => {
		const backend = makeBackend({ auth: createAuth() });
		const form = await seedForm(backend);
		const submission = await seedSubmission(backend, form.id, {
			data: JSON.stringify({ secret: "never-hydrate-this" }),
			ipAddress: "203.0.113.2",
			userAgent: "ssg-sensitive-agent",
		});
		const queryClient = new QueryClient();

		await backend.api.formBuilder.prefetchForRoute("editForm", queryClient, {
			id: form.id,
		});
		expect(
			queryClient.getQueryData(FORM_QUERY_KEYS.formForUpdate(form.id)),
		).toMatchObject({ id: form.id, schema: activeSchema });

		await backend.api.formBuilder.prefetchForRoute("submissions", queryClient, {
			id: form.id,
		});
		const data = queryClient.getQueryData<{
			pages: Array<{
				form: Record<string, unknown>;
				items: Array<Record<string, unknown>>;
				total: number;
			}>;
		}>(
			FORM_QUERY_KEYS.submissionsList({
				formId: form.id,
				limit: 20,
				offset: 0,
			}),
		);
		expect(data?.pages[0]?.total).toBe(1);
		expect(Object.keys(data?.pages[0]?.form ?? {}).sort()).toEqual([
			"createdBy",
			"id",
			"name",
		]);
		expect(data?.pages[0]?.items).toEqual([
			{
				id: submission.id,
				formId: form.id,
				submittedAt: submission.submittedAt.toISOString(),
				submittedBy: submission.submittedBy,
			},
		]);
		expect(JSON.stringify(data)).not.toContain("never-hydrate-this");
		expect(JSON.stringify(data)).not.toContain("203.0.113.2");
		expect(JSON.stringify(data)).not.toContain("ssg-sensitive-agent");
	});
});
