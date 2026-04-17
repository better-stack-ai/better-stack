import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { buildFieldConfigFromJsonSchema } from "@workspace/ui/components/auto-form/helpers";

/**
 * Verifies that buildFieldConfigFromJsonSchema recurses into nested objects AND
 * array items.properties so that per-property metadata (label, placeholder,
 * fieldType, etc.) reaches the AutoForm renderer for fields nested inside
 * arrays-of-objects.
 *
 * The CMS auto-form pipeline relies on this for blend-style schemas like:
 *   components: z.array(z.object({
 *     name: z.string(),
 *     compoundId: z.object({ id: z.string() }).meta({ fieldType: "relation" }),
 *   }))
 *
 * Without this recursion, AutoFormArray would render the inner items with no
 * field config — placeholders and custom field components on nested array
 * properties would silently disappear.
 */

type ConfigMap = Record<string, Record<string, unknown> | undefined>;

function getConfig(map: ConfigMap, key: string): Record<string, unknown> {
	const value = map[key];
	if (!value) {
		throw new Error(`Expected config entry for "${key}" but got undefined`);
	}
	return value;
}

describe("buildFieldConfigFromJsonSchema — nested + array recursion", () => {
	it("propagates per-item placeholders into the array's field config", () => {
		const schema = z.object({
			components: z
				.array(
					z.object({
						name: z.string().meta({ placeholder: "e.g. GHK-Cu" }),
						doseLow: z.coerce.number().meta({ placeholder: "1" }),
					}),
				)
				.default([])
				.meta({ description: "Blend components" }),
		});

		const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
		const config = buildFieldConfigFromJsonSchema(jsonSchema) as ConfigMap;
		const components = getConfig(config, "components") as ConfigMap & {
			description?: string;
		};

		expect(components.description).toBe("Blend components");

		// Per-item configs must live as keys on the array's FieldConfigObject so
		// that AutoFormObject (rendered per array item) can look them up by name.
		const nameConfig = getConfig(components, "name") as {
			inputProps?: { placeholder?: string };
		};
		expect(nameConfig.inputProps?.placeholder).toBe("e.g. GHK-Cu");

		const doseLowConfig = getConfig(components, "doseLow") as {
			inputProps?: { placeholder?: string };
		};
		expect(doseLowConfig.inputProps?.placeholder).toBe("1");
	});

	it("propagates fieldType (textarea) into array items", () => {
		const schema = z.object({
			components: z
				.array(
					z.object({
						notes: z.string().meta({ fieldType: "textarea" }),
					}),
				)
				.default([]),
		});

		const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
		const config = buildFieldConfigFromJsonSchema(jsonSchema) as ConfigMap;
		const components = getConfig(config, "components") as ConfigMap;
		const notesConfig = getConfig(components, "notes") as {
			fieldType?: string;
		};

		expect(notesConfig.fieldType).toBe("textarea");
	});

	it("invokes a custom fieldComponent for nested array fields", () => {
		const schema = z.object({
			components: z
				.array(
					z.object({
						compoundId: z
							.object({ id: z.string() })
							.meta({ fieldType: "relation" }),
					}),
				)
				.default([]),
		});

		const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;

		const RelationStub = () => null;
		const config = buildFieldConfigFromJsonSchema(jsonSchema, {
			relation: RelationStub,
		}) as ConfigMap;

		const components = getConfig(config, "components") as ConfigMap;
		const compoundIdConfig = getConfig(components, "compoundId") as {
			fieldType?: unknown;
		};

		// fieldComponents["relation"] should be wired up for the nested array
		// element field, not just top-level fields.
		expect(typeof compoundIdConfig.fieldType).toBe("function");
	});

	it("still propagates per-property configs into nested objects (regression)", () => {
		const schema = z.object({
			seo: z.object({
				title: z.string().meta({ placeholder: "Page title" }),
			}),
		});

		const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
		const config = buildFieldConfigFromJsonSchema(jsonSchema) as ConfigMap;
		const seo = getConfig(config, "seo") as ConfigMap;
		const titleConfig = getConfig(seo, "title") as {
			inputProps?: { placeholder?: string };
		};

		expect(titleConfig.inputProps?.placeholder).toBe("Page title");
	});

	it("warns and skips item properties whose names collide with reserved FieldConfigItem keys", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const schema = z.object({
			items: z
				.array(
					z.object({
						// "label" is a reserved key on FieldConfigItem and would
						// silently overwrite the array's own label if not guarded.
						label: z.string().meta({ placeholder: "Item label" }),
						value: z.string().meta({ placeholder: "Item value" }),
					}),
				)
				.default([])
				.meta({ description: "An array" }),
		});

		const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
		const config = buildFieldConfigFromJsonSchema(jsonSchema) as ConfigMap;
		const items = getConfig(config, "items") as ConfigMap & {
			description?: string;
		};

		// The array's own description should remain intact (not overwritten by
		// a nested item field also named "description").
		expect(items.description).toBe("An array");

		// Non-reserved item properties propagate normally.
		const valueConfig = getConfig(items, "value") as {
			inputProps?: { placeholder?: string };
		};
		expect(valueConfig.inputProps?.placeholder).toBe("Item value");

		// The "label" item property collides with a reserved FieldConfigItem
		// key and must be skipped + warned about.
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				'Array field "items" has an item property named "label"',
			),
		);
		warn.mockRestore();
	});
});
