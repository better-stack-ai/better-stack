import { describe, expect, it } from "vitest";
import {
	parseListStateFromSearchParams,
	resolveListStateHistoryMode,
	serializeListStateToSearchParams,
} from "../shared/list-state";

const schema = {
	tab: { type: "string" as const, default: "pending" },
	page: { type: "number" as const, default: 1 },
	filter: { type: "string" as const, default: "", history: "replace" as const },
};

describe("parseListStateFromSearchParams", () => {
	it("returns defaults for an empty query string", () => {
		expect(
			parseListStateFromSearchParams("comments-moderation", schema, ""),
		).toEqual({ tab: "pending", page: 1, filter: "" });
	});

	it("parses non-default values from URL params", () => {
		const params = new URLSearchParams("tab=spam&page=3&filter=hello");
		expect(
			parseListStateFromSearchParams("comments-moderation", schema, params),
		).toEqual({ tab: "spam", page: 3, filter: "hello" });
	});

	it("falls back to defaults for invalid numbers", () => {
		const params = new URLSearchParams("page=abc");
		expect(
			parseListStateFromSearchParams("comments-moderation", schema, params)
				.page,
		).toBe(1);
	});
});

describe("serializeListStateToSearchParams", () => {
	it("omits fields equal to their defaults", () => {
		const params = serializeListStateToSearchParams(
			"comments-moderation",
			schema,
			{ tab: "pending", page: 1, filter: "" },
		);
		expect(params.toString()).toBe("");
	});

	it("serializes only deviating fields", () => {
		const params = serializeListStateToSearchParams(
			"comments-moderation",
			schema,
			{ tab: "spam", page: 3, filter: "" },
		);
		expect(params.toString()).toBe("tab=spam&page=3");
	});

	it("preserves unrelated params in the base query string", () => {
		const base = new URLSearchParams("foo=bar");
		const params = serializeListStateToSearchParams(
			"comments-moderation",
			schema,
			{ tab: "spam", page: 1, filter: "" },
			base,
		);
		expect(params.get("foo")).toBe("bar");
		expect(params.get("tab")).toBe("spam");
		expect(params.has("page")).toBe(false);
	});
});

describe("resolveListStateHistoryMode", () => {
	it("defaults to push when no replace fields are updated", () => {
		expect(resolveListStateHistoryMode(schema, { tab: "spam", page: 2 })).toBe(
			false,
		);
	});

	it("uses replace when a replace-history field is updated", () => {
		expect(resolveListStateHistoryMode(schema, { filter: "x" })).toBe(true);
	});

	it("honors an explicit replace option", () => {
		expect(resolveListStateHistoryMode(schema, { tab: "spam" }, true)).toBe(
			true,
		);
		expect(resolveListStateHistoryMode(schema, { filter: "x" }, false)).toBe(
			false,
		);
	});
});
