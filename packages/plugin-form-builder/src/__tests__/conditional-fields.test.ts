import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	formSchemaToZod,
	zodToFormSchema,
} from "@workspace/ui/lib/schema-converter";
import { matchesShowIf } from "@workspace/ui/lib/form-visibility";
import { defaultComponents } from "@workspace/ui/components/form-builder";
import {
	fieldsToJSONSchema,
	jsonSchemaToFieldsAndSteps,
} from "@workspace/ui/components/form-builder/schema-utils";
import type { JSONSchema } from "@workspace/ui/components/form-builder/types";

const schema: JSONSchema = {
	type: "object",
	properties: {
		kind: { type: "string" },
		details: {
			type: "string",
			minLength: 3,
			showIf: { field: "kind", operator: "equals", value: "business" },
		},
		resume: {
			type: "string",
			fieldType: "file",
			format: "uri",
			pattern: "^https?://",
			stepGroup: 1,
		},
	},
	required: ["kind", "details", "resume"],
	steps: [
		{ id: "intro", title: "Introduction" },
		{
			id: "files",
			title: "Files",
			showIf: { field: "kind", operator: "in", value: ["business", "job"] },
		},
	],
};

describe("conditional forms", () => {
	it.each([
		["equals", "a", "a", true],
		["equals", 1, "1", false],
		["notEquals", "b", "a", true],
		["in", "b", ["a", "b"], true],
		["in", "b", "b", false],
		["isTruthy", false, undefined, false],
		["isTruthy", "yes", undefined, true],
	] as const)(
		"evaluates %s without coercion",
		(operator, actual, value, expected) => {
			expect(
				matchesShowIf({ field: "source", operator, value }, { source: actual }),
			).toBe(expected);
		},
	);

	it("strips hidden field/step values before required and type validation", () => {
		const validator = formSchemaToZod(schema);
		expect(
			validator.parse({
				kind: "personal",
				details: 123,
				resume: { stale: true },
			}),
		).toEqual({ kind: "personal" });
		expect(validator.parse({ kind: "personal" })).toEqual({ kind: "personal" });
		expect(validator.safeParse({ kind: "business" }).success).toBe(false);
		expect(
			validator.safeParse({
				kind: "business",
				details: "ok",
				resume: "https://example.com/a.pdf",
			}).success,
		).toBe(false);
		expect(
			validator.parse({
				kind: "business",
				details: "valid",
				resume: "https://example.com/a.pdf",
			}),
		).toEqual({
			kind: "business",
			details: "valid",
			resume: "https://example.com/a.pdf",
		});
	});

	it("evaluates rules with schema defaults and preserves metadata after cloning", () => {
		const input = {
			type: "object",
			properties: {
				enabled: { type: "boolean", default: true },
				note: {
					type: "string",
					showIf: { field: "enabled", operator: "isTruthy" as const },
				},
			},
			required: ["note"],
		};
		expect(formSchemaToZod(input).safeParse({}).success).toBe(false);
		expect(formSchemaToZod(input).parse({ note: "hello" })).toEqual({
			enabled: true,
			note: "hello",
		});
		const output = zodToFormSchema(
			formSchemaToZod(schema).meta({ title: "Cloned form" }),
		);
		expect(output.properties?.details?.showIf).toEqual(
			schema.properties.details?.showIf,
		);
	});

	it("round-trips field and step rules plus file fields through the visual schema", () => {
		const parsed = jsonSchemaToFieldsAndSteps(schema, defaultComponents);
		expect(parsed.fields.find((field) => field.id === "resume")?.type).toBe(
			"file",
		);
		const output = fieldsToJSONSchema(
			parsed.fields,
			defaultComponents,
			parsed.steps,
		);
		expect(output.properties.details?.showIf).toEqual(
			schema.properties.details?.showIf,
		);
		expect(output.steps?.[1]?.showIf).toEqual(schema.steps?.[1]?.showIf);
	});

	it("preserves Zod field and step metadata", () => {
		const result = zodToFormSchema(
			z.object({
				enabled: z.boolean(),
				note: z
					.string()
					.meta({ showIf: { field: "enabled", operator: "isTruthy" } }),
			}),
			{ steps: schema.steps },
		);
		expect(result.properties?.note?.showIf).toEqual({
			field: "enabled",
			operator: "isTruthy",
		});
		expect(result.steps).toEqual(schema.steps);
		expect(formSchemaToZod(result).parse({ enabled: false, note: 42 })).toEqual(
			{ enabled: false },
		);
	});

	it("validates and strips nested object and array item conditions", () => {
		const item = {
			type: "object",
			properties: {
				enabled: { type: "boolean" },
				note: {
					type: "string",
					minLength: 2,
					showIf: { field: "enabled", operator: "isTruthy" as const },
				},
			},
			required: ["enabled", "note"],
		};
		const validator = formSchemaToZod({
			type: "object",
			properties: { profile: item, items: { type: "array", items: item } },
			required: ["profile", "items"],
		});
		expect(
			validator.parse({
				profile: { enabled: false, note: 1 },
				items: [
					{ enabled: false, note: 2 },
					{ enabled: true, note: "yes" },
				],
			}),
		).toEqual({
			profile: { enabled: false },
			items: [{ enabled: false }, { enabled: true, note: "yes" }],
		});
		const result = validator.safeParse({
			profile: { enabled: false },
			items: [{ enabled: true }],
		});
		expect(result.success).toBe(false);
		if (!result.success)
			expect(result.error.issues[0]?.path).toEqual(["items", 0, "note"]);
	});

	it("honors root stepGroupMap and keeps unrelated unknown data", () => {
		const validator = formSchemaToZod({
			...schema,
			properties: {
				...schema.properties,
				resume: { ...schema.properties.resume!, stepGroup: undefined },
			},
			stepGroupMap: { resume: 1 },
		});
		expect(
			validator.parse({ kind: "personal", resume: "stale", future: "keep" }),
		).toEqual({ kind: "personal", future: "keep" });
	});
});

it("resolves chained conditions before validating and remains stable after parsing", () => {
	const validator = formSchemaToZod({
		type: "object",
		properties: {
			c: {
				type: "string",
				showIf: { field: "b", operator: "notEquals", value: true },
			},
			b: { type: "boolean", showIf: { field: "a", operator: "isTruthy" } },
			a: { type: "boolean" },
		},
		required: ["c"],
	});
	expect(validator.safeParse({ a: false, b: true }).success).toBe(false);
	const result = validator.parse({ a: false, b: true, c: "visible" });
	expect(result).toEqual({ a: false, c: "visible" });
	expect(validator.parse(result)).toEqual(result);
});

it("keeps cyclic visibility hidden and independent of stale answers", () => {
	const validator = formSchemaToZod({
		type: "object",
		properties: {
			a: {
				type: "boolean",
				showIf: { field: "b", operator: "notEquals", value: true },
			},
			b: { type: "boolean", showIf: { field: "a", operator: "isTruthy" } },
		},
	});
	const result = validator.parse({ a: true, b: true });
	expect(result).toEqual({});
	expect(validator.parse(result)).toEqual(result);
});

it("uses hidden step answers consistently in chained conditions", () => {
	const validator = formSchemaToZod({
		type: "object",
		properties: {
			a: { type: "boolean" },
			b: { type: "boolean", stepGroup: 1 },
			c: { type: "string", stepGroup: 2 },
		},
		required: ["c"],
		steps: [
			{ id: "first", title: "First" },
			{
				id: "second",
				title: "Second",
				showIf: { field: "a", operator: "isTruthy" },
			},
			{
				id: "third",
				title: "Third",
				showIf: { field: "b", operator: "notEquals", value: true },
			},
		],
	});
	expect(validator.safeParse({ a: false, b: true }).success).toBe(false);
	const result = validator.parse({ a: false, b: true, c: "visible" });
	expect(result).toEqual({ a: false, c: "visible" });
	expect(validator.parse(result)).toEqual(result);
});

it.each([true, false])(
	"retains conditional object and array defaults (required: %s)",
	(required) => {
		const item = {
			type: "object",
			properties: {
				enabled: { type: "boolean" },
				note: {
					type: "string",
					showIf: { field: "enabled", operator: "isTruthy" as const },
				},
			},
			required: ["enabled", "note"],
		};
		const validator = formSchemaToZod({
			type: "object",
			properties: {
				profile: { ...item, default: { enabled: false, note: "hidden" } },
				items: { type: "array", items: item, default: [], maxItems: 1 },
			},
			required: required ? ["profile", "items"] : [],
		});
		expect(validator.parse({})).toEqual({
			profile: { enabled: false },
			items: [],
		});
		expect(
			validator.parse({ items: [{ enabled: true, note: "shown" }] }),
		).toEqual({
			profile: { enabled: false },
			items: [{ enabled: true, note: "shown" }],
		});
		expect(validator.safeParse({ items: [{ enabled: true }] }).success).toBe(
			false,
		);
		expect(
			validator.safeParse({ items: [{ enabled: false }, { enabled: false }] })
				.success,
		).toBe(false);
	},
);
