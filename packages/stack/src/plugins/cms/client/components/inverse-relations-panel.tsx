"use client";

import { useState } from "react";
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
import {
	joinBasePath,
	PermissionAccess,
	usePluginOverrides,
	useStack,
	useTranslate,
	type TranslateFn,
} from "@btst/stack/context";
import { cmsPermissions } from "../../permissions";
import {
	useDeleteContent,
	useInverseRelations,
	useInverseRelationItems,
} from "../hooks";
import type { CMSPluginOverrides } from "../overrides";
import { CMS_PLUGIN_ID } from "../constants";
import type {
	InverseRelation,
	SerializedContentItemWithType,
} from "../../types";
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
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<CMSPluginOverrides>(CMS_PLUGIN_ID);
	const { router, plugins, basePath: stackBasePath } = useStack();
	const navigate = router?.navigate;
	const Link = router?.Link;
	const basePath = plugins?.[CMS_PLUGIN_ID]?.site.basePath ?? stackBasePath;

	// Fetch inverse relations metadata
	const { inverseRelations, isLoading } = useInverseRelations(
		contentTypeSlug,
		itemId,
	);

	if (isLoading) {
		return (
			<Card className="animate-pulse">
				<CardHeader>
					<div className="h-5 w-32 bg-muted rounded" />
				</CardHeader>
			</Card>
		);
	}

	if (inverseRelations.length === 0) {
		return null;
	}

	// When a single source content type has multiple belongsTo fields pointing
	// at this target type (e.g. StackSynergy has both compoundAId and
	// compoundBId → compound), the section title alone ("Stack Synergy") is
	// ambiguous — two cards would render with identical headings. Mark those
	// relations so we can disambiguate them by field name.
	const sourceTypeCounts = new Map<string, number>();
	for (const rel of inverseRelations) {
		sourceTypeCounts.set(
			rel.sourceType,
			(sourceTypeCounts.get(rel.sourceType) ?? 0) + 1,
		);
	}

	return (
		<div className="space-y-4">
			<h3 className="text-lg font-semibold">
				{localization?.CMS_RELATED_ITEMS_TITLE ??
					t("cms.relations.relatedItemsTitle", "Related Items")}
			</h3>
			{inverseRelations.map((relation) => (
				<InverseRelationSection
					key={`${relation.sourceType}-${relation.fieldName}`}
					relation={relation}
					contentTypeSlug={contentTypeSlug}
					itemId={itemId}
					basePath={basePath}
					navigate={navigate}
					Link={Link}
					localization={localization}
					t={t}
					ambiguous={(sourceTypeCounts.get(relation.sourceType) ?? 0) > 1}
				/>
			))}
		</div>
	);
}

/**
 * Turn a relation field name like `compoundAId` / `categoryIds` into a
 * friendlier label like `Compound A` / `Category` for display in the
 * inverse-relations panel when two sections would otherwise share a title.
 *
 * Strips a trailing `Id` or `Ids`, splits camelCase boundaries, and
 * title-cases the result. Leaves unrecognised shapes as-is so we never
 * produce an empty string.
 */
function humanizeFieldName(fieldName: string): string {
	const stripped = fieldName.replace(/Ids?$/, "") || fieldName;
	const words = stripped
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.trim()
		.split(/\s+/);
	return words.map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
}

interface InverseRelationSectionProps {
	relation: InverseRelation;
	contentTypeSlug: string;
	itemId: string;
	basePath: string;
	navigate?: (path: string) => void | Promise<void>;
	Link?: React.ComponentType<{
		href?: string;
		children?: React.ReactNode;
		className?: string;
	}>;
	localization: CMSPluginOverrides["localization"];
	t: TranslateFn;
	/**
	 * True when another inverse relation from the same `sourceType` is also
	 * being rendered — in which case the field-name suffix is shown so the
	 * user can tell the two cards apart.
	 */
	ambiguous: boolean;
}

function InverseRelationSection({
	relation,
	contentTypeSlug,
	itemId,
	basePath,
	navigate,
	Link,
	localization,
	t,
	ambiguous,
}: InverseRelationSectionProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const deleteContent = useDeleteContent(relation.sourceType);

	// Fetch items for this inverse relation
	const {
		items,
		total: fetchedTotal,
		refetch,
	} = useInverseRelationItems(
		{
			contentTypeSlug,
			sourceType: relation.sourceType,
			itemId,
			fieldName: relation.fieldName,
		},
		{ enabled: isExpanded },
	);

	const total = fetchedTotal || relation.count;

	const handleDelete = async () => {
		if (deleteItemId) {
			setDeleteError(null);
			try {
				await deleteContent.mutateAsync(deleteItemId);
				setDeleteItemId(null);
				void refetch();
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: (localization?.CMS_RELATED_DELETE_ERROR ??
							t(
								"cms.relations.relatedDeleteError",
								"Failed to delete item. Please try again.",
							));
				setDeleteError(message);
			}
		}
	};

	// Create new item with pre-filled belongsTo field
	const handleAddNew = () => {
		// Navigate to create page with query param to pre-fill the relation.
		// ContentEditorPage reads prefill_* query params and passes them to ContentForm as initialData.
		const createUrl = joinBasePath(
			basePath,
			`/cms/${relation.sourceType}/new?prefill_${relation.fieldName}=${itemId}`,
		);
		void navigate?.(createUrl);
	};

	const LinkComponent = Link ?? "a";
	const fieldLabel = ambiguous ? humanizeFieldName(relation.fieldName) : null;

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
						<span>{relation.sourceTypeName}</span>
						{fieldLabel && (
							<span className="font-normal text-muted-foreground">
								· {fieldLabel}
							</span>
						)}
						<span className="font-normal text-muted-foreground">({total})</span>
					</CardTitle>
				</button>
			</CardHeader>
			{isExpanded && (
				<CardContent className="pt-0">
					{items.length === 0 ? (
						<p className="text-sm text-muted-foreground py-2">
							{(
								localization?.CMS_RELATED_EMPTY ??
								t(
									"cms.relations.relatedEmpty",
									"No {sourceTypeName} items yet.",
								)
							).replace(
								"{sourceTypeName}",
								relation.sourceTypeName.toLowerCase(),
							)}
						</p>
					) : (
						<ul className="space-y-2">
							{items.map((item: SerializedContentItemWithType) => {
								const displayValue = getDisplayValue(item);
								const editUrl = joinBasePath(
									basePath,
									`/cms/${relation.sourceType}/${item.id}`,
								);
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
										<PermissionAccess
											permission={cmsPermissions.record.delete({
												contentType:
													item.contentType?.slug ?? relation.sourceType,
												recordId: item.id,
												...(item.authorId ? { authorId: item.authorId } : {}),
											})}
										>
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7 text-muted-foreground hover:text-destructive"
												onClick={() => setDeleteItemId(item.id)}
											>
												<Trash2 className="h-3.5 w-3.5" />
											</Button>
										</PermissionAccess>
									</li>
								);
							})}
						</ul>
					)}
					<div className="mt-3 pt-3 border-t">
						<PermissionAccess
							permission={cmsPermissions.record.create({
								contentType: relation.sourceType,
							})}
						>
							<Button
								variant="outline"
								size="sm"
								onClick={handleAddNew}
								className="w-full"
							>
								<Plus className="h-4 w-4 mr-2" />
								{(
									localization?.CMS_RELATED_ADD ??
									t("cms.relations.relatedAdd", "Add {sourceTypeName}")
								).replace("{sourceTypeName}", relation.sourceTypeName)}
								{fieldLabel ? ` (${fieldLabel})` : ""}
							</Button>
						</PermissionAccess>
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
							{(
								localization?.CMS_RELATED_DELETE_TITLE ??
								t(
									"cms.relations.relatedDeleteTitle",
									"Delete {sourceTypeName}?",
								)
							).replace("{sourceTypeName}", relation.sourceTypeName)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{(
								localization?.CMS_RELATED_DELETE_DESCRIPTION ??
								t(
									"cms.relations.relatedDeleteDescription",
									"This action cannot be undone. This will permanently delete this {sourceTypeName}.",
								)
							).replace(
								"{sourceTypeName}",
								relation.sourceTypeName.toLowerCase(),
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{deleteError && (
						<p className="text-sm text-destructive">{deleteError}</p>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel>
							{localization?.CMS_BUTTON_CANCEL ??
								t("cms.common.cancel", "Cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{localization?.CMS_BUTTON_DELETE ??
								t("cms.common.delete", "Delete")}
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
