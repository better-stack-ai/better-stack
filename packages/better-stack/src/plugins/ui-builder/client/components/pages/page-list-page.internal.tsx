"use client";

import { useState } from "react";
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
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
import { MoreHorizontal, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

import {
	useSuspenseUIBuilderPages,
	useDeleteUIBuilderPage,
} from "../../hooks/ui-builder-hooks";
import type { UIBuilderPluginOverrides } from "../../overrides";
import { uiBuilderLocalization } from "../../localization";
import { PageWrapper } from "../shared/page-wrapper";
import { EmptyState } from "../shared/empty-state";
import { Pagination } from "../shared/pagination";

export function PageListPage() {
	const { navigate, Link } =
		usePluginOverrides<UIBuilderPluginOverrides>("ui-builder");
	const basePath = useBasePath();
	const { pages, total, hasMore, isLoadingMore, loadMore, refetch } =
		useSuspenseUIBuilderPages();
	const deleteMutation = useDeleteUIBuilderPage();

	const [deleteId, setDeleteId] = useState<string | null>(null);

	const loc = uiBuilderLocalization;
	const LinkComponent = Link || "a";

	const handleDelete = async () => {
		if (!deleteId) return;

		try {
			await deleteMutation.mutateAsync(deleteId);
			toast.success("Page deleted successfully");
			setDeleteId(null);
			await refetch();
		} catch {
			toast.error("Failed to delete page");
		}
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
				{loc.pageBuilder.statusOptions[
					status as keyof typeof loc.pageBuilder.statusOptions
				] || status}
			</span>
		);
	};

	return (
		<PageWrapper testId="page-list-page">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold">{loc.pageList.title}</h1>
						<p className="text-muted-foreground">{loc.pageList.description}</p>
					</div>
					<Button asChild>
						<LinkComponent href={`${basePath}/ui-builder/new`}>
							<Plus className="mr-2 h-4 w-4" />
							{loc.pageList.createButton}
						</LinkComponent>
					</Button>
				</div>

				{pages.length === 0 ? (
					<EmptyState
						title={loc.pageList.emptyState.title}
						description={loc.pageList.emptyState.description}
						action={
							<Button asChild>
								<LinkComponent href={`${basePath}/ui-builder/new`}>
									<Plus className="mr-2 h-4 w-4" />
									{loc.pageList.createButton}
								</LinkComponent>
							</Button>
						}
					/>
				) : (
					<>
						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{loc.pageList.columns.slug}</TableHead>
										<TableHead>{loc.pageList.columns.status}</TableHead>
										<TableHead>{loc.pageList.columns.updatedAt}</TableHead>
										<TableHead className="w-12">
											{loc.pageList.columns.actions}
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
															<MoreHorizontal className="h-4 w-4" />
															<span className="sr-only">Actions</span>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() =>
																navigate?.(
																	`${basePath}/ui-builder/${page.id}/edit`,
																)
															}
														>
															<Pencil className="mr-2 h-4 w-4" />
															{loc.pageList.actions.edit}
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																navigate?.(`${basePath}/preview/${page.slug}`)
															}
														>
															<Eye className="mr-2 h-4 w-4" />
															{loc.pageList.actions.preview}
														</DropdownMenuItem>
														<DropdownMenuItem
															className="text-destructive"
															onClick={() => setDeleteId(page.id)}
														>
															<Trash2 className="mr-2 h-4 w-4" />
															{loc.pageList.actions.delete}
														</DropdownMenuItem>
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
						/>
					</>
				)}
			</div>

			{/* Delete confirmation dialog */}
			<AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{loc.pageList.deleteDialog.title}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{loc.pageList.deleteDialog.description}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{loc.pageList.deleteDialog.cancel}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteMutation.isPending
								? "Deleting..."
								: loc.pageList.deleteDialog.confirm}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageWrapper>
	);
}
