import { describe, expect, it } from "vitest";
import { normalizePlugins } from "../normalize-plugins";

describe("normalizePlugins", () => {
	it("injects cms when ui-builder is selected without cms", () => {
		const result = normalizePlugins(["ui-builder"]);
		expect(result).toContain("cms");
		expect(result).toContain("ui-builder");
		expect(result.indexOf("cms")).toBeLessThan(result.indexOf("ui-builder"));
	});

	it("does not duplicate cms when already present", () => {
		const result = normalizePlugins(["cms", "ui-builder"]);
		expect(result.filter((k) => k === "cms").length).toBe(1);
	});

	it("does not modify a list with no inter-plugin dependencies", () => {
		const input = ["blog", "kanban"] as const;
		expect(normalizePlugins([...input])).toEqual([...input]);
	});

	it("returns an empty array unchanged", () => {
		expect(normalizePlugins([])).toEqual([]);
	});
});
