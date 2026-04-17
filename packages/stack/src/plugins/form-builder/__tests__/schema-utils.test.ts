/**
 * Tests for the JSON Schema ↔ FormBuilderField conversion utilities.
 *
 * The form-builder ecosystem accepts two flavours of multi-step encoding:
 *  - **Path A**: per-property `stepGroup` on each field (what the visual
 *    FormBuilder writes on save — canonical wire format).
 *  - **Path B**: root-level `stepGroupMap` (what `zodToFormSchema(schema, {
 *    steps, stepGroupMap })` produces and what `SteppedAutoForm` reads).
 *
 * Both must be accepted on read so a Zod-seeded form opens with all fields
 * correctly assigned to their step tabs in the admin canvas. Without Path B
 * support, every field in a Zod-seeded multi-step form collapses onto step 0.
 *
 * @see packages/ui/src/components/form-builder/schema-utils.ts
 * @see packages/ui/src/lib/schema-converter.ts
 */

import { describe, it, expect } from "vitest";
import {
	fieldsToJSONSchema,
	jsonSchemaToFieldsAndSteps,
} from "@workspace/ui/components/form-builder/schema-utils";
import { defaultComponents } from "@workspace/ui/components/form-builder";
import type {
	JSONSchema,
	FormStep,
} from "@workspace/ui/components/form-builder/types";

const STEPS: FormStep[] = [
	{ id: "goals", title: "Your goals" },
	{ id: "experience", title: "Experience" },
	{ id: "constraints", title: "Constraints" },
];

describe("jsonSchemaToFieldsAndSteps", () => {
	describe("core usage", () => {
		it("returns empty result for null/undefined schema", () => {
			expect(jsonSchemaToFieldsAndSteps(null, defaultComponents)).toEqual({
				fields: [],
				steps: [],
			});
			expect(jsonSchemaToFieldsAndSteps(undefined, defaultComponents)).toEqual({
				fields: [],
				steps: [],
			});
		});

		it("returns empty result when schema has no properties", () => {
			const schema = { type: "object", properties: {} } as JSONSchema;
			expect(jsonSchemaToFieldsAndSteps(schema, defaultComponents)).toEqual({
				fields: [],
				steps: [],
			});
		});

		it("parses a flat single-step schema with mixed field types", () => {
			const schema: JSONSchema = {
				type: "object",
				properties: {
					name: { type: "string", label: "Full Name" },
					email: { type: "string", format: "email", label: "Email" },
					age: { type: "number", label: "Age", minimum: 0 },
				},
				required: ["name", "email"],
			};

			const { fields, steps } = jsonSchemaToFieldsAndSteps(
				schema,
				defaultComponents,
			);

			expect(steps).toEqual([]);
			expect(fields).toHaveLength(3);

			const [name, email, age] = fields;
			expect(name).toMatchObject({
				id: "name",
				type: "text",
				props: { label: "Full Name", required: true },
			});
			expect(email).toMatchObject({
				id: "email",
				type: "email",
				props: { label: "Email", required: true },
			});
			expect(age).toMatchObject({
				id: "age",
				type: "number",
				props: { label: "Age", required: false },
			});
			expect(name?.stepGroup).toBeUndefined();
			expect(email?.stepGroup).toBeUndefined();
			expect(age?.stepGroup).toBeUndefined();
		});

		it("preserves the steps array on the output", () => {
			const schema: JSONSchema = {
				type: "object",
				properties: {
					name: { type: "string", label: "Name", stepGroup: 0 },
				},
				steps: STEPS,
			};

			const { steps } = jsonSchemaToFieldsAndSteps(schema, defaultComponents);
			expect(steps).toEqual(STEPS);
		});
	});

	describe("multi-step: Path A — per-property stepGroup", () => {
		// Canonical format written by the visual FormBuilder when saving.
		const schema: JSONSchema = {
			type: "object",
			properties: {
				name: { type: "string", label: "Name", stepGroup: 0 },
				email: {
					type: "string",
					format: "email",
					label: "Email",
					stepGroup: 0,
				},
				experience: {
					type: "string",
					enum: ["beginner", "advanced"],
					label: "Experience",
					stepGroup: 1,
				},
				agree: {
					type: "boolean",
					fieldType: "switch",
					label: "I agree",
					stepGroup: 2,
				},
			},
			steps: STEPS,
		};

		it("assigns each field to the step encoded on its property", () => {
			const { fields } = jsonSchemaToFieldsAndSteps(schema, defaultComponents);

			expect(fields).toHaveLength(4);
			const byId = new Map(fields.map((f) => [f.id, f]));
			expect(byId.get("name")?.stepGroup).toBe(0);
			expect(byId.get("email")?.stepGroup).toBe(0);
			expect(byId.get("experience")?.stepGroup).toBe(1);
			expect(byId.get("agree")?.stepGroup).toBe(2);
		});
	});

	describe("multi-step: Path B — root-level stepGroupMap (regression)", () => {
		// What `zodToFormSchema(LooksmaxQuizSchema, { steps, stepGroupMap })` writes.
		// Before the fix, every field collapsed onto step 0 because the parser
		// only consulted per-property `stepGroup`.
		const schema: JSONSchema = {
			type: "object",
			properties: {
				primaryGoal: {
					type: "string",
					enum: ["skin", "hair", "jaw", "lean", "all"],
					label: "Primary goal",
					fieldType: "radio",
				},
				experience: {
					type: "string",
					enum: ["none", "some-peptides", "full-cycle-history"],
					label: "Experience",
					fieldType: "radio",
				},
				riskTolerance: {
					type: "string",
					enum: ["low", "moderate", "high"],
					label: "Risk tolerance",
					fieldType: "radio",
				},
				noInjections: {
					type: "boolean",
					fieldType: "switch",
					label: "No injections",
				},
				email: {
					type: "string",
					format: "email",
					label: "Email",
				},
			},
			steps: STEPS,
			stepGroupMap: {
				primaryGoal: 0,
				experience: 1,
				riskTolerance: 1,
				noInjections: 2,
				email: 2,
			},
		};

		it("assigns step from root-level stepGroupMap when properties omit stepGroup", () => {
			const { fields, steps } = jsonSchemaToFieldsAndSteps(
				schema,
				defaultComponents,
			);

			expect(steps).toEqual(STEPS);
			expect(fields).toHaveLength(5);

			const byId = new Map(fields.map((f) => [f.id, f]));
			expect(byId.get("primaryGoal")?.stepGroup).toBe(0);
			expect(byId.get("experience")?.stepGroup).toBe(1);
			expect(byId.get("riskTolerance")?.stepGroup).toBe(1);
			expect(byId.get("noInjections")?.stepGroup).toBe(2);
			expect(byId.get("email")?.stepGroup).toBe(2);
		});

		it("works for fields that fall back to the generic text component", () => {
			// Fields with unknown shapes fall through to the fallback `text` field
			// in propertiesToFields. The fix must apply there too.
			const schemaWithUnknown: JSONSchema = {
				type: "object",
				properties: {
					mystery: {
						// no `type` → no component matches → fallback to text
						label: "Mystery field",
					} as JSONSchema["properties"][string],
				},
				steps: STEPS,
				stepGroupMap: { mystery: 2 },
			};

			const { fields } = jsonSchemaToFieldsAndSteps(
				schemaWithUnknown,
				defaultComponents,
			);

			expect(fields).toHaveLength(1);
			expect(fields[0]?.id).toBe("mystery");
			expect(fields[0]?.stepGroup).toBe(2);
		});
	});

	describe("multi-step: precedence when both encodings are present", () => {
		it("per-property stepGroup wins over stepGroupMap", () => {
			const schema: JSONSchema = {
				type: "object",
				properties: {
					primary: {
						type: "string",
						label: "Primary",
						stepGroup: 0, // per-property says step 0
					},
					secondary: {
						type: "string",
						label: "Secondary",
						stepGroup: 1, // per-property says step 1
					},
					tertiary: {
						type: "string",
						label: "Tertiary",
						// no per-property — should use map
					},
				},
				steps: STEPS,
				stepGroupMap: {
					primary: 99, // map disagrees, but per-property wins
					secondary: 99,
					tertiary: 2, // map applies
				},
			};

			const { fields } = jsonSchemaToFieldsAndSteps(schema, defaultComponents);

			const byId = new Map(fields.map((f) => [f.id, f]));
			expect(byId.get("primary")?.stepGroup).toBe(0);
			expect(byId.get("secondary")?.stepGroup).toBe(1);
			expect(byId.get("tertiary")?.stepGroup).toBe(2);
		});

		it("missing entries in stepGroupMap leave stepGroup undefined", () => {
			const schema: JSONSchema = {
				type: "object",
				properties: {
					mapped: { type: "string", label: "Mapped" },
					unmapped: { type: "string", label: "Unmapped" },
				},
				steps: STEPS,
				stepGroupMap: { mapped: 1 },
			};

			const { fields } = jsonSchemaToFieldsAndSteps(schema, defaultComponents);
			const byId = new Map(fields.map((f) => [f.id, f]));
			expect(byId.get("mapped")?.stepGroup).toBe(1);
			expect(byId.get("unmapped")?.stepGroup).toBeUndefined();
		});
	});
});

describe("fieldsToJSONSchema → jsonSchemaToFieldsAndSteps round-trip", () => {
	it("normalises Path B (stepGroupMap) input to Path A (per-property) output", () => {
		// This is the workflow that breaks the original bug: open a Zod-seeded
		// form (Path B), save without changes — the FormBuilder writes Path A.
		const inputSchema: JSONSchema = {
			type: "object",
			properties: {
				goal: { type: "string", label: "Goal" },
				risk: { type: "string", label: "Risk" },
			},
			steps: STEPS.slice(0, 2),
			stepGroupMap: { goal: 0, risk: 1 },
		};

		const { fields, steps } = jsonSchemaToFieldsAndSteps(
			inputSchema,
			defaultComponents,
		);

		// Re-serialise with the same steps array
		const roundTripped = fieldsToJSONSchema(fields, defaultComponents, steps);

		// Output uses Path A (per-property stepGroup) and drops the root-level map
		expect(roundTripped.properties.goal?.stepGroup).toBe(0);
		expect(roundTripped.properties.risk?.stepGroup).toBe(1);
		expect(roundTripped.steps).toEqual(STEPS.slice(0, 2));
		expect(
			(roundTripped as JSONSchema & { stepGroupMap?: unknown }).stepGroupMap,
		).toBeUndefined();

		// And re-parsing the normalised output produces the same field shape
		const reparsed = jsonSchemaToFieldsAndSteps(
			roundTripped,
			defaultComponents,
		);
		const byIdOriginal = new Map(fields.map((f) => [f.id, f.stepGroup]));
		const byIdRoundTrip = new Map(
			reparsed.fields.map((f) => [f.id, f.stepGroup]),
		);
		expect(byIdRoundTrip).toEqual(byIdOriginal);
	});

	it("preserves Path A through a full round-trip", () => {
		const inputSchema: JSONSchema = {
			type: "object",
			properties: {
				name: { type: "string", label: "Name", stepGroup: 0 },
				email: {
					type: "string",
					format: "email",
					label: "Email",
					stepGroup: 1,
				},
			},
			steps: STEPS.slice(0, 2),
		};

		const { fields, steps } = jsonSchemaToFieldsAndSteps(
			inputSchema,
			defaultComponents,
		);
		const roundTripped = fieldsToJSONSchema(fields, defaultComponents, steps);

		expect(roundTripped.properties.name?.stepGroup).toBe(0);
		expect(roundTripped.properties.email?.stepGroup).toBe(1);
		expect(roundTripped.steps).toEqual(STEPS.slice(0, 2));
	});
});
