"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useColumnMutations } from "../../hooks/kanban-hooks";
import type { SerializedColumn } from "../../../types";

interface ColumnFormProps {
	boardId: string;
	columnId?: string;
	column?: SerializedColumn;
	onClose: () => void;
	onSuccess: () => void;
}

export function ColumnForm({
	boardId,
	columnId,
	column,
	onClose,
	onSuccess,
}: ColumnFormProps) {
	const isEditing = !!columnId;
	const { createColumn, updateColumn, isCreating, isUpdating } =
		useColumnMutations();

	const [title, setTitle] = useState(column?.title || "");
	const [error, setError] = useState<string | null>(null);

	const isPending = isCreating || isUpdating;

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);

		if (!title.trim()) {
			setError("Title is required");
			return;
		}

		try {
			if (isEditing && columnId) {
				await updateColumn(columnId, { title });
			} else {
				await createColumn({ title, boardId });
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
					placeholder="e.g., To Do"
					disabled={isPending}
				/>
			</div>

			{error && (
				<div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
					{error}
				</div>
			)}

			<div className="flex gap-2 pt-2">
				<Button type="submit" disabled={isPending}>
					{isPending
						? isEditing
							? "Updating..."
							: "Creating..."
						: isEditing
							? "Update Column"
							: "Create Column"}
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
		</form>
	);
}
