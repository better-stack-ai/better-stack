"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import { useBoardForm } from "../../hooks/kanban-hooks";
import type { KanbanPluginOverrides } from "../../overrides";
import type { SerializedBoard } from "../../../types";

interface BoardFormProps {
	board?: SerializedBoard;
	onClose: () => void;
	onSuccess: (boardId: string) => void;
}

interface BoardFormValues {
	name: string;
	description: string;
}

function firstError(error: string | string[] | undefined): string | undefined {
	return Array.isArray(error) ? error[0] : error;
}

export function BoardForm({ board, onClose, onSuccess }: BoardFormProps) {
	const t = useTranslate();
	const { localization } = usePluginOverrides<KanbanPluginOverrides>("kanban");
	const isEditing = !!board;

	const [name, setName] = useState(board?.name || "");
	const [description, setDescription] = useState(board?.description || "");
	const [nameError, setNameError] = useState<string | null>(null);

	const resourceForm = useBoardForm<BoardFormValues>({
		action: isEditing ? "edit" : "create",
		record: board ?? null,
		toCreateVars: (values) => values,
		toUpdateVars: (values) => ({ id: board?.id ?? "", data: values }),
		onSuccess: (savedBoard) => onSuccess(savedBoard.id),
	});

	const serverNameError = firstError(resourceForm.fieldErrors.name);
	const serverDescriptionError = firstError(
		resourceForm.fieldErrors.description,
	);
	const topLevelError =
		resourceForm.error && Object.keys(resourceForm.fieldErrors).length === 0
			? resourceForm.error.message
			: null;

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		resourceForm.clearErrors();
		setNameError(null);

		if (!name.trim()) {
			setNameError(
				localization?.nameRequired ??
					t("kanban.forms.nameRequired", "Name is required"),
			);
			return;
		}

		await resourceForm.submit({ name, description });
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden">
			<div className="space-y-2">
				<Label htmlFor="name">
					{localization?.boardName ?? t("kanban.forms.boardName", "Name")} *
				</Label>
				<Input
					id="name"
					value={name}
					onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
						setName(event.target.value);
						setNameError(null);
					}}
					placeholder={
						localization?.boardNamePlaceholder ??
						t("kanban.forms.boardNamePlaceholder", "e.g., Project Alpha")
					}
					disabled={resourceForm.isSubmitting}
					aria-invalid={!!(nameError || serverNameError)}
				/>
				{(nameError || serverNameError) && (
					<p className="text-sm text-destructive">
						{nameError || serverNameError}
					</p>
				)}
			</div>

			<div className="space-y-2">
				<Label htmlFor="description">
					{localization?.boardDescription ??
						t("kanban.forms.boardDescription", "Description")}
				</Label>
				<Textarea
					id="description"
					value={description}
					onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
						setDescription(event.target.value)
					}
					placeholder={
						localization?.boardDescriptionPlaceholder ??
						t(
							"kanban.forms.boardDescriptionPlaceholder",
							"Describe your board...",
						)
					}
					disabled={resourceForm.isSubmitting}
					rows={3}
					aria-invalid={!!serverDescriptionError}
				/>
				{serverDescriptionError && (
					<p className="text-sm text-destructive">{serverDescriptionError}</p>
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
							? (localization?.updateBoard ??
								t("kanban.forms.updateBoard", "Update Board"))
							: (localization?.createBoard ??
								t("kanban.forms.createBoard", "Create Board"))}
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
