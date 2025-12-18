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
import { EmptyState } from "../shared/empty-state";
import { PageWrapper } from "../shared/page-wrapper";
import { EditorSkeleton } from "../loading/editor-skeleton";
import { CMS_LOCALIZATION } from "../../localization";

interface ContentEditorPageProps {
	typeSlug: string;
	id?: string;
}

export function ContentEditorPage({ typeSlug, id }: ContentEditorPageProps) {
	const { navigate, localization: customLocalization } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const localization = { ...CMS_LOCALIZATION, ...customLocalization };
	const basePath = useBasePath();

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
					contentType={contentType}
					initialData={item?.parsedData}
					initialSlug={item?.slug}
					isEditing={isEditing}
					onSubmit={handleSubmit}
					onCancel={() => navigate(`${basePath}/cms/${typeSlug}`)}
				/>
			</div>
		</PageWrapper>
	);
}
