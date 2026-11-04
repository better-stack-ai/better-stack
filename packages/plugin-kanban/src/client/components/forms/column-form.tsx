"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import { useColumnForm } from "../../hooks/kanban-hooks";
import type { KanbanPluginOverrides } from "../../overrides";
import type { SerializedColumn } from "../../../types";
import { KANBAN_PLUGIN_ID } from "../../constants";

interface ColumnFormProps {
	boardId: string;
	columnId?: string;
	column?: SerializedColumn;
	onClose: () => void;
	onSuccess: () => void;
}

interface ColumnFormValues {
	title: string;
}

function firstError(error: string | string[] | undefined): string | undefined {
	return Array.isArray(error) ? error[0] : error;
}

export function ColumnForm({
	boardId,
	columnId,
	column,
	onClose,
	onSuccess,
}: ColumnFormProps) {
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<KanbanPluginOverrides>(KANBAN_PLUGIN_ID);
	const isEditing = !!columnId;
	const [title, setTitle] = useState(column?.title || "");
	const [titleError, setTitleError] = useState<string | null>(null);

	const resourceForm = useColumnForm<ColumnFormValues>({
		action: isEditing ? "edit" : "create",
		record: column ?? null,
		toCreateVars: (values) => ({ ...values, boardId }),
		toUpdateVars: (values) => ({ id: columnId ?? "", data: values }),
		onSuccess,
	});

	const serverTitleError = firstError(resourceForm.fieldErrors.title);
	const topLevelError =
		resourceForm.error && Object.keys(resourceForm.fieldErrors).length === 0
			? resourceForm.error.message
			: null;

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		resourceForm.clearErrors();
		setTitleError(null);

		if (!title.trim()) {
			setTitleError(
				localization?.titleRequired ??
					t("kanban.forms.titleRequired", "Title is required"),
			);
			return;
		}

		await resourceForm.submit({ title });
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="title">
					{localization?.columnTitle ?? t("kanban.forms.columnTitle", "Title")}{" "}
					*
				</Label>
				<Input
					id="title"
					value={title}
					onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
						setTitle(event.target.value);
						setTitleError(null);
					}}
					placeholder={
						localization?.columnTitlePlaceholder ??
						t("kanban.forms.columnTitlePlaceholder", "e.g., To Do")
					}
					disabled={resourceForm.isSubmitting}
					aria-invalid={!!(titleError || serverTitleError)}
				/>
				{(titleError || serverTitleError) && (
					<p className="text-sm text-destructive">
						{titleError || serverTitleError}
					</p>
				)}
			</div>

			{topLevelError && (
				<div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
					{topLevelError}
				</div>
			)}

			<div className="flex gap-2 pt-2">
				<Button type="submit" disabled={resourceForm.isSubmitting}>
					{resourceForm.isSubmitting
						? isEditing
							? (localization?.updating ??
								t("kanban.common.updating", "Updating..."))
							: (localization?.creating ??
								t("kanban.common.creating", "Creating..."))
						: isEditing
							? (localization?.updateColumn ??
								t("kanban.forms.updateColumn", "Update Column"))
							: (localization?.createColumn ??
								t("kanban.forms.createColumn", "Create Column"))}
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={onClose}
					disabled={resourceForm.isSubmitting}
				>
					{localization?.cancel ?? t("kanban.common.cancel", "Cancel")}
				</Button>
			</div>
		</form>
	);
}
