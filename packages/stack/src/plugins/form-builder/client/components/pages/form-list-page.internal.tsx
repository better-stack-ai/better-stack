"use client";

import { useEffect, useRef, useState } from "react";
import {
	CanAccess,
	useNotify,
	usePluginOverrides,
	useBasePath,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import { useListState, type ListStateSchema } from "@btst/stack/client";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
import {
	MoreHorizontal,
	Plus,
	Pencil,
	Trash2,
	FileText,
	Loader2,
	Search,
} from "lucide-react";

import { useForms, useSuspenseForms, useDeleteForm } from "../../hooks";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { PageWrapper } from "../shared/page-wrapper";
import { EmptyState } from "../shared/empty-state";
import { Pagination } from "../shared/pagination";

// URL-synced search state: `?q=...` while typing (history: replace), clean
// URL when the query is empty (the default is omitted from the URL).
const LIST_STATE_SCHEMA = {
	q: { type: "string", default: "", history: "replace" },
} as const satisfies ListStateSchema;

const SEARCH_DEBOUNCE_MS = 300;

export function FormListPage() {
	const t = useTranslate();
	const notify = useNotify();
	const { localization } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const { router } = useStack();
	const navigate = router?.navigate;
	const Link = router?.Link;
	const basePath = useBasePath();

	const [{ q: search }, setListState] = useListState(
		"form-builder-forms",
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

	// The default (unsearched) list stays on the suspense hook so SSR/SSG
	// hydration works; the searched list uses the non-suspense hook so
	// typing shows an inline loading state instead of suspending the page.
	const defaultList = useSuspenseForms();
	const searchedList = useForms({ search, enabled: hasSearch });

	const activeList = hasSearch ? searchedList : defaultList;
	const { forms, total, hasMore, isLoadingMore, loadMore } = activeList;
	const isSearchLoading = hasSearch && searchedList.isLoading;

	const deleteMutation = useDeleteForm();

	const [deleteId, setDeleteId] = useState<string | null>(null);

	const LinkComponent = Link || "a";

	const handleDelete = async () => {
		if (!deleteId) return;

		try {
			await deleteMutation.mutateAsync(deleteId);
		} catch {
			notify.error(
				localization?.FORM_BUILDER_TOAST_ERROR ??
					t("formBuilder.toasts.error", "An error occurred. Please try again."),
			);
			return;
		}
		notify.success(
			localization?.FORM_BUILDER_TOAST_DELETE_SUCCESS ??
				t("formBuilder.toasts.deleteSuccess", "Form deleted successfully"),
		);
		setDeleteId(null);
	};

	const getStatusBadge = (status: string) => {
		const colors: Record<string, string> = {
			active:
				"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
			inactive:
				"bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
			archived: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
		};
		return (
			<span
				className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.inactive}`}
			>
				{status}
			</span>
		);
	};

	const newFormButton = (
		<CanAccess resource="form-builder:form" action="create">
			<Button asChild>
				<LinkComponent href={`${basePath}/forms/new`}>
					<Plus className="mr-2 h-4 w-4" />
					{localization?.FORM_BUILDER_BUTTON_NEW_FORM ??
						t("formBuilder.common.buttonNewForm", "New Form")}
				</LinkComponent>
			</Button>
		</CanAccess>
	);

	return (
		<PageWrapper testId="form-list-page">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold">
							{localization?.FORM_BUILDER_LIST_TITLE ??
								t("formBuilder.list.title", "Forms")}
						</h1>
						<p className="text-muted-foreground">
							{localization?.FORM_BUILDER_LIST_SUBTITLE ??
								t("formBuilder.list.subtitle", "Manage your forms")}
						</p>
					</div>
					{newFormButton}
				</div>

				<div className="relative max-w-sm">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						data-testid="form-builder-list-search"
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						placeholder={
							localization?.FORM_BUILDER_LIST_SEARCH_PLACEHOLDER ??
							t("formBuilder.list.searchPlaceholder", "Search forms...")
						}
						className="pl-9"
					/>
					{isSearchLoading && (
						<Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
					)}
				</div>

				{forms.length === 0 ? (
					isSearchLoading ? null : hasSearch ? (
						<EmptyState
							title={
								localization?.FORM_BUILDER_LIST_SEARCH_EMPTY ??
								t("formBuilder.list.searchEmpty", "No forms match your search")
							}
							description={
								localization?.FORM_BUILDER_LIST_SEARCH_EMPTY_DESCRIPTION ??
								t(
									"formBuilder.list.searchEmptyDescription",
									"Try a different search term.",
								)
							}
						/>
					) : (
						<EmptyState
							title={
								localization?.FORM_BUILDER_LIST_EMPTY ??
								t("formBuilder.list.empty", "No forms yet")
							}
							description={
								localization?.FORM_BUILDER_LIST_EMPTY_DESCRIPTION ??
								t(
									"formBuilder.list.emptyDescription",
									"Create your first form to get started.",
								)
							}
							action={newFormButton}
						/>
					)
				) : (
					<>
						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>
											{localization?.FORM_BUILDER_LIST_COLUMN_NAME ??
												t("formBuilder.list.columnName", "Name")}
										</TableHead>
										<TableHead>
											{localization?.FORM_BUILDER_LIST_COLUMN_SLUG ??
												t("formBuilder.list.columnSlug", "Slug")}
										</TableHead>
										<TableHead>
											{localization?.FORM_BUILDER_LIST_COLUMN_STATUS ??
												t("formBuilder.list.columnStatus", "Status")}
										</TableHead>
										<TableHead>
											{localization?.FORM_BUILDER_LIST_COLUMN_CREATED ??
												t("formBuilder.list.columnCreated", "Created")}
										</TableHead>
										<TableHead className="w-12">
											{localization?.FORM_BUILDER_LIST_COLUMN_ACTIONS ??
												t("formBuilder.list.columnActions", "Actions")}
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{forms.map((form) => (
										<TableRow key={form.id}>
											<TableCell className="font-medium">{form.name}</TableCell>
											<TableCell className="text-muted-foreground font-mono text-sm">
												{form.slug}
											</TableCell>
											<TableCell>{getStatusBadge(form.status)}</TableCell>
											<TableCell className="text-muted-foreground">
												{new Date(form.createdAt).toLocaleDateString()}
											</TableCell>
											<TableCell>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="icon">
															<MoreHorizontal className="h-4 w-4" />
															<span className="sr-only">
																{localization?.FORM_BUILDER_LIST_COLUMN_ACTIONS ??
																	t(
																		"formBuilder.list.columnActions",
																		"Actions",
																	)}
															</span>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<CanAccess
															resource="form-builder:form"
															action="update"
															params={{ id: form.id }}
														>
															<DropdownMenuItem
																onClick={() =>
																	navigate?.(
																		`${basePath}/forms/${form.id}/edit`,
																	)
																}
															>
																<Pencil className="mr-2 h-4 w-4" />
																{localization?.FORM_BUILDER_LIST_ACTION_EDIT ??
																	t("formBuilder.list.actionEdit", "Edit")}
															</DropdownMenuItem>
														</CanAccess>
														<CanAccess
															resource="form-builder:submission"
															action="read"
															params={{ formId: form.id }}
														>
															<DropdownMenuItem
																onClick={() =>
																	navigate?.(
																		`${basePath}/forms/${form.id}/submissions`,
																	)
																}
															>
																<FileText className="mr-2 h-4 w-4" />
																{localization?.FORM_BUILDER_LIST_ACTION_SUBMISSIONS ??
																	t(
																		"formBuilder.list.actionSubmissions",
																		"Submissions",
																	)}
															</DropdownMenuItem>
														</CanAccess>
														<CanAccess
															resource="form-builder:form"
															action="delete"
															params={{ id: form.id }}
														>
															<DropdownMenuItem
																className="text-destructive"
																onClick={() => setDeleteId(form.id)}
															>
																<Trash2 className="mr-2 h-4 w-4" />
																{localization?.FORM_BUILDER_LIST_ACTION_DELETE ??
																	t("formBuilder.list.actionDelete", "Delete")}
															</DropdownMenuItem>
														</CanAccess>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						<Pagination
							total={total}
							showing={forms.length}
							hasMore={hasMore}
							isLoadingMore={isLoadingMore}
							onLoadMore={loadMore}
							labels={{
								showing:
									localization?.FORM_BUILDER_LIST_PAGINATION_SHOWING ??
									t(
										"formBuilder.list.paginationShowing",
										"Showing {count} of {total}",
									),
								next:
									localization?.FORM_BUILDER_LIST_PAGINATION_NEXT ??
									t("formBuilder.list.paginationNext", "Load More"),
								loading:
									localization?.FORM_BUILDER_STATUS_LOADING ??
									t("formBuilder.common.statusLoading", "Loading..."),
							}}
						/>
					</>
				)}
			</div>

			{/* Delete confirmation dialog */}
			<AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{localization?.FORM_BUILDER_LIST_DELETE_TITLE ??
								t("formBuilder.list.deleteTitle", "Delete Form")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{localization?.FORM_BUILDER_EDITOR_DELETE_CONFIRM ??
								t(
									"formBuilder.editor.deleteConfirm",
									"Are you sure you want to delete this form? All submissions will also be deleted.",
								)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{localization?.FORM_BUILDER_BUTTON_CANCEL ??
								t("formBuilder.common.buttonCancel", "Cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteMutation.isPending
								? (localization?.FORM_BUILDER_STATUS_DELETING ??
									t("formBuilder.common.statusDeleting", "Deleting..."))
								: (localization?.FORM_BUILDER_BUTTON_DELETE ??
									t("formBuilder.common.buttonDelete", "Delete"))}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageWrapper>
	);
}
