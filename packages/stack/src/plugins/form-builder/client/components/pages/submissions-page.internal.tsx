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
import { toast } from "sonner";

import {
	useSuspenseFormById,
	useSuspenseSubmissions,
	useDeleteSubmission,
} from "../../hooks/form-builder-hooks";
import type { FormBuilderPluginOverrides } from "../../overrides";
import { FORM_BUILDER_LOCALIZATION } from "../../localization";
import type { SerializedFormSubmissionWithData } from "../../../types";
import { PageWrapper } from "../shared/page-wrapper";
import { EmptyState } from "../shared/empty-state";
import { Pagination } from "../shared/pagination";

export interface SubmissionsPageProps {
	formId: string;
}

export function SubmissionsPage({ formId }: SubmissionsPageProps) {
	const { navigate, Link, localization } = usePluginOverrides<
		FormBuilderPluginOverrides,
		Partial<FormBuilderPluginOverrides>
	>("form-builder", {
		localization: FORM_BUILDER_LOCALIZATION,
	});
	const basePath = useBasePath();

	const { form } = useSuspenseFormById(formId);
	const { submissions, total, hasMore, isLoadingMore, loadMore, refetch } =
		useSuspenseSubmissions(formId);
	const deleteMutation = useDeleteSubmission(formId);

	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [viewSubmission, setViewSubmission] =
		useState<SerializedFormSubmissionWithData | null>(null);

	const loc = localization || FORM_BUILDER_LOCALIZATION;
	const LinkComponent = Link || "a";

	const handleDelete = async () => {
		if (!deleteId) return;

		try {
			await deleteMutation.mutateAsync(deleteId);
			toast.success(loc.FORM_BUILDER_TOAST_SUBMISSION_DELETED);
			setDeleteId(null);
			await refetch();
		} catch (error) {
			toast.error(loc.FORM_BUILDER_TOAST_ERROR);
		}
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
							{form?.name || loc.FORM_BUILDER_SUBMISSIONS_TITLE}
						</h1>
						<p className="text-muted-foreground">
							{loc.FORM_BUILDER_SUBMISSIONS_SUBTITLE}
						</p>
					</div>
				</div>

				{submissions.length === 0 ? (
					<EmptyState
						title={loc.FORM_BUILDER_SUBMISSIONS_EMPTY}
						description={loc.FORM_BUILDER_SUBMISSIONS_EMPTY_DESCRIPTION}
					/>
				) : (
					<>
						<div className="rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-24">
											{loc.FORM_BUILDER_SUBMISSIONS_COLUMN_ID}
										</TableHead>
										<TableHead>
											{loc.FORM_BUILDER_SUBMISSIONS_COLUMN_DATA}
										</TableHead>
										<TableHead>
											{loc.FORM_BUILDER_SUBMISSIONS_COLUMN_SUBMITTED_AT}
										</TableHead>
										<TableHead>
											{loc.FORM_BUILDER_SUBMISSIONS_COLUMN_IP_ADDRESS}
										</TableHead>
										<TableHead className="w-24">
											{loc.FORM_BUILDER_SUBMISSIONS_COLUMN_ACTIONS}
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
														<span className="sr-only">View</span>
													</Button>
													<Button
														variant="ghost"
														size="icon"
														className="text-destructive"
														onClick={() => setDeleteId(sub.id)}
													>
														<Trash2 className="h-4 w-4" />
														<span className="sr-only">Delete</span>
													</Button>
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
						<DialogTitle>Submission Details</DialogTitle>
					</DialogHeader>
					{viewSubmission && (
						<div className="space-y-4">
							<div className="grid grid-cols-2 gap-4 text-sm">
								<div>
									<span className="text-muted-foreground">ID:</span>
									<p className="font-mono truncate">{viewSubmission.id}</p>
								</div>
								<div>
									<span className="text-muted-foreground">Submitted:</span>
									<p className="truncate">
										{new Date(viewSubmission.submittedAt).toLocaleString()}
									</p>
								</div>
								<div>
									<span className="text-muted-foreground">IP Address:</span>
									<p className="font-mono truncate">
										{viewSubmission.ipAddress || "-"}
									</p>
								</div>
								<div>
									<span className="text-muted-foreground">User Agent:</span>
									<p className="text-xs truncate">
										{viewSubmission.userAgent || "-"}
									</p>
								</div>
							</div>
							<div>
								<span className="text-muted-foreground text-sm">Data:</span>
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
						<AlertDialogTitle>Delete Submission</AlertDialogTitle>
						<AlertDialogDescription>
							{loc.FORM_BUILDER_SUBMISSIONS_DELETE_CONFIRM}
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
