import { z } from "zod";
import type {
	JSONSchema,
	JSONSchemaProperty,
} from "@workspace/ui/components/form-builder/types";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";

const condition = z
	.object({
		field: z.string().min(1),
		operator: z.enum(["equals", "notEquals", "in", "isTruthy"]),
		value: z.unknown().optional(),
	})
	.refine(
		(rule) => rule.operator !== "in" || Array.isArray(rule.value),
		"The in operator needs an array",
	);
const property: z.ZodType<JSONSchemaProperty> = z.lazy(() =>
	z
		.object({
			type: z.enum([
				"string",
				"number",
				"integer",
				"boolean",
				"object",
				"array",
			]),
			showIf: condition.optional(),
			properties: z.record(z.string(), property).optional(),
			items: property.optional(),
			stepGroup: z.number().int().nonnegative().optional(),
		})
		.passthrough(),
) as z.ZodType<JSONSchemaProperty>;
const schemaPatch = z
	.object({
		type: z.literal("object"),
		properties: z.record(z.string(), property),
		required: z.array(z.string()).optional(),
		steps: z
			.array(
				z.object({
					id: z.string().min(1),
					title: z.string().min(1),
					showIf: condition.optional(),
				}),
			)
			.optional(),
		stepGroupMap: z
			.record(z.string(), z.number().int().nonnegative())
			.optional(),
	})
	.passthrough();

/** Merge an AI schema patch without discarding unrelated unsaved fields. */
export function applyAISchema(
	current: JSONSchema | undefined,
	input: unknown,
): JSONSchema {
	const args = z
		.object({ schema: z.string().min(2).max(200000) })
		.strict()
		.parse(input);
	const patch = schemaPatch.parse(JSON.parse(args.schema));
	const properties = {
		...current?.properties,
		...Object.fromEntries(
			Object.entries(patch.properties).map(([key, value]) => [
				key,
				{ ...current?.properties[key], ...value },
			]),
		),
	};
	const next = { ...current, ...patch, properties } as JSONSchema;
	const validate = (fields: Record<string, JSONSchemaProperty>) => {
		for (const [key, field] of Object.entries(fields)) {
			if (["__proto__", "prototype", "constructor"].includes(key))
				throw new Error("Invalid field name");
			if (field.showIf && !Object.hasOwn(fields, field.showIf.field))
				throw new Error("Visibility condition references an unknown field");
			if (field.properties) validate(field.properties);
			if (field.items?.properties) validate(field.items.properties);
		}
	};
	validate(properties);
	if (next.required?.some((key) => !Object.hasOwn(properties, key)))
		throw new Error("Required references an unknown field");
	if (
		next.steps?.some(
			(step) => step.showIf && !Object.hasOwn(properties, step.showIf.field),
		)
	)
		throw new Error("Step condition references an unknown field");
	if (
		new Set(next.steps?.map((step) => step.id)).size !==
		(next.steps?.length ?? 0)
	)
		throw new Error("Step IDs must be unique");
	const stepCount = Math.max(1, next.steps?.length ?? 0);
	if (
		Object.values(properties).some(
			({ stepGroup }) =>
				stepGroup !== undefined &&
				(!Number.isInteger(stepGroup) ||
					stepGroup < 0 ||
					stepGroup >= stepCount),
		)
	)
		throw new Error("Field references an unknown step");
	if (
		Object.entries(next.stepGroupMap ?? {}).some(
			([field, step]) =>
				!Object.hasOwn(properties, field) ||
				!Number.isInteger(step) ||
				step < 0 ||
				step >= stepCount,
		)
	)
		throw new Error("Step map references an unknown field or step");
	formSchemaToZod(next as unknown as Parameters<typeof formSchemaToZod>[0]);
	return next;
}
