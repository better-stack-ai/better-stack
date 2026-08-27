/**
 * SSG guard: the factory-generated Form Builder query keys must stay
 * deep-equal to the `FORM_QUERY_KEYS` builders used by `prefetchForRoute`
 * (DB path). Key drift breaks React Query cache hydration silently during
 * `next build`.
 */
import { describe, expect, it, vi } from "vitest";
import { FORM_QUERY_KEYS } from "../plugins/form-builder/api/query-key-defs";
import { createFormBuilderQueryKeys } from "../plugins/form-builder/query-keys";

const client = vi.fn() as any;

describe("form-builder query keys match SSG prefetch keys", () => {
	const queries = createFormBuilderQueryKeys(client);

	it("forms list keys match for default params", () => {
		expect([...queries.forms.list({}).queryKey]).toEqual([
			...FORM_QUERY_KEYS.formsList(),
		]);
	});

	it("forms list keys match for custom limits, offsets and statuses", () => {
		expect([
			...queries.forms.list({ status: "active", limit: 5, offset: 10 })
				.queryKey,
		]).toEqual([
			...FORM_QUERY_KEYS.formsList({ status: "active", limit: 5, offset: 10 }),
		]);
	});

	it("forms list keys match for search terms", () => {
		expect([...queries.forms.list({ search: "contact" }).queryKey]).toEqual([
			...FORM_QUERY_KEYS.formsList({ search: "contact" }),
		]);
	});

	it("normalizes a whitespace-only search the same way", () => {
		expect([...queries.forms.list({ search: "  " }).queryKey]).toEqual([
			...FORM_QUERY_KEYS.formsList(),
		]);
	});

	it("form byId keys match", () => {
		expect([...queries.forms.byId("abc").queryKey]).toEqual([
			...FORM_QUERY_KEYS.formById("abc"),
		]);
	});

	it("form editor keys match", () => {
		expect([...queries.forms.forUpdate("abc").queryKey]).toEqual([
			...FORM_QUERY_KEYS.formForUpdate("abc"),
		]);
	});

	it("submissions list keys match", () => {
		expect([
			...queries.formSubmissions.list({ formId: "f1", limit: 20, offset: 0 })
				.queryKey,
		]).toEqual([
			...FORM_QUERY_KEYS.submissionsList({
				formId: "f1",
				limit: 20,
				offset: 0,
			}),
		]);
	});

	it("exposes the same _def prefixes as the previous factory", () => {
		expect([...queries.forms._def]).toEqual(["forms"]);
		expect([...queries.forms.list._def]).toEqual(["forms", "list"]);
		expect([...queries.forms.byId._def]).toEqual(["forms", "byId"]);
		expect([...queries.forms.forUpdate._def]).toEqual(["forms", "forUpdate"]);
		expect([...queries.formSubmissions._def]).toEqual(["formSubmissions"]);
		expect([...queries.formSubmissions.list._def]).toEqual([
			"formSubmissions",
			"list",
		]);
	});
});
