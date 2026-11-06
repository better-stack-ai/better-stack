import { describe, expect, it } from "vitest";
import { nestedSchema, nestedPatch, nestedAddPatch } from "./ai-schema-fixture";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
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
		expect(next.properties.keep).toEqual({
			...original.properties.keep,
			stepGroup: 0,
		});
		expect(original.properties.keep).not.toHaveProperty("stepGroup");
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

it("allows shortening root-map steps when the patch explicitly reassigns the retained field", () => {
	const original = {
		type: "object" as const,
		properties: { a: { type: "string" }, b: { type: "string" } },
		required: ["b"],
		steps: [
			{ id: "first", title: "First" },
			{ id: "second", title: "Second" },
		],
		stepGroupMap: { a: 0, b: 1 },
	};
	const next = applyAISchema(original, {
		schema: JSON.stringify({
			type: "object",
			properties: { b: { type: "string", stepGroup: 0 } },
			steps: [original.steps[0]],
		}),
	});
	expect(next.properties.b?.stepGroup).toBe(0);
	expect(next.properties.a?.stepGroup).toBe(0);
	expect(next.required).toEqual(["b"]);
	expect(original.stepGroupMap.b).toBe(1);
});

it("merges nested object and item schemas without losing siblings or their validation and metadata", () => {
	const original = structuredClone(nestedSchema);
	const added = applyAISchema(original, {
		schema: JSON.stringify(nestedAddPatch),
	});
	expect(added.properties.address?.properties?.city).toEqual(
		nestedSchema.properties.address.properties.city,
	);
	expect(added.properties.members?.items?.properties?.name).toEqual(
		nestedSchema.properties.members.items.properties.name,
	);
	const next = applyAISchema(added, { schema: JSON.stringify(nestedPatch) });
	expect(next.properties.address).toMatchObject({
		required: ["city"],
		default: nestedSchema.properties.address.default,
		properties: {
			country: nestedSchema.properties.address.properties.country,
			city: {
				...nestedSchema.properties.address.properties.city,
				label: "Home city",
			},
			postcode: { type: "string" },
		},
	});
	expect(next.properties.members).toMatchObject({
		minItems: 1,
		default: nestedSchema.properties.members.default,
		items: {
			required: ["name"],
			description: "Member template",
			properties: {
				name: {
					...nestedSchema.properties.members.items.properties.name,
					label: "Member name",
				},
				active: nestedSchema.properties.members.items.properties.active,
				notes: nestedSchema.properties.members.items.properties.notes,
				phone: { type: "string" },
			},
		},
	});
	const schema = formSchemaToZod(
		next as unknown as Parameters<typeof formSchemaToZod>[0],
	);
	expect(
		schema.safeParse({ address: { country: "CA" }, members: [{ name: "Ada" }] })
			.success,
	).toBe(false);
	expect(
		schema.safeParse({
			address: { country: "CA", city: "Toronto" },
			members: [{ active: true }],
		}).success,
	).toBe(false);
	expect(
		schema.safeParse({
			address: { country: "CA", city: "Toronto", postcode: "M5V" },
			members: [{ name: "Ada", phone: "123" }],
		}).success,
	).toBe(true);
	expect(original).toEqual(nestedSchema);
});
it("replaces supplied array metadata and rejects unsupported tuple items without changing the original", () => {
	const original = structuredClone(nestedSchema);
	const next = applyAISchema(original, {
		schema: JSON.stringify({
			type: "object",
			properties: {
				address: {
					type: "object",
					required: ["country"],
					properties: { country: { type: "string", enum: ["CA"] } },
				},
				members: {
					type: "array",
					default: [],
					items: { type: "object", required: ["active"] },
				},
			},
		}),
	});
	expect(next.properties.address?.required).toEqual(["country"]);
	expect(next.properties.address?.properties?.country?.enum).toEqual(["CA"]);
	expect(next.properties.members?.default).toEqual([]);
	expect(next.properties.members?.items?.required).toEqual(["active"]);
	expect(() =>
		applyAISchema(original, {
			schema: JSON.stringify({
				type: "object",
				properties: { members: { type: "array", items: [{ type: "string" }] } },
			}),
		}),
	).toThrow();
	expect(original).toEqual(nestedSchema);
});
it.each(["__proto__", "constructor", "prototype"])(
	"keeps nested unsafe property %s inert without mutation",
	(key) => {
		const original = structuredClone(nestedSchema);
		const properties = Object.fromEntries([[key, { type: "string" }]]);
		const input = {
			schema: JSON.stringify({
				type: "object",
				properties: { address: { type: "object", properties } },
			}),
		};
		if (key === "__proto__")
			expect(applyAISchema(original, input)).toEqual(original);
		else expect(() => applyAISchema(original, input)).toThrow();
		expect(original).toEqual(nestedSchema);
		expect(Object.hasOwn(Object.prototype, "type")).toBe(false);
	},
);
