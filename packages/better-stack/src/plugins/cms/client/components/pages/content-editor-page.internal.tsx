"use client";

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import {
	useSuspenseContentTypes,
	useContentItem,
	useCreateContent,
	useUpdateContent,
} from "../../hooks";
import { ContentForm } from "../forms/content-form";
import { InverseRelationsPanel } from "../inverse-relations-panel";
import { EmptyState } from "../shared/empty-state";
import { PageWrapper } from "../shared/page-wrapper";
import { EditorSkeleton } from "../loading/editor-skeleton";
import { CMS_LOCALIZATION } from "../../localization";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

/**
 * Parse prefill query parameters from the URL.
 * Looks for query params with the format `prefill_<fieldName>=<value>`
 * and returns a record of field names to values.
 *
 * Uses useState + useEffect pattern to work correctly with SSR/hydration.
 * During SSR, returns empty object. After hydration, parses URL params.
 *
 * @example
 * URL: /cms/comment/new?prefill_resourceId=123&prefill_author=John
 * Returns: { resourceId: "123", author: "John" }
 */
function usePrefillParams(): Record<string, string> {
	const [prefillData, setPrefillData] = useState<Record<string, string>>({});

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const params = new URLSearchParams(window.location.search);
		const data: Record<string, string> = {};

		for (const [key, value] of params.entries()) {
			if (key.startsWith("prefill_")) {
				const fieldName = key.slice("prefill_".length);
				if (fieldName) {
					data[fieldName] = value;
				}
			}
		}

		// Only update state if we have prefill data to avoid unnecessary re-renders
		if (Object.keys(data).length > 0) {
			setPrefillData(data);
		}
	}, []);

	return prefillData;
}

interface JsonSchemaProperty {
	fieldType?: string;
	relation?: {
		type: "belongsTo" | "hasMany" | "manyToMany";
		targetType: string;
	};
}

/**
 * Convert prefill params to the correct format for the form.
 * Relation fields need special handling:
 * - belongsTo: value should be { id: "uuid" }
 * - hasMany/manyToMany: value should be [{ id: "uuid" }]
 *
 * @param prefillParams - Raw prefill params from URL
 * @param jsonSchema - The content type's JSON schema
 * @returns Converted data suitable for initialData
 */
function convertPrefillToFormData(
	prefillParams: Record<string, string>,
	jsonSchema: Record<string, unknown>,
): Record<string, unknown> {
	const properties = jsonSchema.properties as
		| Record<string, JsonSchemaProperty>
		| undefined;

	if (!properties) {
		return prefillParams;
	}

	const result: Record<string, unknown> = {};

	for (const [fieldName, value] of Object.entries(prefillParams)) {
		const fieldSchema = properties[fieldName];

		if (fieldSchema?.fieldType === "relation" && fieldSchema.relation) {
			// Convert relation field value to the correct format
			if (fieldSchema.relation.type === "belongsTo") {
				// belongsTo expects { id: "uuid" }
				result[fieldName] = { id: value };
			} else {
				// hasMany/manyToMany expect [{ id: "uuid" }]
				result[fieldName] = [{ id: value }];
			}
		} else {
			// Non-relation fields: pass through as-is
			result[fieldName] = value;
		}
	}

	return result;
}

interface ContentEditorPageProps {
	typeSlug: string;
	id?: string;
}

export function ContentEditorPage({ typeSlug, id }: ContentEditorPageProps) {
	const overrides = usePluginOverrides<CMSPluginOverrides>("cms");
	const { navigate } = overrides;
	const localization = { ...CMS_LOCALIZATION, ...overrides.localization };
	const basePath = useBasePath();

	// Parse prefill query parameters for pre-populating fields when creating new items
	// This is used by the inverse relations panel to pre-fill the parent relation
	const prefillParams = usePrefillParams();

	// Call lifecycle hooks for authorization
	useRouteLifecycle({
		routeName: "contentEditor",
		context: {
			path: id ? `/cms/${typeSlug}/${id}` : `/cms/${typeSlug}/new`,
			params: id ? { typeSlug, id } : { typeSlug },
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (overrides, context) => {
			if (overrides.onBeforeEditorRendered) {
				return overrides.onBeforeEditorRendered(typeSlug, id ?? null, context);
			}
			return true;
		},
	});

	const { contentTypes } = useSuspenseContentTypes();
	const contentType = contentTypes.find((ct) => ct.slug === typeSlug);

	const isEditing = !!id;

	// useContentItem has enabled: !!id built-in, so it won't fetch when creating new items
	// This avoids conditional hook calls which violate React's Rules of Hooks
	const { item, isLoading: isLoadingItem } = useContentItem(typeSlug, id ?? "");

	const createContent = useCreateContent(typeSlug);
	const updateContent = useUpdateContent(typeSlug);

	if (!contentType) {
		return (
			<PageWrapper testId="cms-editor-page">
				<div className="w-full max-w-2xl">
					<EmptyState
						title={localization.CMS_ERROR_NOT_FOUND}
						description="Content type not found"
					/>
				</div>
			</PageWrapper>
		);
	}

	// Show loading skeleton while fetching item in edit mode
	if (isEditing && isLoadingItem) {
		return (
			<PageWrapper testId="cms-editor-page">
				<div className="w-full max-w-2xl">
					<EditorSkeleton />
				</div>
			</PageWrapper>
		);
	}

	if (isEditing && !item) {
		return (
			<PageWrapper testId="cms-editor-page">
				<div className="w-full max-w-2xl">
					<EmptyState
						title={localization.CMS_ERROR_NOT_FOUND}
						description="Content item not found"
					/>
				</div>
			</PageWrapper>
		);
	}

	const handleSubmit = async (data: {
		slug: string;
		data: Record<string, unknown>;
	}) => {
		if (isEditing && id) {
			await updateContent.mutateAsync({ id, data });
		} else {
			await createContent.mutateAsync(data);
		}
		navigate(`${basePath}/cms/${typeSlug}`);
	};

	const title = isEditing
		? localization.CMS_EDITOR_TITLE_EDIT.replace("{typeName}", contentType.name)
		: localization.CMS_EDITOR_TITLE_NEW.replace("{typeName}", contentType.name);

	return (
		<PageWrapper testId="cms-editor-page">
			<div className="w-full max-w-2xl space-y-6">
				<div className="flex items-center gap-4">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => navigate(`${basePath}/cms/${typeSlug}`)}
					>
						<ArrowLeft className="h-4 w-4" />
					</Button>
					<h1 className="text-2xl font-bold tracking-tight">{title}</h1>
				</div>

				<ContentForm
					key={isEditing ? `edit-${id}` : "create"}
					contentType={contentType}
					initialData={
						isEditing
							? item?.parsedData
							: Object.keys(prefillParams).length > 0
								? convertPrefillToFormData(
										prefillParams,
										JSON.parse(contentType.jsonSchema),
									)
								: undefined
					}
					initialSlug={item?.slug}
					isEditing={isEditing}
					onSubmit={handleSubmit}
					onCancel={() => navigate(`${basePath}/cms/${typeSlug}`)}
				/>

				{/* Show inverse relations panel when editing (not creating) */}
				{isEditing && id && (
					<InverseRelationsPanel contentTypeSlug={typeSlug} itemId={id} />
				)}
			</div>
		</PageWrapper>
	);
}
