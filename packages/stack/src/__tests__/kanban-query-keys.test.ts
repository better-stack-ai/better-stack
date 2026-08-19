/**
 * SSG guard: factory-generated Kanban query keys must stay deep-equal to the
 * builders used by `prefetchForRoute`. Key drift silently breaks hydration.
 */
import { describe, expect, it, vi } from "vitest";
import { KANBAN_QUERY_KEYS } from "../plugins/kanban/api/query-key-defs";
import { createKanbanQueryKeys } from "../plugins/kanban/query-keys";

const client = vi.fn() as any;

describe("kanban query keys match SSG prefetch keys", () => {
	const queries = createKanbanQueryKeys(client);

	it("board list keys match for default params", () => {
		expect([...queries.boards.list().queryKey]).toEqual([
			...KANBAN_QUERY_KEYS.boardsList(),
		]);
	});

	it("board list keys match for every supported filter", () => {
		const params = {
			slug: "roadmap",
			ownerId: "user-1",
			organizationId: "org-1",
			limit: 10,
			offset: 20,
		};
		expect([...queries.boards.list(params).queryKey]).toEqual([
			...KANBAN_QUERY_KEYS.boardsList(params),
		]);
	});

	it("board detail keys match", () => {
		expect([...queries.boards.detail("board-1").queryKey]).toEqual([
			...KANBAN_QUERY_KEYS.boardDetail("board-1"),
		]);
	});

	it("preserves the previous query-key factory prefixes", () => {
		expect([...queries.boards._def]).toEqual(["boards"]);
		expect([...queries.boards.list._def]).toEqual(["boards", "list"]);
		expect([...queries.boards.detail._def]).toEqual(["boards", "detail"]);
		expect([...queries.boards.bySlug._def]).toEqual(["boards", "bySlug"]);
		expect([...queries.boards.bySlug("roadmap").queryKey]).toEqual([
			"boards",
			"bySlug",
			"slug",
			"roadmap",
		]);
	});
});
