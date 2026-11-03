import { describe, expect, it } from "vitest";
import { decodeJobDepartment, encodeJobDepartment } from "../utils";

describe("department URL identifiers", () => {
	it.each([
		"Engineering",
		"Sales / Marketing ~ 50%",
		"研究開発",
		"a~2Fb",
		"100% / Remote",
	])(
		"preserves %s through a host router's early URL decoding",
		(department) => {
			const identifier = encodeJobDepartment(department);
			expect(identifier).not.toMatch(/[%/]/);
			expect(decodeJobDepartment(decodeURIComponent(identifier))).toBe(
				department,
			);
		},
	);
	it("keeps ordinary department names readable", () => {
		expect(encodeJobDepartment("Engineering")).toBe("Engineering");
	});
	it.each([
		[".", "~2E"],
		["..", "~2E~2E"],
	])("preserves the %s department as a URL segment", (department, expected) => {
		const identifier = encodeJobDepartment(department);
		expect(identifier).toBe(expected);
		expect(
			new URL(`/jobs/department/${identifier}`, "https://example.com").pathname,
		).toBe(`/jobs/department/${expected}`);
		expect(decodeJobDepartment(decodeURIComponent(identifier))).toBe(
			department,
		);
	});
	it.each(["broken~", "broken~QQ", "~FF", "50%"])(
		"rejects malformed identifiers without throwing: %s",
		(identifier) => {
			expect(decodeJobDepartment(identifier)).toBeUndefined();
		},
	);
});
