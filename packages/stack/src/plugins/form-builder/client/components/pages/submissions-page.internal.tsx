"use client";

import { useState } from "react";
import {
	CanAccess,
	useNotify,
	usePluginOverrides,
	useBasePath,
	useStack,
	useTranslate,
} from "@btst/stack/context";
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
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { ArrowLeft, Trash2, Eye } from "lucide-react";

import {
	useSuspenseFormById,
	useSuspenseSubmissions,
	useDeleteSubmission,
} from "../../hooks";
import type { FormBuilderPluginOverrides } from "../../overrides";
import type { SerializedFormSubmissionWithData } from "../../../types";
import { PageWrapper } from "../shared/page-wrapper";
import { EmptyState } from "../shared/empty-state";
import { Pagination } from "../shared/pagination";

export interface SubmissionsPageProps {
	formId: string;
}

export function SubmissionsPage({ formId }: SubmissionsPageProps) {
	const t = useTranslate();
	const notify = useNotify();
	const { localization } =
		usePluginOverrides<FormBuilderPluginOverrides>("form-builder");
	const { router } = useStack();
	const basePath = useBasePath();

	const { form } = useSuspenseFormById(formId);
	const { submissions, total, hasMore, isLoadingMore, loadMore } =
		useSuspenseSubmissions(formId);
	const deleteMutation = useDeleteSubmission(formId);

	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [viewSubmission, setViewSubmission] =
		useState<SerializedFormSubmissionWithData | null>(null);

	const LinkComponent = router?.Link ?? "a";

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
			localization?.FORM_BUILDER_TOAST_SUBMISSION_DELETED ??
				t(
					"formBuilder.toasts.submissionDeleted",
					"Submission deleted successfully",
				),
		);
		setDeleteId(null);
	};

	const formatSubmissionData = (data: Record<string, unknown>) => {
		const entries = Object.entries(data).slice(0, 3);
		return entries
			.map(([key, value]) => {
				const strValue =
					typeof value === "string" ? value : JSON.stringify(value);
				const truncated =
					strValue.length > 30 ? `${strValue.slice(0, 30)}...` : strValue;
				return `${key}: ${truncated}`;
			})
			.join(", ");
	};

	return (
		<PageWrapper testId="submissions-page">
			<div className="w-full max-w-5xl space-y-6">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" asChild>
						<LinkComponent href={`${basePath}/forms`}>
							<ArrowLeft className="h-4 w-4" />
						</LinkComponent>
					</Button>
					<div>
						<h1 className="text-2xl font-bold">
							{form?.name ||
								(localization?.FORM_BUILDER_SUBMISSIONS_TITLE ??
									t("formBuilder.submissions.title", "Submissions"))}
						</h1>
						<p className="text-muted-foreground">
							{localization?.FORM_BUILDER_SUBMISSIONS_SUBTITLE ??
								t("formBuilder.submissions.subtitle", "View form submissions")}
						</p>
					</div>
				</div>

				{submissions.length === 0 ? (
					<EmptyState
						title={
							localization?.FORM_BUILDER_SUBMISSIONS_EMPTY ??
							t("formBuilder.submissions.empty", "No submissions yet")
						}
						description={
							localization?.FORM_BUILDER_SUBMISSIONS_EMPTY_DESCRIPTION ??
							t(
								"formBuilder.submissions.emptyDescription",
								"Submissions will appear here when users submit this form.",
							)
						}
					/>
				) : (
					<>
						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-24">
											{localization?.FORM_BUILDER_SUBMISSIONS_COLUMN_ID ??
												t("formBuilder.submissions.columnId", "ID")}
										</TableHead>
										<TableHead>
											{localization?.FORM_BUILDER_SUBMISSIONS_COLUMN_DATA ??
												t("formBuilder.submissions.columnData", "Data")}
										</TableHead>
										<TableHead>
											{localization?.FORM_BUILDER_SUBMISSIONS_COLUMN_SUBMITTED_AT ??
												t(
													"formBuilder.submissions.columnSubmittedAt",
													"Submitted",
												)}
										</TableHead>
										<TableHead>
											{localization?.FORM_BUILDER_SUBMISSIONS_COLUMN_IP_ADDRESS ??
												t(
													"formBuilder.submissions.columnIpAddress",
													"IP Address",
												)}
										</TableHead>
										<TableHead className="w-24">
											{localization?.FORM_BUILDER_SUBMISSIONS_COLUMN_ACTIONS ??
												t("formBuilder.submissions.columnActions", "Actions")}
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{submissions.map((sub) => (
										<TableRow key={sub.id}>
											<TableCell className="font-mono text-xs">
												{sub.id.slice(0, 8)}...
											</TableCell>
											<TableCell className="max-w-xs truncate text-sm text-muted-foreground">
												{formatSubmissionData(sub.parsedData ?? {})}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{new Date(sub.submittedAt).toLocaleString()}
											</TableCell>
											<TableCell className="text-muted-foreground font-mono text-xs">
												{sub.ipAddress || "-"}
											</TableCell>
											<TableCell>
												<div className="flex gap-1">
													<Button
														variant="ghost"
														size="icon"
														onClick={() => setViewSubmission(sub)}
													>
														<Eye className="h-4 w-4" />
														<span className="sr-only">
															{localization?.FORM_BUILDER_SUBMISSIONS_ACTION_VIEW ??
																t("formBuilder.submissions.actionView", "View")}
														</span>
													</Button>
													<CanAccess
														resource="form-builder:submission"
														action="delete"
														params={{ formId, id: sub.id }}
													>
														<Button
															variant="ghost"
															size="icon"
															className="text-destructive"
															onClick={() => setDeleteId(sub.id)}
														>
															<Trash2 className="h-4 w-4" />
															<span className="sr-only">
																{localization?.FORM_BUILDER_SUBMISSIONS_ACTION_DELETE ??
																	t(
																		"formBuilder.submissions.actionDelete",
																		"Delete",
																	)}
															</span>
														</Button>
													</CanAccess>
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>

						<Pagination
							total={total}
							showing={submissions.length}
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

			{/* View submission dialog */}
			<Dialog
				open={!!viewSubmission}
				onOpenChange={() => setViewSubmission(null)}
			>
				<DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
					<DialogHeader>
						<DialogTitle>
							{localization?.FORM_BUILDER_SUBMISSIONS_DETAILS_TITLE ??
								t("formBuilder.submissions.detailsTitle", "Submission Details")}
						</DialogTitle>
					</DialogHeader>
					{viewSubmission && (
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<span className="text-muted-foreground">
										{localization?.FORM_BUILDER_SUBMISSIONS_FIELD_ID ??
											t("formBuilder.submissions.fieldId", "ID:")}
									</span>
									<p className="font-mono truncate">{viewSubmission.id}</p>
								</div>
								<div>
									<span className="text-muted-foreground">
										{localization?.FORM_BUILDER_SUBMISSIONS_FIELD_SUBMITTED ??
											t("formBuilder.submissions.fieldSubmitted", "Submitted:")}
									</span>
									<p className="truncate">
										{new Date(viewSubmission.submittedAt).toLocaleString()}
									</p>
								</div>
								<div>
									<span className="text-muted-foreground">
										{localization?.FORM_BUILDER_SUBMISSIONS_FIELD_IP ??
											t("formBuilder.submissions.fieldIp", "IP Address:")}
									</span>
									<p className="font-mono truncate">
										{viewSubmission.ipAddress || "-"}
									</p>
								</div>
								<div>
									<span className="text-muted-foreground">
										{localization?.FORM_BUILDER_SUBMISSIONS_FIELD_USER_AGENT ??
											t(
												"formBuilder.submissions.fieldUserAgent",
												"User Agent:",
											)}
									</span>
									<p className="text-xs truncate">
										{viewSubmission.userAgent || "-"}
									</p>
								</div>
							</div>
							<div>
								<span className="text-muted-foreground text-sm">
									{localization?.FORM_BUILDER_SUBMISSIONS_FIELD_DATA ??
										t("formBuilder.submissions.fieldData", "Data:")}
								</span>
								<pre className="mt-2 p-4 bg-muted rounded-lg text-sm overflow-auto">
									{JSON.stringify(viewSubmission.parsedData, null, 2)}
								</pre>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>

			{/* Delete confirmation dialog */}
			<AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{localization?.FORM_BUILDER_SUBMISSIONS_DELETE_TITLE ??
								t("formBuilder.submissions.deleteTitle", "Delete Submission")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{localization?.FORM_BUILDER_SUBMISSIONS_DELETE_CONFIRM ??
								t(
									"formBuilder.submissions.deleteConfirm",
									"Are you sure you want to delete this submission?",
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
