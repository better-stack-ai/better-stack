import type { DBAdapter as Adapter } from "@btst/db";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import {
	defineOperation,
	type DeepReadonly,
	OperationHttpError,
	type OperationContext,
	type OperationData,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { formSchemaToZod } from "@workspace/ui/lib/schema-converter";
import { cmsPermissions } from "../permissions";
import {
	createListContentQuerySchema,
	DEFAULT_MAX_PAGE_SIZE,
} from "../schemas";
import type {
	CMSBackendHooks,
	CMSCreateOperationContext,
	CMSDeleteOperationContext,
	CMSOperationData,
	CMSOperationLifecycleContext,
	CMSUpdateOperationContext,
	ContentItem,
	ContentItemWithType,
	ContentRelation,
	ContentType,
	InverseRelation,
	RelationValue,
	SerializedContentItemWithType,
} from "../types";
import { slugify } from "../utils";
import {
	getAllContentItems,
	getContentItemBySlug,
	serializeContentItemWithType,
	serializeContentType,
} from "./getters";
import {
	extractRelationFields,
	isExistingRelationValue,
	isNewRelationValue,
	syncRelations,
} from "./relations";

type DataAdapter = Omit<Adapter, "transaction">;

function operationContentType(
	contentType: ReturnType<typeof serializeContentType>,
) {
	return { ...contentType };
}

function operationContentItem(item: SerializedContentItemWithType) {
	const {
		parsedData,
		contentType,
		_relations: _relations,
		...serializedItem
	} = item;
	return {
		...serializedItem,
		parsedData: parsedData as Record<string, OperationData>,
		...(contentType ? { contentType: operationContentType(contentType) } : {}),
	};
}

function operationContentList(
	result: Awaited<ReturnType<typeof getAllContentItems>>,
) {
	return {
		items: result.items.map(operationContentItem),
		total: result.total,
		...(result.limit !== undefined ? { limit: result.limit } : {}),
		...(result.offset !== undefined ? { offset: result.offset } : {}),
	};
}

const JSONValueSchema: z.ZodType<OperationData> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(JSONValueSchema),
		z.record(z.string(), JSONValueSchema),
	]),
);

// Runtime validation remains recursive and JSON-safe. The intentionally broad
// static record avoids TypeScript's recursive-instantiation ceiling for CMS's
// schema-defined payloads; the operation boundary deep-freezes the parsed value.
const CMSDataSchema: z.ZodType<Record<string, any>> = z.record(
	z.string(),
	JSONValueSchema,
);
const EmptyInputSchema = z.object({});

export const CMSContentTypeParamsSchema = z.object({
	slug: z.string().min(1),
});
export const CMSContentItemParamsSchema = z.object({
	typeSlug: z.string().min(1),
	id: z.string().min(1),
});
export const CMSCreateContentItemBodySchema = z.object({
	slug: z.string().min(1),
	data: CMSDataSchema,
});
export const CMSUpdateContentItemBodySchema = z.object({
	slug: z.string().min(1).optional(),
	data: CMSDataSchema.optional(),
});

const ListContentTypesInputSchema = EmptyInputSchema;
const GetContentTypeInputSchema = CMSContentTypeParamsSchema;
const GetContentItemInputSchema = CMSContentItemParamsSchema;
const CreateContentItemInputSchema = z.object({
	typeSlug: z.string().min(1),
	body: CMSCreateContentItemBodySchema,
});
const UpdateContentItemInputSchema = z.object({
	typeSlug: z.string().min(1),
	id: z.string().min(1),
	body: CMSUpdateContentItemBodySchema,
});
const DeleteContentItemInputSchema = CMSContentItemParamsSchema;

type RecordReadFacts = PermissionFactsFor<typeof cmsPermissions.record.read>;
type RecordCreateFacts = PermissionFactsFor<
	typeof cmsPermissions.record.create
>;
type RecordUpdateFacts = PermissionFactsFor<
	typeof cmsPermissions.record.update
>;
type RecordDeleteFacts = PermissionFactsFor<
	typeof cmsPermissions.record.delete
>;

type RequestFields = {
	readonly request?: Request;
	readonly headers?: Headers;
	readonly userId?: string;
};

type CMSLifecycleContext<TInput, TFacts> = OperationContext<TInput, TFacts> &
	RequestFields & {
		readonly typeSlug?: string;
	};

/** A domain/HTTP error raised by a CMS operation. */
export class CMSOperationError extends OperationHttpError {
	constructor(
		statusCode: number,
		message: string,
		code = "CMS_OPERATION_ERROR",
		issues?: readonly unknown[],
	) {
		super(statusCode, message, code, issues);
		this.name = "CMSOperationError";
	}
}

function normalizeOperationError(error: unknown, fallback: string): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : fallback, {
		cause: error,
	});
}

async function runBeforeHook(
	hook: (() => Promise<void> | void) | undefined,
	defaultMessage: string,
) {
	if (!hook) return;
	try {
		await hook();
	} catch (error) {
		throw new CMSOperationError(
			403,
			error instanceof Error ? error.message : defaultMessage,
			"HOOK_DENIED",
		);
	}
}

function requestFields(
	context: OperationContext<unknown, unknown>,
): RequestFields {
	return {
		...(context.request
			? { request: context.request, headers: context.request.headers }
			: {}),
		...(context.identity ? { userId: context.identity.id } : {}),
	};
}

function createContext(
	context: OperationContext<
		z.output<typeof CreateContentItemInputSchema>,
		RecordCreateFacts
	>,
): CMSCreateOperationContext {
	return Object.freeze({
		...context,
		typeSlug: context.facts.contentType,
		body: context.input.body,
		...requestFields(context),
	});
}

function updateContext(
	context: OperationContext<
		z.output<typeof UpdateContentItemInputSchema>,
		RecordUpdateFacts
	>,
): CMSUpdateOperationContext {
	return Object.freeze({
		...context,
		typeSlug: context.facts.contentType,
		params: Object.freeze({
			typeSlug: context.facts.contentType,
			id: context.facts.recordId,
		}),
		body: context.input.body,
		...requestFields(context),
	});
}

function deleteContext(
	context: OperationContext<
		z.output<typeof DeleteContentItemInputSchema>,
		RecordDeleteFacts
	>,
): CMSDeleteOperationContext {
	return Object.freeze({
		...context,
		typeSlug: context.facts.contentType,
		params: Object.freeze({
			typeSlug: context.facts.contentType,
			id: context.facts.recordId,
		}),
		...requestFields(context),
	});
}

function genericContext<TInput, TFacts>(
	context: OperationContext<TInput, TFacts>,
	typeSlug?: string,
): CMSLifecycleContext<TInput, TFacts> {
	return Object.freeze({
		...context,
		...(typeSlug ? { typeSlug } : {}),
		...requestFields(context),
	});
}

function operationErrorContext<T extends CMSOperationLifecycleContext>(
	context: T,
	error: unknown,
): T & { readonly error: unknown } {
	return Object.freeze({ ...context, error });
}

function getContentTypeZodSchema(contentType: ContentType): z.ZodTypeAny {
	return formSchemaToZod(JSON.parse(contentType.jsonSchema));
}

async function getContentTypeOrThrow(
	adapter: DataAdapter,
	ensureSynced: () => Promise<void>,
	slug: string,
	message = "Content type not found",
): Promise<ContentType> {
	await ensureSynced();
	const contentType = await adapter.findOne<ContentType>({
		model: "contentType",
		where: [{ field: "slug", value: slug, operator: "eq" as const }],
	});
	if (!contentType) {
		throw new CMSOperationError(404, message, "CONTENT_TYPE_NOT_FOUND");
	}
	return contentType;
}

async function getRecordOrThrow(
	adapter: DataAdapter,
	ensureSynced: () => Promise<void>,
	typeSlug: string,
	id: string,
): Promise<ContentItemWithType> {
	await ensureSynced();
	const item = await adapter.findOne<ContentItemWithType>({
		model: "contentItem",
		where: [{ field: "id", value: id, operator: "eq" as const }],
		join: { contentType: true },
	});
	if (!item || item.contentType?.slug !== typeSlug) {
		throw new CMSOperationError(
			404,
			"Content item not found",
			"RECORD_NOT_FOUND",
		);
	}
	return item;
}

function recordFacts(item: ContentItemWithType): RecordReadFacts {
	if (!item.contentType) {
		throw new CMSOperationError(
			500,
			"Content item is missing its content type",
			"CONTENT_TYPE_JOIN_MISSING",
		);
	}
	return {
		contentType: item.contentType.slug,
		scope: "record",
		recordId: item.id,
		...(item.authorId ? { authorId: item.authorId } : {}),
	};
}

function collectionFacts(contentType: string): RecordReadFacts {
	return { contentType, scope: "collection" };
}

function assertRecordFacts(
	item: Pick<ContentItemWithType, "id" | "authorId"> & {
		contentType?: Pick<ContentType, "slug">;
	},
	facts: DeepReadonly<RecordReadFacts | RecordUpdateFacts | RecordDeleteFacts>,
) {
	if (
		!facts.recordId ||
		item.id !== facts.recordId ||
		item.contentType?.slug !== facts.contentType ||
		(item.authorId ?? undefined) !== facts.authorId
	) {
		throw staleRecordError();
	}
}

const AFFECTED_ROW_KEYS = [
	"rowCount",
	"affectedRows",
	"rowsAffected",
	"changes",
	"numUpdatedRows",
] as const;

function hasPositiveCount(value: unknown): boolean {
	if (typeof value === "number") return Number.isFinite(value) && value > 0;
	if (typeof value === "bigint") return value > 0n;
	return false;
}

function didUpdateContentItem(result: unknown, expectedId: string): boolean {
	if (typeof result === "number" || typeof result === "bigint") {
		return hasPositiveCount(result);
	}
	if (!result || typeof result !== "object") return false;
	const record = result as Record<string, unknown>;
	if ("count" in record) return hasPositiveCount(record.count);
	if (Array.isArray(result)) {
		return result.length > 0 && didUpdateContentItem(result[0], expectedId);
	}
	for (const key of AFFECTED_ROW_KEYS) {
		if (key in record) return hasPositiveCount(record[key]);
	}
	if ("meta" in record) {
		const meta = record.meta;
		return Boolean(
			meta &&
				typeof meta === "object" &&
				"changes" in meta &&
				hasPositiveCount((meta as Record<string, unknown>).changes),
		);
	}
	return record.id === expectedId;
}

function staleRecordError() {
	return new CMSOperationError(
		409,
		"Content item changed while authorization was being evaluated. Retry the operation.",
		"RECORD_STATE_CHANGED",
	);
}

function assertRecordSnapshot(
	current: ContentItemWithType,
	expected: ContentItemWithType,
) {
	if (
		current.id !== expected.id ||
		current.contentTypeId !== expected.contentTypeId ||
		current.contentType?.slug !== expected.contentType?.slug ||
		(current.authorId ?? undefined) !== (expected.authorId ?? undefined) ||
		current.slug !== expected.slug ||
		current.data !== expected.data ||
		current.updatedAt.getTime() !== expected.updatedAt.getTime()
	) {
		throw staleRecordError();
	}
}

interface RelationWritePlan {
	readonly processedData: Record<string, OperationData>;
	readonly relationIds: Record<string, string[]>;
	readonly newItems: readonly ContentItem[];
}

async function planRelatedItem(
	adapter: DataAdapter,
	targetContentType: ContentType,
	slug: string,
	data: Record<string, OperationData>,
	authorId?: string,
): Promise<ContentItem> {
	const validation = getContentTypeZodSchema(targetContentType).safeParse(data);
	if (!validation.success) {
		throw new CMSOperationError(
			400,
			`Validation failed for new ${targetContentType.slug}`,
			"RELATED_RECORD_VALIDATION_FAILED",
			validation.error.issues,
		);
	}
	const existing = await adapter.findOne<ContentItem>({
		model: "contentItem",
		where: [
			{
				field: "contentTypeId",
				value: targetContentType.id,
				operator: "eq" as const,
			},
			{ field: "slug", value: slug, operator: "eq" as const },
		],
	});
	if (existing) {
		throw relatedRecordSlugConflictError();
	}
	const now = new Date();
	return {
		id: globalThis.crypto.randomUUID(),
		contentTypeId: targetContentType.id,
		slug,
		data: JSON.stringify(validation.data),
		...(authorId ? { authorId } : {}),
		createdAt: now,
		updatedAt: now,
	};
}

function relatedRecordSlugConflictError() {
	return new CMSOperationError(
		409,
		"Inline related record could not be created because its slug is unavailable.",
		"RELATED_RECORD_SLUG_CONFLICT",
	);
}

async function planRelationsInData(
	adapter: DataAdapter,
	contentType: ContentType,
	data: Record<string, OperationData>,
	ensureSynced: () => Promise<void>,
	authorId?: string,
): Promise<RelationWritePlan> {
	const relationFields = extractRelationFields(contentType);
	const processedData = { ...data };
	const relationIds: Record<string, string[]> = {};
	const newItems: ContentItem[] = [];
	const plannedSlugs = new Set<string>();

	for (const [fieldName, relationConfig] of Object.entries(relationFields)) {
		if (!(fieldName in data)) continue;
		const fieldValue = data[fieldName];
		if (!fieldValue) {
			relationIds[fieldName] = [];
			continue;
		}
		const targetContentType = await getContentTypeOrThrow(
			adapter,
			ensureSynced,
			relationConfig.targetType,
			`Target content type "${relationConfig.targetType}" not found for relation field "${fieldName}"`,
		);
		const ids: string[] = [];
		if (relationConfig.type === "belongsTo") {
			const value = fieldValue as RelationValue;
			if (isNewRelationValue(value)) {
				const item = await resolvePlannedRelatedItem(
					adapter,
					targetContentType,
					value.data as Record<string, OperationData>,
					authorId,
					plannedSlugs,
					newItems,
				);
				ids.push(item.id);
				processedData[fieldName] = { id: item.id };
			} else if (isExistingRelationValue(value)) {
				ids.push(value.id);
			}
		} else {
			const values = (
				Array.isArray(fieldValue) ? fieldValue : []
			) as RelationValue[];
			const processedValues: Array<{ id: string }> = [];
			for (const value of values) {
				if (isNewRelationValue(value)) {
					const item = await resolvePlannedRelatedItem(
						adapter,
						targetContentType,
						value.data as Record<string, OperationData>,
						authorId,
						plannedSlugs,
						newItems,
					);
					ids.push(item.id);
					processedValues.push({ id: item.id });
				} else if (isExistingRelationValue(value)) {
					ids.push(value.id);
					processedValues.push({ id: value.id });
				}
			}
			processedData[fieldName] = processedValues;
		}
		relationIds[fieldName] = ids;
	}
	return { processedData, relationIds, newItems };
}

async function resolvePlannedRelatedItem(
	adapter: DataAdapter,
	targetContentType: ContentType,
	data: Record<string, OperationData>,
	authorId: string | undefined,
	plannedSlugs: Set<string>,
	newItems: ContentItem[],
) {
	const slug = slugify(
		(data.slug as string) ||
			(data.name as string) ||
			(data.title as string) ||
			`item-${Date.now()}`,
	);
	const key = `${targetContentType.id}\u0000${slug}`;
	if (plannedSlugs.has(key)) throw relatedRecordSlugConflictError();
	const planned = await planRelatedItem(
		adapter,
		targetContentType,
		slug,
		data,
		authorId,
	);
	plannedSlugs.add(key);
	newItems.push(planned);
	return planned;
}

async function applyRelationWritePlan(
	adapter: DataAdapter,
	plan: RelationWritePlan,
) {
	for (const item of plan.newItems) {
		const existing = await adapter.findOne<ContentItem>({
			model: "contentItem",
			where: [
				{
					field: "contentTypeId",
					value: item.contentTypeId,
					operator: "eq" as const,
				},
				{ field: "slug", value: item.slug, operator: "eq" as const },
			],
		});
		if (existing) throw staleRecordError();
		await adapter.create<ContentItem>({
			model: "contentItem",
			data: item,
		});
	}
}

interface RelationWriteAuthorization {
	readonly permissions: readonly (
		| ReturnType<typeof cmsPermissions.record.create>
		| ReturnType<typeof cmsPermissions.record.read>
	)[];
	readonly snapshot: readonly string[];
	readonly targets: readonly RecordReadFacts[];
}

interface RelationFilterAuthorization {
	readonly permission: ReturnType<typeof cmsPermissions.record.read>;
	readonly snapshot: string;
	readonly targetFacts: RecordReadFacts;
}

function relationFilterSnapshot(
	sourceContentType: ContentType,
	fieldName: string,
	relation: ReturnType<typeof extractRelationFields>[string],
	targetContentType: ContentType,
) {
	return JSON.stringify([
		sourceContentType.id,
		sourceContentType.slug,
		fieldName,
		relation.type,
		targetContentType.id,
		targetContentType.slug,
	]);
}

async function deriveRelationFilterAuthorization(
	adapter: Adapter,
	ensureSynced: () => Promise<void>,
	sourceContentType: ContentType,
	fieldName: string,
	targetId: string,
): Promise<RelationFilterAuthorization> {
	const relation = extractRelationFields(sourceContentType)[fieldName];
	if (!relation) {
		throw new CMSOperationError(
			404,
			`Relation field "${fieldName}" was not found on content type "${sourceContentType.slug}".`,
			"RELATION_FIELD_NOT_FOUND",
		);
	}
	const targetContentType = await getContentTypeOrThrow(
		adapter,
		ensureSynced,
		relation.targetType,
		`Target content type "${relation.targetType}" not found for relation field "${fieldName}"`,
	);
	const target = await getRecordOrThrow(
		adapter,
		ensureSynced,
		targetContentType.slug,
		targetId,
	);
	const targetFacts = recordFacts(target);
	return {
		permission: cmsPermissions.record.read(targetFacts),
		snapshot: relationFilterSnapshot(
			sourceContentType,
			fieldName,
			relation,
			targetContentType,
		),
		targetFacts,
	};
}

function relationTargetSnapshot(facts: RecordReadFacts) {
	return JSON.stringify([
		facts.contentType,
		facts.recordId,
		facts.authorId ?? null,
	]);
}

async function deriveRelationWriteAuthorization(
	adapter: DataAdapter,
	contentType: ContentType,
	data: Readonly<Record<string, unknown>>,
	ensureSynced: () => Promise<void>,
	expectedSchemaSnapshot?: readonly string[],
): Promise<RelationWriteAuthorization> {
	const permissions: Array<
		| ReturnType<typeof cmsPermissions.record.create>
		| ReturnType<typeof cmsPermissions.record.read>
	> = [];
	const snapshot: string[] = [];
	const targets: RecordReadFacts[] = [];
	const seenCreateTargetTypes = new Set<string>();
	const seenReadTargets = new Set<string>();
	const resolvedRelations: Array<{
		readonly values: readonly unknown[];
		readonly targetContentType: ContentType;
	}> = [];

	for (const [fieldName, relationConfig] of Object.entries(
		extractRelationFields(contentType),
	)) {
		if (!(fieldName in data)) continue;
		const value = data[fieldName];
		const values =
			relationConfig.type === "belongsTo"
				? [value]
				: Array.isArray(value)
					? value
					: [];
		const targetContentType = await getContentTypeOrThrow(
			adapter,
			ensureSynced,
			relationConfig.targetType,
			`Target content type "${relationConfig.targetType}" not found for relation field "${fieldName}"`,
		);
		snapshot.push(
			JSON.stringify([
				fieldName,
				relationConfig.type,
				targetContentType.id,
				targetContentType.slug,
			]),
		);
		resolvedRelations.push({ values, targetContentType });
	}

	snapshot.sort();
	if (expectedSchemaSnapshot) {
		assertRelationSchemaSnapshot(expectedSchemaSnapshot, snapshot);
	}
	for (const { values, targetContentType } of resolvedRelations) {
		if (
			values.some(isNewRelationValue) &&
			!seenCreateTargetTypes.has(targetContentType.slug)
		) {
			seenCreateTargetTypes.add(targetContentType.slug);
			permissions.push(
				cmsPermissions.record.create({ contentType: targetContentType.slug }),
			);
		}
		for (const reference of values) {
			if (
				isNewRelationValue(reference) ||
				!isExistingRelationValue(reference)
			) {
				continue;
			}
			const target = await getRecordOrThrow(
				adapter,
				ensureSynced,
				targetContentType.slug,
				reference.id,
			);
			const facts = recordFacts(target);
			const targetKey = relationTargetSnapshot(facts);
			if (seenReadTargets.has(targetKey)) continue;
			seenReadTargets.add(targetKey);
			targets.push(facts);
			permissions.push(cmsPermissions.record.read(facts));
		}
	}

	return {
		permissions,
		snapshot,
		targets: targets.sort((left, right) =>
			relationTargetSnapshot(left).localeCompare(relationTargetSnapshot(right)),
		),
	};
}

function assertRelationSchemaSnapshot(
	authorized: readonly string[],
	current: readonly string[],
) {
	if (JSON.stringify(authorized) !== JSON.stringify(current)) {
		throw relationSchemaChangedError();
	}
}

function assertRelationWriteAuthorization(
	authorized: RelationWriteAuthorization,
	current: RelationWriteAuthorization,
) {
	assertRelationSchemaSnapshot(authorized.snapshot, current.snapshot);
	if (
		JSON.stringify(authorized.targets.map(relationTargetSnapshot)) !==
		JSON.stringify(current.targets.map(relationTargetSnapshot))
	) {
		throw staleRecordError();
	}
}

function relationSchemaChangedError() {
	return new CMSOperationError(
		409,
		"Content type relations changed while authorization was being evaluated. Retry the operation.",
		"RELATION_SCHEMA_CHANGED",
	);
}

interface PopulatedRelationSnapshot {
	readonly relationKeys: readonly string[];
	readonly targets: readonly {
		readonly item: SerializedContentItemWithType;
		readonly facts: RecordReadFacts;
	}[];
}

async function getPopulatedRelationSnapshot(
	adapter: Adapter,
	sourceId: string,
): Promise<PopulatedRelationSnapshot> {
	const relations = await adapter.findMany<ContentRelation>({
		model: "contentRelation",
		where: [{ field: "sourceId", value: sourceId, operator: "eq" as const }],
	});
	const targets: PopulatedRelationSnapshot["targets"][number][] = [];
	const seenTargets = new Set<string>();
	for (const relation of relations) {
		if (seenTargets.has(relation.targetId)) continue;
		const target = await adapter.findOne<ContentItemWithType>({
			model: "contentItem",
			where: [
				{ field: "id", value: relation.targetId, operator: "eq" as const },
			],
			join: { contentType: true },
		});
		if (!target) continue;
		seenTargets.add(target.id);
		targets.push({
			item: serializeContentItemWithType(target),
			facts: recordFacts(target),
		});
	}
	return {
		relationKeys: relations
			.map((relation) => `${relation.fieldName}\u0000${relation.targetId}`)
			.sort(),
		targets: targets.sort((left, right) =>
			(left.facts.recordId ?? "").localeCompare(right.facts.recordId ?? ""),
		),
	};
}

function assertPopulatedRelationSnapshot(
	authorized: PopulatedRelationSnapshot,
	current: PopulatedRelationSnapshot,
) {
	const factsKey = (facts: RecordReadFacts) =>
		JSON.stringify([facts.contentType, facts.recordId, facts.authorId ?? null]);
	if (
		JSON.stringify(authorized.relationKeys) !==
			JSON.stringify(current.relationKeys) ||
		JSON.stringify(authorized.targets.map(({ facts }) => factsKey(facts))) !==
			JSON.stringify(current.targets.map(({ facts }) => factsKey(facts)))
	) {
		throw new CMSOperationError(
			409,
			"Related content changed while authorization was being evaluated. Retry the operation.",
			"RECORD_STATE_CHANGED",
		);
	}
}

function populatedRelationsFromSnapshot(snapshot: PopulatedRelationSnapshot) {
	const targetsById = new Map(
		snapshot.targets.map((target) => [target.facts.recordId, target.item]),
	);
	const populated: Record<string, SerializedContentItemWithType[]> = {};
	for (const relationKey of snapshot.relationKeys) {
		const [fieldName, targetId] = relationKey.split("\u0000");
		if (!fieldName || !targetId) continue;
		const target = targetsById.get(targetId);
		if (target) (populated[fieldName] ??= []).push(target);
	}
	return populated;
}

interface InverseSourceDescriptor {
	readonly contentTypeId: string;
	readonly contentTypeSlug: string;
	readonly contentTypeName: string;
	readonly fieldName: string;
}

interface InverseSourceAuthorization {
	readonly permissions: readonly ReturnType<
		typeof cmsPermissions.contentType.read
	>[];
	readonly snapshot: readonly string[];
	readonly sources: readonly InverseSourceDescriptor[];
}

function inverseSourceKey(source: InverseSourceDescriptor) {
	return JSON.stringify([
		source.contentTypeId,
		source.contentTypeSlug,
		source.contentTypeName,
		source.fieldName,
	]);
}

async function deriveInverseSourceAuthorization(
	adapter: Adapter,
	ensureSynced: () => Promise<void>,
	targetType: string,
): Promise<InverseSourceAuthorization> {
	await ensureSynced();
	const permissions = [];
	const sources: InverseSourceDescriptor[] = [];
	const seenSourceTypes = new Set<string>();
	for (const contentType of await adapter.findMany<ContentType>({
		model: "contentType",
	})) {
		for (const [fieldName, relation] of Object.entries(
			extractRelationFields(contentType),
		)) {
			if (relation.type !== "belongsTo" || relation.targetType !== targetType) {
				continue;
			}
			sources.push({
				contentTypeId: contentType.id,
				contentTypeSlug: contentType.slug,
				contentTypeName: contentType.name,
				fieldName,
			});
			if (seenSourceTypes.has(contentType.slug)) continue;
			seenSourceTypes.add(contentType.slug);
			permissions.push(
				cmsPermissions.contentType.read({ contentType: contentType.slug }),
			);
		}
	}
	sources.sort((left, right) =>
		inverseSourceKey(left).localeCompare(inverseSourceKey(right)),
	);
	return {
		permissions,
		snapshot: sources.map(inverseSourceKey),
		sources,
	};
}

async function listRecordsForRelation(
	adapter: Adapter,
	contentType: ContentType,
	fieldName: string,
	targetId: string,
	limit: number,
	offset: number,
) {
	const relations = await adapter.findMany<ContentRelation>({
		model: "contentRelation",
		where: [
			{ field: "targetId", value: targetId, operator: "eq" as const },
			{ field: "fieldName", value: fieldName, operator: "eq" as const },
		],
	});
	const ids = [...new Set(relations.map((relation) => relation.sourceId))];
	const items: ContentItemWithType[] = [];
	for (const id of ids) {
		const item = await adapter.findOne<ContentItemWithType>({
			model: "contentItem",
			where: [
				{ field: "id", value: id, operator: "eq" as const },
				{
					field: "contentTypeId",
					value: contentType.id,
					operator: "eq" as const,
				},
			],
			join: { contentType: true },
		});
		if (item) items.push(item);
	}
	items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	return {
		items: items
			.slice(offset, offset + limit)
			.map(serializeContentItemWithType),
		total: items.length,
		limit,
		offset,
	};
}

type EnsureSynced = () => Promise<void>;
type GetContentTypesWithCounts = () => Promise<
	Array<ReturnType<typeof serializeContentType> & { itemCount: number }>
>;

export function createCMSOperations(
	adapter: Adapter,
	options: {
		ensureSynced: EnsureSynced;
		getContentTypesWithCounts: GetContentTypesWithCounts;
		maxPageSize?: number;
		hooks?: CMSBackendHooks;
	},
) {
	const { ensureSynced, getContentTypesWithCounts, hooks } = options;
	const populatedRelationSnapshots = new WeakMap<
		object,
		PopulatedRelationSnapshot
	>();
	const relationWriteAuthorizationSnapshots = new WeakMap<
		object,
		RelationWriteAuthorization
	>();
	const relationFilterAuthorizationSnapshots = new WeakMap<
		object,
		RelationFilterAuthorization
	>();
	const inverseSourceAuthorizationSnapshots = new WeakMap<
		object,
		readonly string[]
	>();
	const inverseTargetAuthorizationSnapshots = new WeakMap<
		object,
		RecordReadFacts
	>();
	const contentTypeListSnapshots = new WeakMap<
		object,
		Awaited<ReturnType<GetContentTypesWithCounts>>
	>();
	const assertCurrentRelationWriteAuthorization = async (
		currentAdapter: DataAdapter,
		authorized: RelationWriteAuthorization,
		contentTypeSlug: string,
		data: Readonly<Record<string, unknown>>,
	) => {
		let current: RelationWriteAuthorization;
		try {
			const contentType = await getContentTypeOrThrow(
				currentAdapter,
				ensureSynced,
				contentTypeSlug,
			);
			current = await deriveRelationWriteAuthorization(
				currentAdapter,
				contentType,
				data,
				ensureSynced,
				authorized.snapshot,
			);
		} catch (error) {
			if (error instanceof CMSOperationError) {
				if (error.code === "CONTENT_TYPE_NOT_FOUND") {
					throw relationSchemaChangedError();
				}
				if (error.code === "RECORD_NOT_FOUND") throw staleRecordError();
			}
			throw error;
		}
		assertRelationWriteAuthorization(authorized, current);
	};
	const recheckRelationWriteAuthorization = async (
		input: object,
		contentTypeSlug: string,
		data: Readonly<Record<string, unknown>>,
	) => {
		const authorized = relationWriteAuthorizationSnapshots.get(input);
		relationWriteAuthorizationSnapshots.delete(input);
		if (!authorized) {
			throw new CMSOperationError(
				500,
				"Relation authorization snapshot is unavailable.",
				"AUTHORIZATION_SNAPSHOT_MISSING",
			);
		}
		await assertCurrentRelationWriteAuthorization(
			adapter,
			authorized,
			contentTypeSlug,
			data,
		);
		return authorized;
	};
	const recheckInverseSourceAuthorization = async (
		input: object,
		targetType: string,
	) => {
		const authorized = inverseSourceAuthorizationSnapshots.get(input);
		inverseSourceAuthorizationSnapshots.delete(input);
		if (!authorized) {
			throw new CMSOperationError(
				500,
				"Inverse relation authorization snapshot is unavailable.",
				"AUTHORIZATION_SNAPSHOT_MISSING",
			);
		}
		const current = await deriveInverseSourceAuthorization(
			adapter,
			ensureSynced,
			targetType,
		);
		assertRelationSchemaSnapshot(authorized, current.snapshot);
		return current.sources;
	};
	const recheckRelationFilterAuthorization = async (
		input: object,
		sourceType: string,
		fieldName: string,
		targetId: string,
	) => {
		const authorized = relationFilterAuthorizationSnapshots.get(input);
		relationFilterAuthorizationSnapshots.delete(input);
		if (!authorized) {
			throw new CMSOperationError(
				500,
				"Relation-filter authorization snapshot is unavailable.",
				"AUTHORIZATION_SNAPSHOT_MISSING",
			);
		}
		let sourceContentType: ContentType;
		try {
			sourceContentType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				sourceType,
			);
		} catch (error) {
			if (
				error instanceof CMSOperationError &&
				error.code === "CONTENT_TYPE_NOT_FOUND"
			) {
				throw relationSchemaChangedError();
			}
			throw error;
		}
		const relation = extractRelationFields(sourceContentType)[fieldName];
		if (!relation) throw relationSchemaChangedError();
		let targetContentType: ContentType;
		try {
			targetContentType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				relation.targetType,
			);
		} catch (error) {
			if (
				error instanceof CMSOperationError &&
				error.code === "CONTENT_TYPE_NOT_FOUND"
			) {
				throw relationSchemaChangedError();
			}
			throw error;
		}
		const currentSnapshot = relationFilterSnapshot(
			sourceContentType,
			fieldName,
			relation,
			targetContentType,
		);
		if (authorized.snapshot !== currentSnapshot) {
			throw relationSchemaChangedError();
		}
		let target: ContentItemWithType;
		try {
			target = await getRecordOrThrow(
				adapter,
				ensureSynced,
				targetContentType.slug,
				targetId,
			);
		} catch (error) {
			if (
				error instanceof CMSOperationError &&
				error.code === "RECORD_NOT_FOUND"
			) {
				throw staleRecordError();
			}
			throw error;
		}
		const currentFacts = recordFacts(target);
		if (
			authorized.targetFacts.contentType !== currentFacts.contentType ||
			authorized.targetFacts.recordId !== currentFacts.recordId ||
			authorized.targetFacts.authorId !== currentFacts.authorId
		) {
			throw staleRecordError();
		}
		return sourceContentType;
	};
	const recheckInverseTargetAuthorization = async (
		input: object,
		targetType: string,
		targetId: string,
	) => {
		const authorized = inverseTargetAuthorizationSnapshots.get(input);
		if (
			!authorized ||
			authorized.contentType !== targetType ||
			authorized.recordId !== targetId
		) {
			throw new CMSOperationError(
				500,
				"Inverse-relation target authorization snapshot is unavailable.",
				"AUTHORIZATION_SNAPSHOT_MISSING",
			);
		}
		const current = await adapter.findOne<ContentItemWithType>({
			model: "contentItem",
			where: [{ field: "id", value: targetId, operator: "eq" as const }],
			join: { contentType: true },
		});
		if (!current) throw staleRecordError();
		assertRecordFacts(current, authorized);
	};
	const listQuerySchema = createListContentQuerySchema(options.maxPageSize);
	const paginationSchema = z.object({
		limit: z.coerce
			.number()
			.min(1)
			.max(options.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE)
			.optional()
			.default(20),
		offset: z.coerce.number().min(0).optional().default(0),
	});
	const ListContentItemsInputSchema = z.object({
		typeSlug: z.string().min(1),
		query: listQuerySchema,
	});
	const ListContentByRelationInputSchema = z.object({
		typeSlug: z.string().min(1),
		query: z
			.object({ field: z.string().min(1), targetId: z.string().min(1) })
			.merge(paginationSchema),
	});
	const GetInverseRelationsInputSchema = z.object({
		slug: z.string().min(1),
		query: z.object({ itemId: z.string().min(1).optional() }),
	});
	const ListInverseRelationItemsInputSchema = z.object({
		slug: z.string().min(1),
		sourceType: z.string().min(1),
		query: z
			.object({
				itemId: z.string().min(1),
				fieldName: z.string().min(1),
			})
			.merge(paginationSchema),
	});

	const notifyError = async (
		error: unknown,
		operation: "create" | "update" | "delete" | "list" | "get",
		context: CMSOperationLifecycleContext,
	) => {
		await hooks?.onError?.(
			normalizeOperationError(error, `CMS ${operation} operation failed.`),
			operation,
			operationErrorContext(context, error),
		);
	};

	const listContentTypes = defineOperation({
		input: ListContentTypesInputSchema,
		permission: cmsPermissions.contentType.read,
		facts: async () => {
			await ensureSynced();
			return {};
		},
		additionalPermissions: async ({ input }) => {
			const contentTypes = await getContentTypesWithCounts();
			contentTypeListSnapshots.set(input as object, contentTypes);
			return contentTypes.map((contentType) =>
				cmsPermissions.record.read(collectionFacts(contentType.slug)),
			);
		},
		execute: ({ input }) => {
			const contentTypes = contentTypeListSnapshots.get(input as object);
			contentTypeListSnapshots.delete(input as object);
			if (!contentTypes) {
				throw new CMSOperationError(
					500,
					"Content-type catalog authorization snapshot is unavailable.",
					"AUTHORIZATION_SNAPSHOT_MISSING",
				);
			}
			return contentTypes.map((contentType) => ({
				...operationContentType(contentType),
				itemCount: contentType.itemCount,
			}));
		},
		onError: ({ error, ...context }) =>
			notifyError(error, "list", genericContext(context)),
	});

	const getContentTypeBySlug = defineOperation({
		input: GetContentTypeInputSchema,
		permission: cmsPermissions.contentType.read,
		facts: async ({ input }) => {
			const contentType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				input.slug,
			);
			return { contentType: contentType.slug };
		},
		execute: async ({ facts }) =>
			operationContentType(
				serializeContentType(
					await getContentTypeOrThrow(
						adapter,
						ensureSynced,
						facts.contentType ?? "",
					),
				),
			),
		onError: ({ error, ...context }) =>
			notifyError(
				error,
				"get",
				genericContext(context, context.facts.contentType),
			),
	});

	const listContentItems = defineOperation({
		input: ListContentItemsInputSchema,
		permission: cmsPermissions.record.read,
		facts: async ({ input }) => {
			const contentType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				input.typeSlug,
			);
			if (!input.query.slug) {
				return collectionFacts(contentType.slug);
			}
			const item = await getContentItemBySlug(
				adapter,
				contentType.slug,
				input.query.slug,
			);
			const facts: RecordReadFacts = {
				contentType: contentType.slug,
				scope: "record",
				...(item
					? {
							recordId: item.id,
							...(item.authorId ? { authorId: item.authorId } : {}),
						}
					: {}),
			};
			return facts;
		},
		additionalPermissions: ({ facts }) => [
			cmsPermissions.contentType.read({ contentType: facts.contentType }),
		],
		execute: async ({ input, facts }) => {
			const result = await getAllContentItems(
				adapter,
				facts.contentType,
				input.query,
			);
			if (facts.scope === "record") {
				if (!facts.recordId) {
					if (result.items.length > 0) throw staleRecordError();
					if (
						await getContentItemBySlug(
							adapter,
							facts.contentType,
							input.query.slug ?? "",
						)
					) {
						throw staleRecordError();
					}
					return operationContentList(result);
				}
				if (result.items.length > 1) throw staleRecordError();
				if (result.items.length === 0) {
					const current = await getContentItemBySlug(
						adapter,
						facts.contentType,
						input.query.slug ?? "",
					);
					if (!current) throw staleRecordError();
					assertRecordFacts(current, facts);
				} else {
					assertRecordFacts(result.items[0]!, facts);
				}
			}
			return operationContentList(result);
		},
		onError: ({ error, ...context }) =>
			notifyError(
				error,
				"list",
				genericContext(context, context.facts.contentType),
			),
	});

	const getContentItem = defineOperation({
		input: GetContentItemInputSchema,
		permission: cmsPermissions.record.read,
		facts: async ({ input }) =>
			recordFacts(
				await getRecordOrThrow(adapter, ensureSynced, input.typeSlug, input.id),
			),
		additionalPermissions: ({ facts }) => [
			cmsPermissions.contentType.read({ contentType: facts.contentType }),
		],
		execute: async ({ facts }) => {
			const item = await getRecordOrThrow(
				adapter,
				ensureSynced,
				facts.contentType,
				facts.recordId ?? "",
			);
			assertRecordFacts(item, facts);
			return operationContentItem(serializeContentItemWithType(item));
		},
		onError: ({ error, ...context }) =>
			notifyError(
				error,
				"get",
				genericContext(context, context.facts.contentType),
			),
	});

	const createContentItem = defineOperation({
		input: CreateContentItemInputSchema,
		permission: cmsPermissions.record.create,
		facts: async ({ input }) => ({
			contentType: (
				await getContentTypeOrThrow(adapter, ensureSynced, input.typeSlug)
			).slug,
		}),
		additionalPermissions: async ({ input, facts }) => {
			const authorization = await deriveRelationWriteAuthorization(
				adapter,
				await getContentTypeOrThrow(adapter, ensureSynced, facts.contentType),
				input.body.data as unknown as Readonly<Record<string, unknown>>,
				ensureSynced,
			);
			relationWriteAuthorizationSnapshots.set(input as object, authorization);
			return [
				cmsPermissions.contentType.read({ contentType: facts.contentType }),
				...authorization.permissions,
			];
		},
		execute: async (context) => {
			const lifecycleContext = createContext(context);
			const contentType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				context.facts.contentType,
			);
			const slug = slugify(context.input.body.slug);
			if (!slug) {
				throw new CMSOperationError(
					400,
					"Invalid slug: must contain at least one alphanumeric character",
					"INVALID_SLUG",
				);
			}
			const relationAuthorization = await recheckRelationWriteAuthorization(
				context.input as object,
				contentType.slug,
				context.input.body.data,
			);
			const relationPlan = await planRelationsInData(
				adapter,
				contentType,
				context.input.body.data,
				ensureSynced,
				context.identity?.id,
			);
			const validation = getContentTypeZodSchema(contentType).safeParse(
				relationPlan.processedData,
			);
			if (!validation.success) {
				throw new CMSOperationError(
					400,
					"Validation failed",
					"RECORD_VALIDATION_FAILED",
					validation.error.issues,
				);
			}
			const existing = await adapter.findOne<ContentItem>({
				model: "contentItem",
				where: [
					{
						field: "contentTypeId",
						value: contentType.id,
						operator: "eq" as const,
					},
					{ field: "slug", value: slug, operator: "eq" as const },
				],
			});
			if (existing) {
				throw new CMSOperationError(
					409,
					"Content item with this slug already exists",
					"DUPLICATE_SLUG",
				);
			}
			const validatedData = validation.data as Record<string, CMSOperationData>;
			await runBeforeHook(
				() => hooks?.onBeforeCreate?.(validatedData, lifecycleContext),
				"Create operation denied",
			);
			return adapter.transaction(async (tx) => {
				await assertCurrentRelationWriteAuthorization(
					tx,
					relationAuthorization,
					contentType.slug,
					context.input.body.data,
				);
				const currentDuplicate = await tx.findOne<ContentItem>({
					model: "contentItem",
					where: [
						{
							field: "contentTypeId",
							value: contentType.id,
							operator: "eq" as const,
						},
						{ field: "slug", value: slug, operator: "eq" as const },
					],
				});
				if (currentDuplicate) {
					throw new CMSOperationError(
						409,
						"Content item with this slug already exists",
						"DUPLICATE_SLUG",
					);
				}
				await applyRelationWritePlan(tx, relationPlan);
				const item = await tx.create<ContentItem>({
					model: "contentItem",
					data: {
						contentTypeId: contentType.id,
						slug,
						data: JSON.stringify(validatedData),
						...(context.identity ? { authorId: context.identity.id } : {}),
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
				await syncRelations(tx, item.id, relationPlan.relationIds);
				const joined = await getRecordOrThrow(
					tx,
					ensureSynced,
					contentType.slug,
					item.id,
				);
				return operationContentItem(serializeContentItemWithType(joined));
			});
		},
		after: async (context) => {
			const base = createContext(context);
			// The serialized item type recursively contains populated relations. Keep
			// that useful public hook type while bridging the already-frozen result
			// without asking TypeScript to recursively compare every relation level.
			const onAfterCreate = hooks?.onAfterCreate as
				| ((item: unknown, context: unknown) => Promise<void> | void)
				| undefined;
			await onAfterCreate?.(
				context.result,
				Object.freeze({ ...base, result: context.result }),
			);
		},
		onError: async ({ error, ...context }) => {
			await notifyError(error, "create", createContext(context));
		},
	});

	const updateContentItem = defineOperation({
		input: UpdateContentItemInputSchema,
		permission: cmsPermissions.record.update,
		facts: async ({ input }) => {
			const item = await getRecordOrThrow(
				adapter,
				ensureSynced,
				input.typeSlug,
				input.id,
			);
			const facts = recordFacts(item);
			return {
				contentType: facts.contentType,
				recordId: facts.recordId ?? input.id,
				...(facts.authorId ? { authorId: facts.authorId } : {}),
			};
		},
		additionalPermissions: async ({ input, facts }) => {
			const contentTypePermission = cmsPermissions.contentType.read({
				contentType: facts.contentType,
			});
			if (!input.body.data) return [contentTypePermission];
			const authorization = await deriveRelationWriteAuthorization(
				adapter,
				await getContentTypeOrThrow(adapter, ensureSynced, facts.contentType),
				input.body.data as unknown as Readonly<Record<string, unknown>>,
				ensureSynced,
			);
			relationWriteAuthorizationSnapshots.set(input as object, authorization);
			return [contentTypePermission, ...authorization.permissions];
		},
		execute: async (context) => {
			const lifecycleContext = updateContext(context);
			const contentType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				context.facts.contentType,
			);
			const rawSlug = context.input.body.slug;
			const slug = rawSlug ? slugify(rawSlug) : undefined;
			if (rawSlug && !slug) {
				throw new CMSOperationError(
					400,
					"Invalid slug: must contain at least one alphanumeric character",
					"INVALID_SLUG",
				);
			}
			const bodyData = context.input.body.data;
			const relationAuthorization = bodyData
				? await recheckRelationWriteAuthorization(
						context.input as object,
						contentType.slug,
						bodyData,
					)
				: undefined;
			const authorizedRecord = await getRecordOrThrow(
				adapter,
				ensureSynced,
				context.facts.contentType,
				context.facts.recordId,
			);
			assertRecordFacts(authorizedRecord, context.facts);
			if (slug && slug !== authorizedRecord.slug) {
				const duplicate = await adapter.findOne<ContentItem>({
					model: "contentItem",
					where: [
						{
							field: "contentTypeId",
							value: contentType.id,
							operator: "eq" as const,
						},
						{ field: "slug", value: slug, operator: "eq" as const },
					],
				});
				if (duplicate) {
					throw new CMSOperationError(
						409,
						"Content item with this slug already exists",
						"DUPLICATE_SLUG",
					);
				}
			}
			const relationPlan = bodyData
				? await planRelationsInData(
						adapter,
						contentType,
						bodyData,
						ensureSynced,
						context.identity?.id,
					)
				: undefined;
			const currentData = authorizedRecord.data
				? (JSON.parse(authorizedRecord.data) as Record<string, OperationData>)
				: {};
			const validation = getContentTypeZodSchema(contentType).safeParse({
				...currentData,
				...(relationPlan?.processedData ?? {}),
			});
			if (!validation.success) {
				throw new CMSOperationError(
					400,
					"Validation failed",
					"RECORD_VALIDATION_FAILED",
					validation.error.issues,
				);
			}
			const mergedData = validation.data as Record<string, CMSOperationData>;
			await runBeforeHook(
				() =>
					hooks?.onBeforeUpdate?.(
						context.facts.recordId,
						mergedData,
						lifecycleContext,
					),
				"Update operation denied",
			);
			return adapter.transaction(async (tx) => {
				if (bodyData && relationAuthorization) {
					await assertCurrentRelationWriteAuthorization(
						tx,
						relationAuthorization,
						contentType.slug,
						bodyData,
					);
				}
				const current = await getRecordOrThrow(
					tx,
					ensureSynced,
					context.facts.contentType,
					context.facts.recordId,
				);
				assertRecordFacts(current, context.facts);
				assertRecordSnapshot(current, authorizedRecord);
				if (slug && slug !== current.slug) {
					const duplicate = await tx.findOne<ContentItem>({
						model: "contentItem",
						where: [
							{
								field: "contentTypeId",
								value: contentType.id,
								operator: "eq" as const,
							},
							{ field: "slug", value: slug, operator: "eq" as const },
						],
					});
					if (duplicate) {
						throw new CMSOperationError(
							409,
							"Content item with this slug already exists",
							"DUPLICATE_SLUG",
						);
					}
				}
				if (relationPlan) await applyRelationWritePlan(tx, relationPlan);
				const update: Partial<ContentItem> = { updatedAt: new Date() };
				if (slug) update.slug = slug;
				if (bodyData) update.data = JSON.stringify(mergedData);
				const matched = await tx.updateMany({
					model: "contentItem",
					where: [
						{
							field: "id",
							value: context.facts.recordId,
							operator: "eq" as const,
						},
						{
							field: "contentTypeId",
							value: contentType.id,
							operator: "eq" as const,
						},
						{
							field: "authorId",
							value: context.facts.authorId ?? null,
							operator: "eq" as const,
						},
						{
							field: "updatedAt",
							value: current.updatedAt,
							operator: "eq" as const,
						},
					],
					update,
				});
				if (!didUpdateContentItem(matched, context.facts.recordId)) {
					throw staleRecordError();
				}
				if (relationPlan) {
					await syncRelations(
						tx,
						context.facts.recordId,
						relationPlan.relationIds,
					);
				}
				const updated = await getRecordOrThrow(
					tx,
					ensureSynced,
					context.facts.contentType,
					context.facts.recordId,
				);
				return operationContentItem(serializeContentItemWithType(updated));
			});
		},
		after: async (context) => {
			const base = updateContext(context);
			const onAfterUpdate = hooks?.onAfterUpdate as
				| ((item: unknown, context: unknown) => Promise<void> | void)
				| undefined;
			await onAfterUpdate?.(
				context.result,
				Object.freeze({ ...base, result: context.result }),
			);
		},
		onError: async ({ error, ...context }) => {
			await notifyError(error, "update", updateContext(context));
		},
	});

	const deleteContentItem = defineOperation({
		input: DeleteContentItemInputSchema,
		permission: cmsPermissions.record.delete,
		facts: async ({ input }) => {
			const item = await getRecordOrThrow(
				adapter,
				ensureSynced,
				input.typeSlug,
				input.id,
			);
			const facts = recordFacts(item);
			return {
				contentType: facts.contentType,
				recordId: facts.recordId ?? input.id,
				...(facts.authorId ? { authorId: facts.authorId } : {}),
			};
		},
		before: async (context) => {
			const current = await getRecordOrThrow(
				adapter,
				ensureSynced,
				context.facts.contentType,
				context.facts.recordId,
			);
			assertRecordFacts(current, context.facts);
			await runBeforeHook(
				() =>
					hooks?.onBeforeDelete?.(
						context.facts.recordId,
						deleteContext(context),
					),
				"Delete operation denied",
			);
		},
		execute: async ({ facts }) =>
			adapter.transaction(async (tx) => {
				const existing = await getRecordOrThrow(
					tx,
					ensureSynced,
					facts.contentType,
					facts.recordId,
				);
				assertRecordFacts(existing, facts);
				const matched = await tx.updateMany({
					model: "contentItem",
					where: [
						{ field: "id", value: facts.recordId, operator: "eq" as const },
						{
							field: "contentTypeId",
							value: existing.contentTypeId,
							operator: "eq" as const,
						},
						{
							field: "authorId",
							value: facts.authorId ?? null,
							operator: "eq" as const,
						},
						{
							field: "updatedAt",
							value: existing.updatedAt,
							operator: "eq" as const,
						},
					],
					update: { updatedAt: new Date() },
				});
				if (!didUpdateContentItem(matched, facts.recordId)) {
					throw staleRecordError();
				}
				await tx.delete({
					model: "contentItem",
					where: [
						{ field: "id", value: facts.recordId, operator: "eq" as const },
						{
							field: "contentTypeId",
							value: existing.contentTypeId,
							operator: "eq" as const,
						},
					],
				});
				return { success: true } as const;
			}),
		after: async (context) => {
			const base = deleteContext(context);
			await hooks?.onAfterDelete?.(
				context.facts.recordId,
				Object.freeze({ ...base, result: context.result }),
			);
		},
		onError: async ({ error, ...context }) => {
			await notifyError(error, "delete", deleteContext(context));
		},
	});

	const getContentItemPopulated = defineOperation({
		input: GetContentItemInputSchema,
		permission: cmsPermissions.record.read,
		facts: async ({ input }) =>
			recordFacts(
				await getRecordOrThrow(adapter, ensureSynced, input.typeSlug, input.id),
			),
		additionalPermissions: async ({ input, facts }) => {
			const snapshot = await getPopulatedRelationSnapshot(
				adapter,
				facts.recordId ?? "",
			);
			populatedRelationSnapshots.set(input as object, snapshot);
			const contentTypes = new Set([
				facts.contentType,
				...snapshot.targets.map(
					({ facts: targetFacts }) => targetFacts.contentType,
				),
			]);
			return [
				...[...contentTypes].map((contentType) =>
					cmsPermissions.contentType.read({ contentType }),
				),
				...snapshot.targets.map(({ facts: targetFacts }) =>
					cmsPermissions.record.read(targetFacts),
				),
			];
		},
		execute: async ({ input, facts }) => {
			try {
				const item = await getRecordOrThrow(
					adapter,
					ensureSynced,
					facts.contentType,
					facts.recordId ?? "",
				);
				assertRecordFacts(item, facts);
				const authorizedSnapshot = populatedRelationSnapshots.get(
					input as object,
				);
				if (!authorizedSnapshot) {
					throw new CMSOperationError(
						500,
						"Related-content authorization snapshot is unavailable.",
						"AUTHORIZATION_SNAPSHOT_MISSING",
					);
				}
				const currentSnapshot = await getPopulatedRelationSnapshot(
					adapter,
					facts.recordId ?? "",
				);
				assertPopulatedRelationSnapshot(authorizedSnapshot, currentSnapshot);
				const relations = populatedRelationsFromSnapshot(currentSnapshot);
				return {
					...operationContentItem(serializeContentItemWithType(item)),
					_relations: Object.fromEntries(
						Object.entries(relations).map(([field, records]) => [
							field,
							records.map(operationContentItem),
						]),
					),
				};
			} finally {
				populatedRelationSnapshots.delete(input as object);
			}
		},
		onError: ({ error, ...context }) =>
			notifyError(
				error,
				"get",
				genericContext(context, context.facts.contentType),
			),
	});

	const listContentByRelation = defineOperation({
		input: ListContentByRelationInputSchema,
		permission: cmsPermissions.record.read,
		facts: async ({ input }) =>
			collectionFacts(
				(await getContentTypeOrThrow(adapter, ensureSynced, input.typeSlug))
					.slug,
			),
		additionalPermissions: async ({ input, facts }) => {
			const sourceContentType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				facts.contentType,
			);
			const authorization = await deriveRelationFilterAuthorization(
				adapter,
				ensureSynced,
				sourceContentType,
				input.query.field,
				input.query.targetId,
			);
			relationFilterAuthorizationSnapshots.set(input as object, authorization);
			return [
				cmsPermissions.contentType.read({ contentType: facts.contentType }),
				authorization.permission,
			];
		},
		execute: async ({ input, facts }) => {
			const sourceContentType = await recheckRelationFilterAuthorization(
				input as object,
				facts.contentType,
				input.query.field,
				input.query.targetId,
			);
			const result = await listRecordsForRelation(
				adapter,
				sourceContentType,
				input.query.field,
				input.query.targetId,
				input.query.limit,
				input.query.offset,
			);
			return {
				...result,
				items: result.items.map(operationContentItem),
			};
		},
		onError: ({ error, ...context }) =>
			notifyError(
				error,
				"list",
				genericContext(context, context.facts.contentType),
			),
	});

	const getInverseRelations = defineOperation({
		input: GetInverseRelationsInputSchema,
		permission: cmsPermissions.contentType.read,
		facts: async ({ input }) => ({
			contentType: (
				await getContentTypeOrThrow(adapter, ensureSynced, input.slug)
			).slug,
		}),
		additionalPermissions: async ({ input, facts }) => {
			const authorization = await deriveInverseSourceAuthorization(
				adapter,
				ensureSynced,
				facts.contentType ?? "",
			);
			inverseSourceAuthorizationSnapshots.set(
				input as object,
				authorization.snapshot,
			);
			const permissions: Array<
				| ReturnType<typeof cmsPermissions.contentType.read>
				| ReturnType<typeof cmsPermissions.record.read>
			> = [...authorization.permissions];
			if (input.query.itemId) {
				const targetFacts = recordFacts(
					await getRecordOrThrow(
						adapter,
						ensureSynced,
						facts.contentType ?? "",
						input.query.itemId,
					),
				);
				inverseTargetAuthorizationSnapshots.set(input as object, targetFacts);
				permissions.push(cmsPermissions.record.read(targetFacts));
				const authorizedSourceTypes = new Set<string>();
				for (const source of authorization.sources) {
					if (authorizedSourceTypes.has(source.contentTypeSlug)) continue;
					authorizedSourceTypes.add(source.contentTypeSlug);
					permissions.push(
						cmsPermissions.record.read(collectionFacts(source.contentTypeSlug)),
					);
				}
			}
			return permissions;
		},
		execute: async ({ input, facts }) => {
			try {
				const sources = await recheckInverseSourceAuthorization(
					input as object,
					facts.contentType ?? "",
				);
				if (input.query.itemId) {
					await recheckInverseTargetAuthorization(
						input as object,
						facts.contentType ?? "",
						input.query.itemId,
					);
				}
				const inverseRelations: InverseRelation[] = [];
				for (const source of sources) {
					let count = 0;
					if (input.query.itemId) {
						const relations = await adapter.findMany<ContentRelation>({
							model: "contentRelation",
							where: [
								{
									field: "targetId",
									value: input.query.itemId,
									operator: "eq" as const,
								},
								{
									field: "fieldName",
									value: source.fieldName,
									operator: "eq" as const,
								},
							],
						});
						for (const sourceId of relations.map((value) => value.sourceId)) {
							const item = await adapter.findOne<ContentItem>({
								model: "contentItem",
								where: [
									{
										field: "id",
										value: sourceId,
										operator: "eq" as const,
									},
									{
										field: "contentTypeId",
										value: source.contentTypeId,
										operator: "eq" as const,
									},
								],
							});
							if (item) count += 1;
						}
					}
					inverseRelations.push({
						sourceType: source.contentTypeSlug,
						sourceTypeName: source.contentTypeName,
						fieldName: source.fieldName,
						count,
					});
				}
				return {
					inverseRelations: inverseRelations.map((relation) => ({
						...relation,
					})),
				};
			} finally {
				inverseTargetAuthorizationSnapshots.delete(input as object);
			}
		},
		onError: ({ error, ...context }) =>
			notifyError(
				error,
				"get",
				genericContext(context, context.facts.contentType),
			),
	});

	const listInverseRelationItems = defineOperation({
		input: ListInverseRelationItemsInputSchema,
		permission: cmsPermissions.record.read,
		facts: async ({ input }) => {
			await getContentTypeOrThrow(adapter, ensureSynced, input.slug);
			const sourceType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				input.sourceType,
			);
			return collectionFacts(sourceType.slug);
		},
		additionalPermissions: async ({ input, facts }) => {
			const authorization = await deriveInverseSourceAuthorization(
				adapter,
				ensureSynced,
				input.slug,
			);
			const source = authorization.sources.find(
				(value) =>
					value.contentTypeSlug === facts.contentType &&
					value.fieldName === input.query.fieldName,
			);
			if (!source) {
				throw new CMSOperationError(
					404,
					"Inverse relation not found",
					"INVERSE_RELATION_NOT_FOUND",
				);
			}
			inverseSourceAuthorizationSnapshots.set(
				input as object,
				authorization.snapshot,
			);
			const targetFacts = recordFacts(
				await getRecordOrThrow(
					adapter,
					ensureSynced,
					input.slug,
					input.query.itemId,
				),
			);
			inverseTargetAuthorizationSnapshots.set(input as object, targetFacts);
			return [
				cmsPermissions.contentType.read({ contentType: facts.contentType }),
				cmsPermissions.record.read(targetFacts),
			];
		},
		execute: async ({ input, facts }) => {
			try {
				const sources = await recheckInverseSourceAuthorization(
					input as object,
					input.slug,
				);
				const source = sources.find(
					(value) =>
						value.contentTypeSlug === facts.contentType &&
						value.fieldName === input.query.fieldName,
				);
				if (!source) throw relationSchemaChangedError();
				await recheckInverseTargetAuthorization(
					input as object,
					input.slug,
					input.query.itemId,
				);
				const result = await listRecordsForRelation(
					adapter,
					await getContentTypeOrThrow(adapter, ensureSynced, facts.contentType),
					source.fieldName,
					input.query.itemId,
					input.query.limit,
					input.query.offset,
				);
				return {
					...result,
					items: result.items.map(operationContentItem),
				};
			} finally {
				inverseTargetAuthorizationSnapshots.delete(input as object);
			}
		},
		onError: ({ error, ...context }) =>
			notifyError(
				error,
				"list",
				genericContext(context, context.facts.contentType),
			),
	});

	return {
		listContentTypes,
		getContentTypeBySlug,
		listContentItems,
		getContentItem,
		createContentItem,
		updateContentItem,
		deleteContentItem,
		getContentItemPopulated,
		listContentByRelation,
		getInverseRelations,
		listInverseRelationItems,
	} as const;
}
