import { describe, expect, it } from "vitest";
import { formatSchoolPrice } from "../format-price";

describe("School prices in minor currency units", () => {
	it.each([
		["USD", 1234, "$12.34"],
		["JPY", 1000, "¥1,000"],
		["KWD", 1000, "KWD 1.000"],
	] as const)(
		"formats %s without assuming two decimal places",
		(currency, price, expected) => {
			expect(formatSchoolPrice({ price, currency }).replace(/\s+/g, " ")).toBe(
				expected,
			);
		},
	);
	it("keeps free enrollment labeled Free", () => {
		expect(formatSchoolPrice({ price: 0, currency: "JPY" })).toBe("Free");
	});
});
