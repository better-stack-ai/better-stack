"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, ArrowLeft, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import {
	joinBasePath,
	PermissionAccess,
	useNotify,
	usePluginOverrides,
	useStack,
	useTranslate,
	type TranslateFn,
} from "@btst/stack/context";
import { cmsPermissions } from "../../../permissions";
import { useListState, type ListStateSchema } from "@btst/stack/client/hooks";
import { orderCMSContentTypes, type CMSPluginOverrides } from "../../overrides";
import { CMS_PLUGIN_ID } from "../../constants";
import type { SerializedContentItemWithType } from "../../../types";
import {
	useContent,
	useSuspenseContent,
	useSuspenseContentTypes,
	useDeleteContent,
} from "../../hooks";
import { EmptyState } from "../shared/empty-state";
import { PageWrapper } from "../shared/page-wrapper";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

interface ContentListPageProps {
	typeSlug: string;
}

// URL-synced search state: `?q=...` while typing (history: replace), clean
// URL when the query is empty (the default is omitted from the URL).
const LIST_STATE_SCHEMA = {
	q: { type: "string", default: "", history: "replace" },
} as const satisfies ListStateSchema;

const SEARCH_DEBOUNCE_MS = 300;

export function ContentListPage({ typeSlug }: ContentListPageProps) {
	const t = useTranslate();
	const notify = useNotify();
	const overrides = usePluginOverrides<CMSPluginOverrides>(CMS_PLUGIN_ID);
	const { localization } = overrides;
	const { router, plugins, basePath: legacyBasePath } = useStack();
	const navigate = router?.navigate;
	const Link = router?.Link;
	const basePath = plugins?.[CMS_PLUGIN_ID]?.site.basePath ?? legacyBasePath;

	// Call route lifecycle hooks for telemetry and application behavior.
	useRouteLifecycle({
		routeName: "contentList",
		context: {
			path: `/cms/${typeSlug}`,
			params: { typeSlug },
			isSSR: typeof window === "undefined",
		},
		overrides,
	});

	const limit = 20;

	const [{ q: search }, setListState] = useListState(
		`cms-${typeSlug}`,
		LIST_STATE_SCHEMA,
	);

	// Local input state debounced into the URL-synced query, so the list
	// query (and URL) only update after the user pauses typing.
	const [searchInput, setSearchInput] = useState(search);

	// External `q` changes (hydration after SSR-empty search params,
	// back/forward navigation) re-seed the input instead of being clobbered
	// by the debounced write below, which only reflects user edits.
	const lastSyncedSearch = useRef(search);
	useEffect(() => {
		if (search !== lastSyncedSearch.current) {
			lastSyncedSearch.current = search;
			setSearchInput(search);
		}
	}, [search]);

	useEffect(() => {
		if (searchInput === search) return;
		const timeout = setTimeout(() => {
			lastSyncedSearch.current = searchInput;
			setListState({ q: searchInput });
		}, SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timeout);
	}, [searchInput, search, setListState]);

	const hasSearch = search.trim().length > 0;

	const { contentTypes: serverContentTypes } = useSuspenseContentTypes();
	const contentTypes = orderCMSContentTypes(
		serverContentTypes,
		plugins?.[CMS_PLUGIN_ID]?.config,
	);
	const contentType = contentTypes.find((ct) => ct.slug === typeSlug);

	// The default (unsearched) list stays on the suspense hook so SSR/SSG
	// hydration works; the searched list uses the non-suspense hook so
	// typing shows an inline loading state instead of suspending the page.
	const defaultList = useSuspenseContent(typeSlug, { limit });
	const searchedList = useContent(typeSlug, {
		limit,
		search,
		enabled: hasSearch,
	});

	const activeList = hasSearch ? searchedList : defaultList;
	const { items, total, loadMore, hasMore, isLoadingMore } = activeList;
	const isSearchLoading = hasSearch && searchedList.isLoading;

	const deleteContent = useDeleteContent(typeSlug);

	const LinkComponent = Link || "a";

	const handleDelete = async (id: string) => {
		try {
			await deleteContent.mutateAsync(id);
		} catch {
			notify.error(
				localization?.CMS_TOAST_ERROR ??
					t("cms.toasts.error", "An error occurred. Please try again."),
			);
			return;
		}
		notify.success(
			localization?.CMS_TOAST_DELETE_SUCCESS ??
				t("cms.toasts.deleteSuccess", "Item deleted successfully"),
		);
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString();
	};

	if (!contentType) {
		return (
			<PageWrapper testId="cms-list-page">
				<div className="w-full max-w-5xl">
					<EmptyState
						title={
							localization?.CMS_ERROR_NOT_FOUND ??
							t("cms.common.notFound", "Not found")
						}
						description={
							localization?.CMS_ERROR_TYPE_NOT_FOUND_DESCRIPTION ??
							t("cms.common.typeNotFoundDescription", "Content type not found")
						}
					/>
				</div>
			</PageWrapper>
		);
	}

	return (
		<PageWrapper testId="cms-list-page">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => void navigate?.(joinBasePath(basePath, "/cms"))}
						>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div>
							<h1 className="text-2xl font-bold tracking-tight">
								{contentType.name}
							</h1>
							{contentType.description && (
								<p className="text-muted-foreground">
									{contentType.description}
								</p>
							)}
						</div>
					</div>
					<PermissionAccess
						permission={cmsPermissions.record.create({
							contentType: typeSlug,
						})}
					>
						<Button
							onClick={() =>
								void navigate?.(joinBasePath(basePath, `/cms/${typeSlug}/new`))
							}
						>
							<Plus className="h-4 w-4 mr-2" />
							{localization?.CMS_BUTTON_NEW_ITEM ??
								t("cms.common.newItem", "New Item")}
						</Button>
					</PermissionAccess>
				</div>

				<div className="relative max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						data-testid="cms-list-search"
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						placeholder={
							localization?.CMS_LIST_SEARCH_PLACEHOLDER ??
							t("cms.list.searchPlaceholder", "Search items...")
						}
						className="pl-9"
					/>
					{isSearchLoading && (
						<Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
					)}
				</div>

				{items.length === 0 ? (
					isSearchLoading ? null : hasSearch ? (
						<EmptyState
							title={
								localization?.CMS_LIST_SEARCH_EMPTY ??
								t("cms.list.searchEmpty", "No items match your search")
							}
							description={
								localization?.CMS_LIST_SEARCH_EMPTY_DESCRIPTION ??
								t(
									"cms.list.searchEmptyDescription",
									"Try a different search term.",
								)
							}
						/>
					) : (
						<EmptyState
							title={
								localization?.CMS_LIST_EMPTY ??
								t("cms.list.empty", "No items yet")
							}
							description={
								localization?.CMS_LIST_EMPTY_DESCRIPTION ??
								t(
									"cms.list.emptyDescription",
									"Create your first item to get started.",
								)
							}
							action={
								<PermissionAccess
									permission={cmsPermissions.record.create({
										contentType: typeSlug,
									})}
								>
									<Button
										onClick={() =>
											void navigate?.(
												joinBasePath(basePath, `/cms/${typeSlug}/new`),
											)
										}
									>
										<Plus className="h-4 w-4 mr-2" />
										{localization?.CMS_BUTTON_CREATE ??
											t("cms.common.create", "Create")}
									</Button>
								</PermissionAccess>
							}
						/>
					)
				) : (
					<ContentTable
						items={items}
						total={total}
						typeSlug={typeSlug}
						basePath={basePath}
						LinkComponent={LinkComponent}
						navigate={navigate}
						onDelete={handleDelete}
						isDeleting={deleteContent.isPending}
						formatDate={formatDate}
						loadMore={loadMore}
						hasMore={hasMore}
						isLoadingMore={isLoadingMore}
						localization={localization}
						t={t}
					/>
				)}
			</div>
		</PageWrapper>
	);
}

function ContentTable({
	items,
	total,
	typeSlug,
	basePath,
	LinkComponent,
	navigate,
	onDelete,
	isDeleting,
	formatDate,
	loadMore,
	hasMore,
	isLoadingMore,
	localization,
	t,
}: {
	items: SerializedContentItemWithType[];
	total: number;
	typeSlug: string;
	basePath: string;
	LinkComponent: React.ElementType;
	navigate?: (path: string) => void | Promise<void>;
	onDelete: (id: string) => void;
	isDeleting: boolean;
	formatDate: (dateString: string) => string;
	loadMore: () => void;
	hasMore: boolean;
	isLoadingMore: boolean;
	localization: CMSPluginOverrides["localization"];
	t: TranslateFn;
}) {
	return (
		<div className="border rounded-lg">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>
							{localization?.CMS_LIST_COLUMN_SLUG ??
								t("cms.list.columnSlug", "Slug")}
						</TableHead>
						<TableHead>
							{localization?.CMS_LIST_COLUMN_CREATED ??
								t("cms.list.columnCreated", "Created")}
						</TableHead>
						<TableHead>
							{localization?.CMS_LIST_COLUMN_UPDATED ??
								t("cms.list.columnUpdated", "Updated")}
						</TableHead>
						<TableHead className="w-[100px]">
							{localization?.CMS_LIST_COLUMN_ACTIONS ??
								t("cms.list.columnActions", "Actions")}
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((item) => (
						<TableRow key={item.id}>
							<TableCell className="font-medium">
								<LinkComponent
									href={joinBasePath(basePath, `/cms/${typeSlug}/${item.id}`)}
									className="hover:underline"
								>
									{item.slug}
								</LinkComponent>
							</TableCell>
							<TableCell>{formatDate(item.createdAt)}</TableCell>
							<TableCell>{formatDate(item.updatedAt)}</TableCell>
							<TableCell>
								<div className="flex items-center gap-1">
									<PermissionAccess
										permission={cmsPermissions.record.update({
											contentType: item.contentType?.slug ?? typeSlug,
											recordId: item.id,
											...(item.authorId ? { authorId: item.authorId } : {}),
										})}
									>
										<Button
											variant="ghost"
											size="icon"
											onClick={() =>
												void navigate?.(
													joinBasePath(basePath, `/cms/${typeSlug}/${item.id}`),
												)
											}
										>
											<Pencil className="h-4 w-4" />
										</Button>
									</PermissionAccess>
									<PermissionAccess
										permission={cmsPermissions.record.delete({
											contentType: item.contentType?.slug ?? typeSlug,
											recordId: item.id,
											...(item.authorId ? { authorId: item.authorId } : {}),
										})}
									>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => onDelete(item.id)}
											disabled={isDeleting}
										>
											<Trash2 className="h-4 w-4 text-destructive" />
										</Button>
									</PermissionAccess>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{/* Load More and pagination info */}
			<div className="flex items-center justify-between px-4 py-3 border-t">
				<p className="text-sm text-muted-foreground">
					{(
						localization?.CMS_LIST_PAGINATION_SHOWING ??
						t("cms.list.paginationShowing", "Showing {from}-{to} of {total}")
					)
						.replace("{from}", "1")
						.replace("{to}", String(items.length))
						.replace("{total}", String(total))}
				</p>
				{hasMore && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => loadMore()}
						disabled={isLoadingMore}
					>
						{isLoadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
						{localization?.CMS_LIST_PAGINATION_NEXT ??
							t("cms.list.paginationNext", "Next")}
					</Button>
				)}
			</div>
		</div>
	);
}
