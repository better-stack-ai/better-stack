import type { DBAdapter as Adapter } from "@btst/db";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import {
	defineOperation,
	type DeepReadonly,
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
export class CMSOperationError extends Error {
	readonly statusCode: number;
	readonly code: string;
	readonly issues?: readonly unknown[];

	constructor(
		statusCode: number,
		message: string,
		code = "CMS_OPERATION_ERROR",
		issues?: readonly unknown[],
	) {
		super(message);
		this.name = "CMSOperationError";
		this.statusCode = statusCode;
		this.code = code;
		this.issues = issues;
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
): Promise<{ item: ContentItem; isNew: boolean }> {
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
	if (existing) return { item: existing, isNew: false };
	const now = new Date();
	return {
		item: {
			id: globalThis.crypto.randomUUID(),
			contentTypeId: targetContentType.id,
			slug,
			data: JSON.stringify(validation.data),
			...(authorId ? { authorId } : {}),
			createdAt: now,
			updatedAt: now,
		},
		isNew: true,
	};
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
	const resolvedItems = new Map<string, ContentItem>();

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
					resolvedItems,
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
						resolvedItems,
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
	resolvedItems: Map<string, ContentItem>,
	newItems: ContentItem[],
) {
	const slug = slugify(
		(data.slug as string) ||
			(data.name as string) ||
			(data.title as string) ||
			`item-${Date.now()}`,
	);
	const key = `${targetContentType.id}\u0000${slug}`;
	const resolved = resolvedItems.get(key);
	if (resolved) return resolved;
	const planned = await planRelatedItem(
		adapter,
		targetContentType,
		slug,
		data,
		authorId,
	);
	resolvedItems.set(key, planned.item);
	if (planned.isNew) newItems.push(planned.item);
	return planned.item;
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

async function relationCreatePermissions(
	adapter: Adapter,
	contentType: ContentType,
	data: Readonly<Record<string, unknown>>,
	ensureSynced: () => Promise<void>,
) {
	const permissions = [];
	const seenTargetTypes = new Set<string>();

	for (const [fieldName, relationConfig] of Object.entries(
		extractRelationFields(contentType),
	)) {
		if (!(fieldName in data)) continue;
		const value = data[fieldName];
		const createsTarget =
			relationConfig.type === "belongsTo"
				? isNewRelationValue(value)
				: Array.isArray(value) && value.some(isNewRelationValue);
		if (!createsTarget || seenTargetTypes.has(relationConfig.targetType)) {
			continue;
		}
		const targetContentType = await getContentTypeOrThrow(
			adapter,
			ensureSynced,
			relationConfig.targetType,
			`Target content type "${relationConfig.targetType}" not found for relation field "${fieldName}"`,
		);
		seenTargetTypes.add(targetContentType.slug);
		permissions.push(
			cmsPermissions.record.create({ contentType: targetContentType.slug }),
		);
	}

	return permissions;
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

async function inverseSourceTypePermissions(
	adapter: Adapter,
	ensureSynced: () => Promise<void>,
	targetType: string,
) {
	await ensureSynced();
	const permissions = [];
	for (const contentType of await adapter.findMany<ContentType>({
		model: "contentType",
	})) {
		const referencesTarget = Object.values(
			extractRelationFields(contentType),
		).some(
			(relation) =>
				relation.type === "belongsTo" && relation.targetType === targetType,
		);
		if (referencesTarget) {
			permissions.push(
				cmsPermissions.contentType.read({ contentType: contentType.slug }),
			);
		}
	}
	return permissions;
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
		execute: async () =>
			(await getContentTypesWithCounts()).map((contentType) => ({
				...operationContentType(contentType),
				itemCount: contentType.itemCount,
			})),
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
		execute: async ({ input, facts }) => {
			const result = await getAllContentItems(
				adapter,
				facts.contentType,
				input.query,
			);
			if (facts.scope === "record") {
				if (!facts.recordId) {
					if (result.items.length > 0) throw staleRecordError();
					return operationContentList(result);
				}
				if (result.items.length !== 1) throw staleRecordError();
				for (const item of result.items) {
					assertRecordFacts(item, facts);
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
		additionalPermissions: async ({ input, facts }) =>
			relationCreatePermissions(
				adapter,
				await getContentTypeOrThrow(adapter, ensureSynced, facts.contentType),
				input.body.data as unknown as Readonly<Record<string, unknown>>,
				ensureSynced,
			),
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
		additionalPermissions: async ({ input, facts }) =>
			input.body.data
				? relationCreatePermissions(
						adapter,
						await getContentTypeOrThrow(
							adapter,
							ensureSynced,
							facts.contentType,
						),
						input.body.data as unknown as Readonly<Record<string, unknown>>,
						ensureSynced,
					)
				: [],
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
			return snapshot.targets.map(({ facts: targetFacts }) =>
				cmsPermissions.record.read(targetFacts),
			);
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
		execute: async ({ input, facts }) => {
			const result = await listRecordsForRelation(
				adapter,
				await getContentTypeOrThrow(adapter, ensureSynced, facts.contentType),
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
		additionalPermissions: ({ facts }) =>
			inverseSourceTypePermissions(
				adapter,
				ensureSynced,
				facts.contentType ?? "",
			),
		execute: async ({ input, facts }) => {
			await ensureSynced();
			const allContentTypes = await adapter.findMany<ContentType>({
				model: "contentType",
			});
			const inverseRelations: InverseRelation[] = [];
			for (const contentType of allContentTypes) {
				for (const [fieldName, relation] of Object.entries(
					extractRelationFields(contentType),
				)) {
					if (
						relation.type !== "belongsTo" ||
						relation.targetType !== facts.contentType
					) {
						continue;
					}
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
									value: fieldName,
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
										value: contentType.id,
										operator: "eq" as const,
									},
								],
							});
							if (item) count += 1;
						}
					}
					inverseRelations.push({
						sourceType: contentType.slug,
						sourceTypeName: contentType.name,
						fieldName,
						count,
					});
				}
			}
			return {
				inverseRelations: inverseRelations.map((relation) => ({ ...relation })),
			};
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
		execute: async ({ input, facts }) => {
			const result = await listRecordsForRelation(
				adapter,
				await getContentTypeOrThrow(adapter, ensureSynced, facts.contentType),
				input.query.fieldName,
				input.query.itemId,
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
