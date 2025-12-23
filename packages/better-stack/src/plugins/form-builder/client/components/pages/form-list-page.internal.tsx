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
import { MoreHorizontal, Plus, Pencil, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";

import {
	useSuspenseForms,
	useDeleteForm,
} from "../../hooks/form-builder-hooks";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { FORM_BUILDER_LOCALIZATION } from "../../localization";
import { PageWrapper } from "../shared/page-wrapper";
import { EmptyState } from "../shared/empty-state";
import { Pagination } from "../shared/pagination";

export function FormListPage() {
	const { navigate, Link, localization } = usePluginOverrides<
		FormBuilderPluginOverrides,
		Partial<FormBuilderPluginOverrides>
	>("form-builder", {
		localization: FORM_BUILDER_LOCALIZATION,
	});
	const basePath = useBasePath();
	const { forms, total, hasMore, isLoadingMore, loadMore, refetch } =
		useSuspenseForms();
	const deleteMutation = useDeleteForm();

	const [deleteId, setDeleteId] = useState<string | null>(null);

	const loc = localization || FORM_BUILDER_LOCALIZATION;
	const LinkComponent = Link || "a";

	const handleDelete = async () => {
		if (!deleteId) return;

		try {
			await deleteMutation.mutateAsync(deleteId);
			toast.success(loc.FORM_BUILDER_TOAST_DELETE_SUCCESS);
			setDeleteId(null);
			await refetch();
		} catch (error) {
			toast.error(loc.FORM_BUILDER_TOAST_ERROR);
		}
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

	return (
		<PageWrapper testId="form-list-page">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold">
							{loc.FORM_BUILDER_LIST_TITLE}
						</h1>
						<p className="text-muted-foreground">
							{loc.FORM_BUILDER_LIST_SUBTITLE}
						</p>
					</div>
					<Button asChild>
						<LinkComponent href={`${basePath}/forms/new`}>
							<Plus className="mr-2 h-4 w-4" />
							{loc.FORM_BUILDER_BUTTON_NEW_FORM}
						</LinkComponent>
					</Button>
				</div>

				{forms.length === 0 ? (
					<EmptyState
						title={loc.FORM_BUILDER_LIST_EMPTY}
						description={loc.FORM_BUILDER_LIST_EMPTY_DESCRIPTION}
						action={
							<Button asChild>
								<LinkComponent href={`${basePath}/forms/new`}>
									<Plus className="mr-2 h-4 w-4" />
									{loc.FORM_BUILDER_BUTTON_NEW_FORM}
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
										<TableHead>{loc.FORM_BUILDER_LIST_COLUMN_NAME}</TableHead>
										<TableHead>{loc.FORM_BUILDER_LIST_COLUMN_SLUG}</TableHead>
										<TableHead>{loc.FORM_BUILDER_LIST_COLUMN_STATUS}</TableHead>
										<TableHead>
											{loc.FORM_BUILDER_LIST_COLUMN_CREATED}
										</TableHead>
										<TableHead className="w-12">
											{loc.FORM_BUILDER_LIST_COLUMN_ACTIONS}
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
															<span className="sr-only">Actions</span>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() =>
																navigate?.(`${basePath}/forms/${form.id}/edit`)
															}
														>
															<Pencil className="mr-2 h-4 w-4" />
															{loc.FORM_BUILDER_LIST_ACTION_EDIT}
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() =>
																navigate?.(
																	`${basePath}/forms/${form.id}/submissions`,
																)
															}
														>
															<FileText className="mr-2 h-4 w-4" />
															{loc.FORM_BUILDER_LIST_ACTION_SUBMISSIONS}
														</DropdownMenuItem>
														<DropdownMenuItem
															className="text-destructive"
															onClick={() => setDeleteId(form.id)}
														>
															<Trash2 className="mr-2 h-4 w-4" />
															{loc.FORM_BUILDER_LIST_ACTION_DELETE}
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
							showing={forms.length}
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
						<AlertDialogTitle>Delete Form</AlertDialogTitle>
						<AlertDialogDescription>
							{loc.FORM_BUILDER_EDITOR_DELETE_CONFIRM}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{loc.FORM_BUILDER_BUTTON_CANCEL}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{deleteMutation.isPending
								? loc.FORM_BUILDER_STATUS_DELETING
								: loc.FORM_BUILDER_BUTTON_DELETE}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</PageWrapper>
	);
}
