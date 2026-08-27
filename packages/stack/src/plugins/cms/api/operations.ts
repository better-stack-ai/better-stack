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
	adapter: Adapter,
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
	adapter: Adapter,
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
		recordId: item.id,
		...(item.authorId ? { authorId: item.authorId } : {}),
	};
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
		throw new CMSOperationError(
			409,
			"Content item changed while authorization was being evaluated. Retry the operation.",
			"RECORD_STATE_CHANGED",
		);
	}
}

async function createRelatedItem(
	adapter: Adapter,
	targetContentType: ContentType,
	data: Record<string, OperationData>,
	authorId?: string,
): Promise<ContentItem> {
	const slug = slugify(
		(data.slug as string) ||
			(data.name as string) ||
			(data.title as string) ||
			`item-${Date.now()}`,
	);
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
	if (existing) return existing;
	return adapter.create<ContentItem>({
		model: "contentItem",
		data: {
			contentTypeId: targetContentType.id,
			slug,
			data: JSON.stringify(validation.data),
			...(authorId ? { authorId } : {}),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

async function processRelationsInData(
	adapter: Adapter,
	contentType: ContentType,
	data: Record<string, OperationData>,
	ensureSynced: () => Promise<void>,
	authorId?: string,
): Promise<{
	processedData: Record<string, OperationData>;
	relationIds: Record<string, string[]>;
}> {
	const relationFields = extractRelationFields(contentType);
	const processedData = { ...data };
	const relationIds: Record<string, string[]> = {};

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
				const item = await createRelatedItem(
					adapter,
					targetContentType,
					value.data as Record<string, OperationData>,
					authorId,
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
					const item = await createRelatedItem(
						adapter,
						targetContentType,
						value.data as Record<string, OperationData>,
						authorId,
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
	return { processedData, relationIds };
}

async function populateRelations(
	adapter: Adapter,
	item: ContentItemWithType,
): Promise<Record<string, SerializedContentItemWithType[]>> {
	const contentRelations = await adapter.findMany<ContentRelation>({
		model: "contentRelation",
		where: [{ field: "sourceId", value: item.id, operator: "eq" as const }],
	});
	const relationsByField: Record<string, string[]> = {};
	for (const relation of contentRelations) {
		(relationsByField[relation.fieldName] ??= []).push(relation.targetId);
	}
	const populated: Record<string, SerializedContentItemWithType[]> = {};
	for (const [fieldName, ids] of Object.entries(relationsByField)) {
		populated[fieldName] = [];
		for (const id of ids) {
			const related = await adapter.findOne<ContentItemWithType>({
				model: "contentItem",
				where: [{ field: "id", value: id, operator: "eq" as const }],
				join: { contentType: true },
			});
			if (related)
				populated[fieldName].push(serializeContentItemWithType(related));
		}
	}
	return populated;
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
			if (!input.query.slug) return { contentType: contentType.slug };
			const item = await getContentItemBySlug(
				adapter,
				contentType.slug,
				input.query.slug,
			);
			return {
				contentType: contentType.slug,
				...(item
					? {
							recordId: item.id,
							...(item.authorId ? { authorId: item.authorId } : {}),
						}
					: {}),
			};
		},
		execute: async ({ input, facts }) => {
			const result = await getAllContentItems(
				adapter,
				facts.contentType,
				input.query,
			);
			if (facts.recordId) {
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
			await hooks?.onBeforeCreate?.(context.input.body.data, lifecycleContext);
			const { processedData, relationIds } = await processRelationsInData(
				adapter,
				contentType,
				context.input.body.data,
				ensureSynced,
				context.identity?.id,
			);
			const validation =
				getContentTypeZodSchema(contentType).safeParse(processedData);
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
			const validatedData = validation.data as Record<string, OperationData>;
			const item = await adapter.create<ContentItem>({
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
			await syncRelations(adapter, item.id, relationIds);
			const joined = await getRecordOrThrow(
				adapter,
				ensureSynced,
				contentType.slug,
				item.id,
			);
			return operationContentItem(serializeContentItemWithType(joined));
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
		execute: async (context) => {
			const lifecycleContext = updateContext(context);
			const contentType = await getContentTypeOrThrow(
				adapter,
				ensureSynced,
				context.facts.contentType,
			);
			const existing = await getRecordOrThrow(
				adapter,
				ensureSynced,
				context.facts.contentType,
				context.facts.recordId,
			);
			assertRecordFacts(existing, context.facts);
			const rawSlug = context.input.body.slug;
			const slug = rawSlug ? slugify(rawSlug) : undefined;
			if (rawSlug && !slug) {
				throw new CMSOperationError(
					400,
					"Invalid slug: must contain at least one alphanumeric character",
					"INVALID_SLUG",
				);
			}
			if (slug && slug !== existing.slug) {
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

			let validatedData: Record<string, OperationData> | undefined;
			let relationIds: Record<string, string[]> | undefined;
			if (context.input.body.data) {
				await hooks?.onBeforeUpdate?.(
					context.facts.recordId,
					context.input.body.data,
					lifecycleContext,
				);
				const processed = await processRelationsInData(
					adapter,
					contentType,
					context.input.body.data,
					ensureSynced,
					context.identity?.id,
				);
				relationIds = processed.relationIds;
				const currentData = existing.data
					? (JSON.parse(existing.data) as Record<string, OperationData>)
					: {};
				const validation = getContentTypeZodSchema(contentType).safeParse({
					...currentData,
					...processed.processedData,
				});
				if (!validation.success) {
					throw new CMSOperationError(
						400,
						"Validation failed",
						"RECORD_VALIDATION_FAILED",
						validation.error.issues,
					);
				}
				validatedData = validation.data as Record<string, OperationData>;
			}
			const current = await getRecordOrThrow(
				adapter,
				ensureSynced,
				context.facts.contentType,
				context.facts.recordId,
			);
			assertRecordFacts(current, context.facts);
			const update: Partial<ContentItem> = { updatedAt: new Date() };
			if (slug) update.slug = slug;
			if (validatedData) update.data = JSON.stringify(validatedData);
			await adapter.update({
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
				],
				update,
			});
			if (relationIds)
				await syncRelations(adapter, context.facts.recordId, relationIds);
			const updated = await getRecordOrThrow(
				adapter,
				ensureSynced,
				context.facts.contentType,
				context.facts.recordId,
			);
			return operationContentItem(serializeContentItemWithType(updated));
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
			await hooks?.onBeforeDelete?.(
				context.facts.recordId,
				deleteContext(context),
			);
		},
		execute: async ({ facts }) => {
			const existing = await getRecordOrThrow(
				adapter,
				ensureSynced,
				facts.contentType,
				facts.recordId,
			);
			assertRecordFacts(existing, facts);
			await adapter.delete({
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
		},
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
		execute: async ({ facts }) => {
			const item = await getRecordOrThrow(
				adapter,
				ensureSynced,
				facts.contentType,
				facts.recordId ?? "",
			);
			assertRecordFacts(item, facts);
			const relations = await populateRelations(adapter, item);
			return {
				...operationContentItem(serializeContentItemWithType(item)),
				_relations: Object.fromEntries(
					Object.entries(relations).map(([field, records]) => [
						field,
						records.map(operationContentItem),
					]),
				),
			};
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
		facts: async ({ input }) => ({
			contentType: (
				await getContentTypeOrThrow(adapter, ensureSynced, input.typeSlug)
			).slug,
		}),
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
			return { contentType: sourceType.slug };
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
