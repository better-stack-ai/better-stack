"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { MinimalTiptapEditor } from "@workspace/ui/components/minimal-tiptap";
import SearchSelect from "@workspace/ui/components/search-select";
import {
	CanAccess,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import {
	useTaskForm,
	useTaskMutations,
	useSearchUsers,
} from "../../hooks/kanban-hooks";
import type { KanbanPluginOverrides } from "../../overrides";
import type {
	SerializedColumn,
	SerializedTask,
	Priority,
} from "../../../types";

interface TaskFormProps {
	columnId: string;
	boardId: string;
	taskId?: string;
	task?: SerializedTask;
	columns: SerializedColumn[];
	onClose: () => void;
	onSuccess: () => void;
	onDelete?: () => void | Promise<void>;
}

interface TaskFormValues {
	title: string;
	description: string;
	priority: Priority;
	columnId: string;
	assigneeId: string;
}

function firstError(error: string | string[] | undefined): string | undefined {
	return Array.isArray(error) ? error[0] : error;
}

export function TaskForm({
	columnId,
	boardId,
	taskId,
	task,
	columns,
	onClose,
	onSuccess,
	onDelete,
}: TaskFormProps) {
	const t = useTranslate();
	const {
		uploadImage,
		imagePicker: imagePickerTrigger,
		localization,
	} = usePluginOverrides<KanbanPluginOverrides>("kanban");
	const isEditing = !!taskId;
	const { moveTask, isMoving } = useTaskMutations();

	const [title, setTitle] = useState(task?.title || "");
	const [description, setDescription] = useState(task?.description || "");
	const [priority, setPriority] = useState<Priority>(
		task?.priority || "MEDIUM",
	);
	const [selectedColumnId, setSelectedColumnId] = useState(
		task?.columnId || columnId,
	);
	const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId || "");
	const [titleError, setTitleError] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const resourceForm = useTaskForm<TaskFormValues>({
		action: isEditing ? "edit" : "create",
		record: task ?? null,
		toCreateVars: (values) => ({
			title: values.title,
			description: values.description,
			priority: values.priority,
			columnId: values.columnId,
			assigneeId: values.assigneeId || undefined,
		}),
		toUpdateVars: (values) => ({
			id: taskId ?? "",
			data: {
				title: values.title,
				description: values.description,
				priority: values.priority,
				...(values.columnId === task?.columnId
					? { columnId: values.columnId }
					: {}),
				assigneeId: values.assigneeId || null,
			},
		}),
		onSuccess: async () => {
			if (isEditing && taskId && selectedColumnId !== task?.columnId) {
				const targetTasks =
					columns.find((column) => column.id === selectedColumnId)?.tasks ?? [];
				const targetOrder =
					targetTasks.length > 0
						? Math.max(...targetTasks.map((targetTask) => targetTask.order)) + 1
						: 0;

				try {
					await moveTask(taskId, selectedColumnId, targetOrder);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: (localization?.errorGeneric ??
								t("kanban.common.errorGeneric", "Something went wrong"));
					const partialErrorTemplate = localization?.taskMovePartialError;
					throw new Error(
						partialErrorTemplate
							? partialErrorTemplate.replaceAll("{{message}}", message)
							: t(
									"kanban.forms.taskMovePartialError",
									"Task properties were saved, but moving to the new column failed: {{message}}. You can try dragging the task to the desired column.",
									{ message },
								),
					);
				}
			}

			onSuccess();
		},
	});

	const { data: users = [] } = useSearchUsers("", boardId);
	const unassigned =
		localization?.unassigned ?? t("kanban.common.unassigned", "Unassigned");
	const userOptions = [
		{ value: "", label: unassigned },
		...users.map((user) => ({ value: user.id, label: user.name })),
	];
	const priorityOptions: Array<{ value: Priority; label: string }> = [
		{
			value: "LOW",
			label: localization?.priorityLow ?? t("kanban.common.priorityLow", "Low"),
		},
		{
			value: "MEDIUM",
			label:
				localization?.priorityMedium ??
				t("kanban.common.priorityMedium", "Medium"),
		},
		{
			value: "HIGH",
			label:
				localization?.priorityHigh ?? t("kanban.common.priorityHigh", "High"),
		},
		{
			value: "URGENT",
			label:
				localization?.priorityUrgent ??
				t("kanban.common.priorityUrgent", "Urgent"),
		},
	];

	const isPending = resourceForm.isSubmitting || isMoving || isDeleting;
	const serverTitleError = firstError(resourceForm.fieldErrors.title);
	const serverDescriptionError = firstError(
		resourceForm.fieldErrors.description,
	);
	const serverPriorityError = firstError(resourceForm.fieldErrors.priority);
	const serverColumnError = firstError(resourceForm.fieldErrors.columnId);
	const serverAssigneeError = firstError(resourceForm.fieldErrors.assigneeId);
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

		await resourceForm.submit({
			title,
			description,
			priority,
			columnId: selectedColumnId,
			assigneeId,
		});
	};

	const handleDelete = async () => {
		if (!onDelete) return;
		setIsDeleting(true);
		try {
			await onDelete();
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden">
			<div className="space-y-2">
				<Label htmlFor="title">
					{localization?.taskTitle ?? t("kanban.forms.taskTitle", "Title")} *
				</Label>
				<Input
					id="title"
					value={title}
					onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
						setTitle(event.target.value);
						setTitleError(null);
					}}
					placeholder={
						localization?.taskTitlePlaceholder ??
						t("kanban.forms.taskTitlePlaceholder", "e.g., Fix login bug")
					}
					disabled={isPending}
					aria-invalid={!!(titleError || serverTitleError)}
				/>
				{(titleError || serverTitleError) && (
					<p className="text-sm text-destructive">
						{titleError || serverTitleError}
					</p>
				)}
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="priority">
						{localization?.taskPriority ??
							t("kanban.forms.taskPriority", "Priority")}
					</Label>
					<Select
						value={priority}
						onValueChange={(value: string) => setPriority(value as Priority)}
						disabled={isPending}
					>
						<SelectTrigger id="priority" aria-invalid={!!serverPriorityError}>
							<SelectValue
								placeholder={
									localization?.selectPriority ??
									t("kanban.forms.selectPriority", "Select priority")
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{priorityOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{serverPriorityError && (
						<p className="text-sm text-destructive">{serverPriorityError}</p>
					)}
				</div>

				<div className="space-y-2">
					<Label htmlFor="column">
						{localization?.taskColumn ?? t("kanban.forms.taskColumn", "Column")}
					</Label>
					<Select
						value={selectedColumnId}
						onValueChange={setSelectedColumnId}
						disabled={isPending}
					>
						<SelectTrigger id="column" aria-invalid={!!serverColumnError}>
							<SelectValue
								placeholder={
									localization?.selectColumn ??
									t("kanban.forms.selectColumn", "Select column")
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{columns.map((column) => (
								<SelectItem key={column.id} value={column.id}>
									{column.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{serverColumnError && (
						<p className="text-sm text-destructive">{serverColumnError}</p>
					)}
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="assignee">
					{localization?.taskAssignee ??
						t("kanban.forms.taskAssignee", "Assignee")}
				</Label>
				<SearchSelect
					options={userOptions}
					value={assigneeId}
					onChange={setAssigneeId}
					placeholder={
						localization?.selectAssignee ??
						t("kanban.forms.selectAssignee", "Select assignee")
					}
					emptyMessage={
						localization?.noUsersFound ??
						t("kanban.forms.noUsersFound", "No users found")
					}
				/>
				{serverAssigneeError && (
					<p className="text-sm text-destructive">{serverAssigneeError}</p>
				)}
			</div>

			<div className="space-y-2">
				<Label>
					{localization?.taskDescription ??
						t("kanban.forms.taskDescription", "Description")}
				</Label>
				<MinimalTiptapEditor
					value={description}
					onChange={(value) =>
						setDescription(typeof value === "string" ? value : "")
					}
					output="markdown"
					placeholder={
						localization?.taskDescriptionPlaceholder ??
						t("kanban.forms.taskDescriptionPlaceholder", "Describe the task...")
					}
					className="min-h-[150px]"
					uploader={uploadImage}
					imagePickerTrigger={imagePickerTrigger}
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

			<div className="flex justify-between pt-2">
				<div className="flex gap-2">
					<Button type="submit" disabled={isPending}>
						{resourceForm.isSubmitting || isMoving
							? isEditing
								? (localization?.updating ??
									t("kanban.common.updating", "Updating..."))
								: (localization?.creating ??
									t("kanban.common.creating", "Creating..."))
							: isEditing
								? (localization?.updateTask ??
									t("kanban.forms.updateTask", "Update Task"))
								: (localization?.createTask ??
									t("kanban.forms.createTask", "Create Task"))}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						disabled={isPending}
					>
						{localization?.cancel ?? t("kanban.common.cancel", "Cancel")}
					</Button>
				</div>
				{isEditing && onDelete && taskId && (
					<CanAccess
						resource="kanban:task"
						action="delete"
						params={{ id: taskId, boardId, columnId }}
					>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={isPending}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							{isDeleting
								? (localization?.deleting ??
									t("kanban.common.deleting", "Deleting..."))
								: (localization?.delete ?? t("kanban.common.delete", "Delete"))}
						</Button>
					</CanAccess>
				)}
			</div>
		</form>
	);
}
