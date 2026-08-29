"use client";

import { useState } from "react";
import {
	joinBasePath,
	PermissionAccess,
	useNotify,
	usePluginOverrides,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import { cmsPermissions } from "@btst/stack/plugins/cms/permissions";
import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";
import { Button } from "@workspace/ui/components/button";
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
import { MoreHorizontal, Plus, Pencil, Trash2 } from "lucide-react";

import {
	useSuspenseUIBuilderPages,
	useDeleteUIBuilderPage,
} from "../../hooks/ui-builder-hooks";
import type { UIBuilderPluginOverrides } from "../../overrides";
import { UI_BUILDER_PLUGIN_ID } from "../../constants";
import { uiBuilderLocalization } from "../../localization";
import { PageWrapper } from "../shared/page-wrapper";
import { EmptyState } from "../shared/empty-state";
import { Pagination } from "../shared/pagination";

export function PageListPage() {
	const t = useTranslate();
	const notify = useNotify();
	const { localization } =
		usePluginOverrides<UIBuilderPluginOverrides>(UI_BUILDER_PLUGIN_ID);
	const { router, plugins, basePath: legacyBasePath } = useStack();
	const navigate = router?.navigate;
	const basePath =
		plugins?.[UI_BUILDER_PLUGIN_ID]?.site.basePath ?? legacyBasePath;
	const { pages, total, hasMore, isLoadingMore, loadMore } =
		useSuspenseUIBuilderPages();
	const deleteMutation = useDeleteUIBuilderPage();

	const [deleteId, setDeleteId] = useState<string | null>(null);

	const LinkComponent = router?.Link ?? "a";

	const handleDelete = async () => {
		if (!deleteId) return;

		try {
			await deleteMutation.mutateAsync(deleteId);
		} catch {
			notify.error(
				localization?.pageList?.deleteError ??
					t(
						"uiBuilder.pageList.deleteError",
						uiBuilderLocalization.pageList.deleteError,
					),
			);
			return;
		}
		notify.success(
			localization?.pageList?.deleteSuccess ??
				t(
					"uiBuilder.pageList.deleteSuccess",
					uiBuilderLocalization.pageList.deleteSuccess,
				),
		);
		setDeleteId(null);
	};

	const getStatusBadge = (status: string) => {
		const colors: Record<string, string> = {
			published:
				"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
			draft:
				"bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
			archived: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
		};
		return (
			<span
				className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.draft}`}
			>
				{localization?.pageBuilder?.statusOptions?.[
					status as keyof typeof uiBuilderLocalization.pageBuilder.statusOptions
				] ??
					t(
						`uiBuilder.pageBuilder.statusOptions.${status}`,
						uiBuilderLocalization.pageBuilder.statusOptions[
							status as keyof typeof uiBuilderLocalization.pageBuilder.statusOptions
						] ?? status,
					)}
			</span>
		);
	};

	const createButton = (
		<PermissionAccess
			permission={cmsPermissions.record.create({
				contentType: UI_BUILDER_TYPE_SLUG,
			})}
		>
			<Button asChild>
				<LinkComponent href={joinBasePath(basePath, "/ui-builder/new")}>
					<Plus data-icon="inline-start" />
					{localization?.pageList?.createButton ??
						t(
							"uiBuilder.pageList.createButton",
							uiBuilderLocalization.pageList.createButton,
						)}
				</LinkComponent>
			</Button>
		</PermissionAccess>
	);

	return (
		<PageWrapper testId="page-list-page">
			<div className="flex w-full max-w-5xl flex-col gap-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold">
							{localization?.pageList?.title ??
								t(
									"uiBuilder.pageList.title",
									uiBuilderLocalization.pageList.title,
								)}
						</h1>
						<p className="text-muted-foreground">
							{localization?.pageList?.description ??
								t(
									"uiBuilder.pageList.description",
									uiBuilderLocalization.pageList.description,
								)}
						</p>
					</div>
					{createButton}
				</div>

				{pages.length === 0 ? (
					<EmptyState
						title={
							localization?.pageList?.emptyState?.title ??
							t(
								"uiBuilder.pageList.emptyState.title",
								uiBuilderLocalization.pageList.emptyState.title,
							)
						}
						description={
							localization?.pageList?.emptyState?.description ??
							t(
								"uiBuilder.pageList.emptyState.description",
								uiBuilderLocalization.pageList.emptyState.description,
							)
						}
						action={createButton}
					/>
				) : (
					<>
						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>
											{localization?.pageList?.columns?.slug ??
												t(
													"uiBuilder.pageList.columns.slug",
													uiBuilderLocalization.pageList.columns.slug,
												)}
										</TableHead>
										<TableHead>
											{localization?.pageList?.columns?.status ??
												t(
													"uiBuilder.pageList.columns.status",
													uiBuilderLocalization.pageList.columns.status,
												)}
										</TableHead>
										<TableHead>
											{localization?.pageList?.columns?.updatedAt ??
												t(
													"uiBuilder.pageList.columns.updatedAt",
													uiBuilderLocalization.pageList.columns.updatedAt,
												)}
										</TableHead>
										<TableHead className="w-12">
											{localization?.pageList?.columns?.actions ??
												t(
													"uiBuilder.pageList.columns.actions",
													uiBuilderLocalization.pageList.columns.actions,
												)}
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{pages.map((page) => (
										<TableRow key={page.id}>
											<TableCell className="font-mono text-sm">
												{page.slug}
											</TableCell>
											<TableCell>
												{getStatusBadge(page.parsedData.status)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{new Date(page.updatedAt).toLocaleDateString()}
											</TableCell>
											<TableCell>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="icon">
															<MoreHorizontal />
															<span className="sr-only">
																{localization?.pageList?.actions?.label ??
																	t(
																		"uiBuilder.pageList.actions.label",
																		uiBuilderLocalization.pageList.actions
																			.label,
																	)}
															</span>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<PermissionAccess
															permission={cmsPermissions.record.update({
																contentType: UI_BUILDER_TYPE_SLUG,
																recordId: page.id,
																...(page.authorId
																	? { authorId: page.authorId }
																	: {}),
															})}
														>
															<DropdownMenuItem
																onClick={() =>
																	navigate?.(
																		joinBasePath(
																			basePath,
																			`/ui-builder/${page.id}/edit`,
																		),
																	)
																}
															>
																<Pencil data-icon="inline-start" />
																{localization?.pageList?.actions?.edit ??
																	t(
																		"uiBuilder.pageList.actions.edit",
																		uiBuilderLocalization.pageList.actions.edit,
																	)}
															</DropdownMenuItem>
														</PermissionAccess>
														<PermissionAccess
															permission={cmsPermissions.record.delete({
																contentType: UI_BUILDER_TYPE_SLUG,
																recordId: page.id,
																...(page.authorId
																	? { authorId: page.authorId }
																	: {}),
															})}
														>
															<DropdownMenuItem
																className="text-destructive"
																onClick={() => setDeleteId(page.id)}
															>
																<Trash2 data-icon="inline-start" />
																{localization?.pageList?.actions?.delete ??
																	t(
																		"uiBuilder.pageList.actions.delete",
																		uiBuilderLocalization.pageList.actions
																			.delete,
																	)}
															</DropdownMenuItem>
														</PermissionAccess>
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
							showing={pages.length}
							hasMore={hasMore}
							isLoadingMore={isLoadingMore}
							onLoadMore={loadMore}
							labels={{
								showing:
									localization?.pageList?.pagination?.showing ??
									t(
										"uiBuilder.pageList.pagination.showing",
										uiBuilderLocalization.pageList.pagination.showing,
									),
								next:
									localization?.pageList?.pagination?.loadMore ??
									t(
										"uiBuilder.pageList.pagination.loadMore",
										uiBuilderLocalization.pageList.pagination.loadMore,
									),
								loading:
									localization?.pageList?.pagination?.loading ??
									t(
										"uiBuilder.pageList.pagination.loading",
										uiBuilderLocalization.pageList.pagination.loading,
									),
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
							{localization?.pageList?.deleteDialog?.title ??
								t(
									"uiBuilder.pageList.deleteDialog.title",
									uiBuilderLocalization.pageList.deleteDialog.title,
								)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{localization?.pageList?.deleteDialog?.description ??
								t(
									"uiBuilder.pageList.deleteDialog.description",
									uiBuilderLocalization.pageList.deleteDialog.description,
								)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{localization?.pageList?.deleteDialog?.cancel ??
								t(
									"uiBuilder.pageList.deleteDialog.cancel",
									uiBuilderLocalization.pageList.deleteDialog.cancel,
								)}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteMutation.isPending
								? (localization?.pageList?.deleteDialog?.deleting ??
									t(
										"uiBuilder.pageList.deleteDialog.deleting",
										uiBuilderLocalization.pageList.deleteDialog.deleting,
									))
								: (localization?.pageList?.deleteDialog?.confirm ??
									t(
										"uiBuilder.pageList.deleteDialog.confirm",
										uiBuilderLocalization.pageList.deleteDialog.confirm,
									))}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageWrapper>
	);
}
