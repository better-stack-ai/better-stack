import type { DBAdapter as Adapter } from "@btst/db";
import type {
	ContentType,
	ContentRelation,
	RelationConfig,
	RelationValue,
} from "../types";

/**
 * Shape of a property inside a content type's stored JSON Schema.
 * Relation fields carry `fieldType: "relation"` and a `relation` descriptor.
 */
interface JsonSchemaProperty {
	fieldType?: string;
	relation?: RelationConfig;
	type?: string;
	items?: JsonSchemaProperty;
	[key: string]: unknown;
}

interface JsonSchemaWithProperties {
	properties?: Record<string, JsonSchemaProperty>;
	[key: string]: unknown;
}

/**
 * Extract relation field configurations from a content type's JSON Schema.
 *
 * Returns a map of field name -> RelationConfig for every field declared
 * with `fieldType: "relation"` and a populated `relation` descriptor.
 */
export function extractRelationFields(
	contentType: ContentType,
): Record<string, RelationConfig> {
	const jsonSchema = JSON.parse(
		contentType.jsonSchema,
	) as JsonSchemaWithProperties;
	const properties = jsonSchema.properties || {};
	const relationFields: Record<string, RelationConfig> = {};

	for (const [fieldName, fieldSchema] of Object.entries(properties)) {
		if (fieldSchema.fieldType === "relation" && fieldSchema.relation) {
			relationFields[fieldName] = fieldSchema.relation;
		}
	}

	return relationFields;
}

/**
 * Type guard: value is a `{ _new: true, data: ... }` descriptor used by the
 * HTTP endpoints to request inline creation of a related item on save.
 */
export function isNewRelationValue(
	value: unknown,
): value is { _new: true; data: Record<string, unknown> } {
	return (
		typeof value === "object" &&
		value !== null &&
		"_new" in value &&
		(value as { _new: unknown })._new === true &&
		"data" in value
	);
}

/**
 * Type guard: value is an existing relation reference (`{ id: string }`).
 */
export function isExistingRelationValue(
	value: unknown,
): value is { id: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		typeof (value as { id: unknown }).id === "string"
	);
}

/**
 * Collect relation target IDs out of a content item's data payload,
 * grouped by relation field name.
 *
 * Only processes fields that are:
 * - present in `data`
 * - declared as relations in `relationFields`
 * - hold existing `{ id }` references (or arrays of them)
 *
 * Unlike `processRelationsInData` in the HTTP route, this does NOT create
 * inline `_new` items — callers passing `_new` values will have them
 * silently ignored. Programmatic callers (seeds, imports) are expected to
 * supply pre-created IDs.
 *
 * Returns a map of `{ fieldName: targetIds[] }` ready to hand to
 * {@link syncRelations}.
 */
export function collectExistingRelationIds(
	data: Record<string, unknown>,
	relationFields: Record<string, RelationConfig>,
): Record<string, string[]> {
	const relationIds: Record<string, string[]> = {};

	for (const [fieldName, relationConfig] of Object.entries(relationFields)) {
		if (!(fieldName in data)) continue;

		const fieldValue = data[fieldName];
		if (!fieldValue) {
			relationIds[fieldName] = [];
			continue;
		}

		const ids: string[] = [];

		if (relationConfig.type === "belongsTo") {
			const value = fieldValue as RelationValue;
			if (isExistingRelationValue(value)) {
				ids.push(value.id);
			}
		} else {
			// hasMany / manyToMany — expect an array of { id }
			const values = (
				Array.isArray(fieldValue) ? fieldValue : []
			) as RelationValue[];

			for (const value of values) {
				if (isExistingRelationValue(value)) {
					ids.push(value.id);
				}
			}
		}

		relationIds[fieldName] = ids;
	}

	return relationIds;
}

/**
 * Sync relations in the junction table for a content item.
 *
 * Only updates relations for fields explicitly present in `relationIds`.
 * Fields not included are left untouched — this preserves existing
 * relations during partial updates.
 *
 * For each included field, existing junction rows (matching sourceId +
 * fieldName) are deleted and replaced with the provided target IDs.
 */
export async function syncRelations(
	adapter: Adapter,
	sourceId: string,
	relationIds: Record<string, string[]>,
): Promise<void> {
	for (const [fieldName, targetIds] of Object.entries(relationIds)) {
		await adapter.delete({
			model: "contentRelation",
			where: [
				{ field: "sourceId", value: sourceId, operator: "eq" as const },
				{ field: "fieldName", value: fieldName, operator: "eq" as const },
			],
		});

		for (const targetId of targetIds) {
			await adapter.create<ContentRelation>({
				model: "contentRelation",
				data: {
					sourceId,
					targetId,
					fieldName,
					createdAt: new Date(),
				},
			});
		}
	}
}
