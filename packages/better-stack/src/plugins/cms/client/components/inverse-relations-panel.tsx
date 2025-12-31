"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	Plus,
	Trash2,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { createApiClient } from "@btst/stack/plugins/client";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import { useDeleteContent } from "../hooks";
import type { CMSPluginOverrides } from "../overrides";
import type { CMSApiRouter } from "../../api";
import type { SerializedContentItemWithType } from "../../types";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";

interface InverseRelation {
	sourceType: string;
	sourceTypeName: string;
	fieldName: string;
	count: number;
}

interface InverseRelationsPanelProps {
	contentTypeSlug: string;
	itemId: string;
}

/**
 * Panel that shows content items that reference this item via belongsTo relations.
 * For example, when editing a Resource, this shows all Comments that belong to it.
 */
export function InverseRelationsPanel({
	contentTypeSlug,
	itemId,
}: InverseRelationsPanelProps) {
	const { apiBaseURL, apiBasePath, headers, navigate, Link } =
		usePluginOverrides<CMSPluginOverrides>("cms");
	const basePath = useBasePath();
	const client = createApiClient<CMSApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});

	// Fetch inverse relations metadata
	const { data: inverseRelationsData, isLoading } = useQuery({
		queryKey: ["cmsInverseRelations", contentTypeSlug, itemId],
		queryFn: async () => {
			const response = await client("/content-types/:slug/inverse-relations", {
				method: "GET",
				params: { slug: contentTypeSlug },
				query: { itemId },
				headers,
			});
			return (
				(response as { data?: { inverseRelations: InverseRelation[] } }).data
					?.inverseRelations ?? []
			);
		},
		staleTime: 1000 * 60 * 5,
	});

	if (isLoading) {
		return (
			<Card className="animate-pulse">
				<CardHeader>
					<div className="h-5 w-32 bg-muted rounded" />
				</CardHeader>
			</Card>
		);
	}

	const inverseRelations = inverseRelationsData ?? [];

	if (inverseRelations.length === 0) {
		return null;
	}

	return (
		<div className="space-y-4">
			<h3 className="text-lg font-semibold">Related Items</h3>
			{inverseRelations.map((relation) => (
				<InverseRelationSection
					key={`${relation.sourceType}-${relation.fieldName}`}
					relation={relation}
					contentTypeSlug={contentTypeSlug}
					itemId={itemId}
					basePath={basePath}
					navigate={navigate}
					Link={Link}
					client={client}
					headers={headers}
				/>
			))}
		</div>
	);
}

interface InverseRelationSectionProps {
	relation: InverseRelation;
	contentTypeSlug: string;
	itemId: string;
	basePath: string;
	navigate: (path: string) => void;
	Link?: React.ComponentType<{
		href?: string;
		children?: React.ReactNode;
		className?: string;
	}>;
	client: ReturnType<typeof createApiClient<CMSApiRouter>>;
	headers?: HeadersInit;
}

function InverseRelationSection({
	relation,
	contentTypeSlug,
	itemId,
	basePath,
	navigate,
	Link,
	client,
	headers,
}: InverseRelationSectionProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const deleteContent = useDeleteContent(relation.sourceType);

	// Fetch items for this inverse relation
	const { data: itemsData, refetch } = useQuery({
		queryKey: [
			"cmsInverseRelationItems",
			contentTypeSlug,
			relation.sourceType,
			itemId,
			relation.fieldName,
		],
		queryFn: async () => {
			const response = await client(
				"/content-types/:slug/inverse-relations/:sourceType",
				{
					method: "GET",
					params: { slug: contentTypeSlug, sourceType: relation.sourceType },
					query: { itemId, fieldName: relation.fieldName },
					headers,
				},
			);
			return (
				(
					response as {
						data?: { items: SerializedContentItemWithType[]; total: number };
					}
				).data ?? { items: [], total: 0 }
			);
		},
		staleTime: 1000 * 60 * 5,
		enabled: isExpanded,
	});

	const items = itemsData?.items ?? [];
	const total = itemsData?.total ?? relation.count;

	const handleDelete = async () => {
		if (deleteItemId) {
			setDeleteError(null);
			try {
				await deleteContent.mutateAsync(deleteItemId);
				setDeleteItemId(null);
				refetch();
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to delete item. Please try again.";
				setDeleteError(message);
			}
		}
	};

	// Create new item with pre-filled belongsTo field
	const handleAddNew = () => {
		// Navigate to create page with query param to pre-fill the relation.
		// ContentEditorPage reads prefill_* query params and passes them to ContentForm as initialData.
		const createUrl = `${basePath}/cms/${relation.sourceType}/new?prefill_${relation.fieldName}=${itemId}`;
		navigate(createUrl);
	};

	const LinkComponent = Link ?? "a";

	return (
		<Card>
			<CardHeader className="py-3">
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className="flex items-center justify-between w-full text-left"
				>
					<CardTitle className="text-base flex items-center gap-2">
						{isExpanded ? (
							<ChevronDown className="h-4 w-4" />
						) : (
							<ChevronRight className="h-4 w-4" />
						)}
						{relation.sourceTypeName} ({total})
					</CardTitle>
				</button>
			</CardHeader>
			{isExpanded && (
				<CardContent className="pt-0">
					{items.length === 0 ? (
						<p className="text-sm text-muted-foreground py-2">
							No {relation.sourceTypeName.toLowerCase()} items yet.
						</p>
					) : (
						<ul className="space-y-2">
							{items.map((item) => {
								const displayValue = getDisplayValue(item);
								const editUrl = `${basePath}/cms/${relation.sourceType}/${item.id}`;
								return (
									<li
										key={item.id}
										className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
									>
										<LinkComponent
											href={editUrl}
											className="flex-1 text-sm hover:underline flex items-center gap-2"
										>
											<span className="truncate">{displayValue}</span>
											<ExternalLink className="h-3 w-3 opacity-50" />
										</LinkComponent>
										<Button
											variant="ghost"
											size="icon"
											className="h-7 w-7 text-muted-foreground hover:text-destructive"
											onClick={() => setDeleteItemId(item.id)}
										>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									</li>
								);
							})}
						</ul>
					)}
					<div className="mt-3 pt-3 border-t">
						<Button
							variant="outline"
							size="sm"
							onClick={handleAddNew}
							className="w-full"
						>
							<Plus className="h-4 w-4 mr-2" />
							Add {relation.sourceTypeName}
						</Button>
					</div>
				</CardContent>
			)}

			{/* Delete confirmation dialog */}
			<AlertDialog
				open={!!deleteItemId}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteItemId(null);
						setDeleteError(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete {relation.sourceTypeName}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete this{" "}
							{relation.sourceTypeName.toLowerCase()}.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{deleteError && (
						<p className="text-sm text-destructive">{deleteError}</p>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}

/**
 * Get a display value from an item's parsedData
 */
function getDisplayValue(item: SerializedContentItemWithType): string {
	const data = item.parsedData as Record<string, unknown>;
	// Try common display fields
	const displayFields = ["name", "title", "label", "content", "author", "slug"];
	for (const field of displayFields) {
		if (typeof data[field] === "string" && data[field]) {
			const value = data[field] as string;
			return value.length > 50 ? `${value.slice(0, 50)}...` : value;
		}
	}
	return item.slug;
}
