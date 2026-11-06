import { describe, expect, it } from "vitest";
import { applyAISchema } from "../client/components/pages/ai-schema";

describe("AI visual form patches", () => {
	it("preserves unsaved fields and metadata while adding conditional fields and steps", () => {
		const original = {
			type: "object" as const,
			properties: {
				keep: { type: "string", label: "My unsaved field" },
				enabled: { type: "boolean" },
				details: { type: "string", label: "Details", description: "Keep this" },
			},
		};
		const next = applyAISchema(original, {
			schema: JSON.stringify({
				type: "object",
				properties: {
					details: {
						type: "string",
						showIf: { field: "enabled", operator: "isTruthy" },
						stepGroup: 1,
					},
				},
				steps: [
					{ id: "one", title: "First" },
					{
						id: "two",
						title: "Details",
						showIf: { field: "enabled", operator: "equals", value: true },
					},
				],
			}),
		});
		expect(next.properties.keep).toEqual(original.properties.keep);
		expect(next.properties.details).toMatchObject({
			label: "Details",
			description: "Keep this",
			showIf: { field: "enabled", operator: "isTruthy" },
		});
		expect(next.steps?.[1]?.showIf?.value).toBe(true);
		expect(original.properties.details).not.toHaveProperty("showIf");
	});
	it.each([
		{ schema: "not json" },
		{ schema: JSON.stringify({ type: "array", properties: {} }) },
		{
			schema: JSON.stringify({
				type: "object",
				properties: {
					a: { type: "string", showIf: { field: "a", operator: "script" } },
				},
			}),
		},
		{
			schema: JSON.stringify({
				type: "object",
				properties: {
					a: {
						type: "string",
						showIf: { field: "missing", operator: "equals", value: 1 },
					},
				},
			}),
		},
		{
			schema: JSON.stringify({
				type: "object",
				properties: {
					a: {
						type: "string",
						showIf: { field: "a", operator: "in", value: "wrong" },
					},
				},
			}),
		},
	])("rejects malformed schema or visibility metadata %#", (input) => {
		expect(() => applyAISchema(undefined, input)).toThrow();
	});
});
