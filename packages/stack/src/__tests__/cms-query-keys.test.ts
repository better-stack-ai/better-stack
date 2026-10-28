/**
 * SSG guard: the factory-generated CMS query keys must stay deep-equal to
 * the `CMS_QUERY_KEYS` builders used by `prefetchForRoute` (DB path).
 * Key drift breaks React Query cache hydration silently during `next build`.
 */
import { describe, expect, it, vi } from "vitest";
import { CMS_QUERY_KEYS } from "../plugins/cms/api/query-key-defs";
import { createCMSQueryKeys } from "../plugins/cms/query-keys";

const client = vi.fn() as any;

describe("cms query keys match SSG prefetch keys", () => {
	const queries = createCMSQueryKeys(client);

	it("types list keys match", () => {
		expect([...queries.cmsTypes.list().queryKey]).toEqual([
			...CMS_QUERY_KEYS.typesList(),
		]);
	});

	it("content list keys match for default params", () => {
		expect([...queries.cmsContent.list({ typeSlug: "post" }).queryKey]).toEqual(
			[...CMS_QUERY_KEYS.contentList({ typeSlug: "post" })],
		);
	});

	it("content list keys match for custom limits and offsets", () => {
		expect([
			...queries.cmsContent.list({ typeSlug: "post", limit: 5, offset: 10 })
				.queryKey,
		]).toEqual([
			...CMS_QUERY_KEYS.contentList({ typeSlug: "post", limit: 5, offset: 10 }),
		]);
	});

	it("content list keys match for search terms", () => {
		expect([
			...queries.cmsContent.list({ typeSlug: "post", search: "hello" })
				.queryKey,
		]).toEqual([
			...CMS_QUERY_KEYS.contentList({ typeSlug: "post", search: "hello" }),
		]);
	});

	it("normalizes a whitespace-only search the same way", () => {
		expect([
			...queries.cmsContent.list({ typeSlug: "post", search: "  " }).queryKey,
		]).toEqual([...CMS_QUERY_KEYS.contentList({ typeSlug: "post" })]);
	});

	it("content detail keys match", () => {
		expect([...queries.cmsContent.detail("post", "abc").queryKey]).toEqual([
			...CMS_QUERY_KEYS.contentDetail("post", "abc"),
		]);
	});

	it("normalizes equivalent selections across read identities and preserves prefetch parity", () => {
		const fields = ["title", "name.with.dot", "title"];
		const keys = [
			(selection?: readonly string[]) =>
				queries.cmsContent.options({
					typeSlug: "post",
					view: "content",
					fields: selection,
				}).queryKey,
			(selection?: readonly string[]) =>
				queries.cmsContent.list({
					typeSlug: "post",
					view: "content",
					fields: selection,
				}).queryKey,
			(selection?: readonly string[]) =>
				queries.cmsContent.detail("post", "id", {
					view: "content",
					fields: selection,
				}).queryKey,
			(selection?: readonly string[]) =>
				queries.cmsContent.bySlug("post", "slug", {
					view: "content",
					fields: selection,
				}).queryKey,
			(selection?: readonly string[]) =>
				queries.cmsContent.byRelation({
					typeSlug: "post",
					field: "authorId",
					targetId: "author",
					view: "content",
					fields: selection,
				}).queryKey,
			(selection?: readonly string[]) =>
				queries.cmsTypes.inverseRelationItems({
					slug: "author",
					sourceType: "post",
					itemId: "author",
					fieldName: "authorId",
					view: "content",
					fields: selection,
				}).queryKey,
		];
		for (const key of keys) {
			expect(key(fields)).toEqual(key(["name.with.dot", "title"]));
			expect(key(fields)).not.toEqual(key(["title"]));
			expect(key(fields)).not.toEqual(key());
		}
		expect(fields).toEqual(["title", "name.with.dot", "title"]);
		expect(keys[1]!(fields)).toEqual(
			CMS_QUERY_KEYS.contentList({ typeSlug: "post", view: "content", fields }),
		);
		expect(keys[2]!(fields)).toEqual(
			CMS_QUERY_KEYS.contentDetail("post", "id", { view: "content", fields }),
		);
	});

	it("exposes the same _def prefixes as the previous factory", () => {
		expect([...queries.cmsTypes._def]).toEqual(["cmsTypes"]);
		expect([...queries.cmsTypes.list._def]).toEqual(["cmsTypes", "list"]);
		expect([...queries.cmsContent.list._def]).toEqual(["cmsContent", "list"]);
	});
});
