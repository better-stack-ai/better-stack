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
import { useTaskMutations } from "../../hooks/kanban-hooks";
import { PRIORITY_OPTIONS } from "../../../utils";
import type {
	SerializedColumn,
	SerializedTask,
	Priority,
} from "../../../types";

interface TaskFormProps {
	columnId: string;
	taskId?: string;
	task?: SerializedTask;
	columns: SerializedColumn[];
	onClose: () => void;
	onSuccess: () => void;
	onDelete?: () => void;
}

export function TaskForm({
	columnId,
	taskId,
	task,
	columns,
	onClose,
	onSuccess,
	onDelete,
}: TaskFormProps) {
	const isEditing = !!taskId;
	const { createTask, updateTask, isCreating, isUpdating, isDeleting } =
		useTaskMutations();

	const [title, setTitle] = useState(task?.title || "");
	const [description, setDescription] = useState(task?.description || "");
	const [priority, setPriority] = useState<Priority>(
		task?.priority || "MEDIUM",
	);
	const [selectedColumnId, setSelectedColumnId] = useState(
		task?.columnId || columnId,
	);
	const [error, setError] = useState<string | null>(null);

	const isPending = isCreating || isUpdating || isDeleting;

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);

		if (!title.trim()) {
			setError("Title is required");
			return;
		}

		try {
			if (isEditing && taskId) {
				await updateTask(taskId, {
					title,
					description,
					priority,
					columnId: selectedColumnId,
				});
			} else {
				await createTask({
					title,
					description,
					priority,
					columnId: selectedColumnId,
				});
			}
			onSuccess();
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="title">Title *</Label>
				<Input
					id="title"
					value={title}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						setTitle(e.target.value)
					}
					placeholder="e.g., Fix login bug"
					disabled={isPending}
				/>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="priority">Priority</Label>
					<Select
						value={priority}
						onValueChange={(v: string) => setPriority(v as Priority)}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select priority" />
						</SelectTrigger>
						<SelectContent>
							{PRIORITY_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="column">Column</Label>
					<Select value={selectedColumnId} onValueChange={setSelectedColumnId}>
						<SelectTrigger>
							<SelectValue placeholder="Select column" />
						</SelectTrigger>
						<SelectContent>
							{columns.map((col) => (
								<SelectItem key={col.id} value={col.id}>
									{col.title}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="space-y-2">
				<Label>Description</Label>
				<MinimalTiptapEditor
					value={description}
					onChange={(value) =>
						setDescription(typeof value === "string" ? value : "")
					}
					output="markdown"
					placeholder="Describe the task..."
					editable={!isPending}
					className="min-h-[150px]"
				/>
			</div>

			{error && (
				<div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
					{error}
				</div>
			)}

			<div className="flex justify-between pt-2">
				<div className="flex gap-2">
					<Button type="submit" disabled={isPending}>
						{isPending
							? isEditing
								? "Updating..."
								: "Creating..."
							: isEditing
								? "Update Task"
								: "Create Task"}
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						disabled={isPending}
					>
						Cancel
					</Button>
				</div>
				{isEditing && onDelete && (
					<Button
						type="button"
						variant="destructive"
						onClick={onDelete}
						disabled={isPending}
					>
						<Trash2 className="mr-2 h-4 w-4" />
						Delete
					</Button>
				)}
			</div>
		</form>
	);
}
