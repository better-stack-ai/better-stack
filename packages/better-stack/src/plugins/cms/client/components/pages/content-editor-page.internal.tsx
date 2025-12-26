"use client";

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

interface ContentEditorPageProps {
	typeSlug: string;
	id?: string;
}

export function ContentEditorPage({ typeSlug, id }: ContentEditorPageProps) {
	const overrides = usePluginOverrides<CMSPluginOverrides>("cms");
	const { navigate } = overrides;
	const localization = { ...CMS_LOCALIZATION, ...overrides.localization };
	const basePath = useBasePath();

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
					initialData={item?.parsedData}
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
