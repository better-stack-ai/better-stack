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
	PermissionAccess,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import { useTaskForm, useSearchUsers } from "../../hooks/kanban-hooks";
import type { KanbanPluginOverrides } from "../../overrides";
import type {
	SerializedColumn,
	SerializedTask,
	Priority,
} from "../../../types";
import { kanbanPermissions } from "../../../permissions";

interface TaskFormProps {
	columnId: string;
	boardId: string;
	ownerId?: string;
	organizationId?: string;
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
	ownerId,
	organizationId,
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
		toUpdateVars: (values) => {
			const isColumnMove = values.columnId !== task?.columnId;
			let targetOrder: number | undefined;
			if (isColumnMove) {
				const targetTasks =
					columns.find((column) => column.id === values.columnId)?.tasks ?? [];
				targetOrder =
					targetTasks.length > 0
						? Math.max(...targetTasks.map((targetTask) => targetTask.order)) + 1
						: 0;
			}

			return {
				id: taskId ?? "",
				data: {
					title: values.title,
					description: values.description,
					priority: values.priority,
					...(isColumnMove
						? { columnId: values.columnId, order: targetOrder }
						: {}),
					assigneeId: values.assigneeId || null,
				},
			};
		},
		onSuccess,
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

	const isPending = resourceForm.isSubmitting || isDeleting;
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
	const columnSelect = (
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
				{columns.map((column) => {
					const item = (
						<SelectItem key={column.id} value={column.id}>
							{column.title}
						</SelectItem>
					);
					if (isEditing && task?.columnId === column.id) return item;

					const permission = isEditing
						? kanbanPermissions.task.move({
								boardId,
								columnId: task?.columnId ?? columnId,
								targetColumnId: column.id,
								taskId: task?.id ?? taskId ?? "",
								...(ownerId ? { ownerId } : {}),
								...(organizationId ? { organizationId } : {}),
								...(task?.assigneeId ? { assigneeId: task.assigneeId } : {}),
								isArchived: task?.isArchived ?? false,
							})
						: kanbanPermissions.task.create({
								boardId,
								columnId: column.id,
								...(ownerId ? { ownerId } : {}),
								...(organizationId ? { organizationId } : {}),
							});
					return (
						<PermissionAccess
							key={column.id}
							permission={permission}
							legacyPermission={{
								resource: "kanban:task",
								action: isEditing ? "update" : "create",
								params: {
									boardId,
									columnId: task?.columnId ?? column.id,
									...(isEditing ? { targetColumnId: column.id } : {}),
									...(task ? { id: task.id } : {}),
									...(ownerId ? { ownerId } : {}),
									...(organizationId ? { organizationId } : {}),
									...(isEditing && task?.assigneeId
										? { assigneeId: task.assigneeId }
										: {}),
									...(isEditing
										? { isArchived: task?.isArchived ?? false }
										: {}),
								},
							}}
						>
							{item}
						</PermissionAccess>
					);
				})}
			</SelectContent>
		</Select>
	);

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
					{columnSelect}
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
						{resourceForm.isSubmitting
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
				{isEditing && onDelete && taskId && task && (
					<PermissionAccess
						permission={kanbanPermissions.task.delete({
							boardId,
							columnId: task.columnId,
							taskId: task.id,
							...(ownerId ? { ownerId } : {}),
							...(organizationId ? { organizationId } : {}),
							...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
							isArchived: task.isArchived,
						})}
						legacyPermission={{
							resource: "kanban:task",
							action: "delete",
							params: {
								id: task.id,
								boardId,
								columnId: task.columnId,
								...(ownerId ? { ownerId } : {}),
								...(organizationId ? { organizationId } : {}),
								...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
								isArchived: task.isArchived,
							},
						}}
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
					</PermissionAccess>
				)}
			</div>
		</form>
	);
}
