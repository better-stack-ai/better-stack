"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import { useBoardMutations } from "../../hooks/kanban-hooks";
import type { SerializedBoard } from "../../../types";

interface BoardFormProps {
	board?: SerializedBoard;
	onClose: () => void;
	onSuccess: (boardId: string) => void;
}

export function BoardForm({ board, onClose, onSuccess }: BoardFormProps) {
	const isEditing = !!board;
	const { createBoard, updateBoard, isCreating, isUpdating } =
		useBoardMutations();

	const [name, setName] = useState(board?.name || "");
	const [description, setDescription] = useState(board?.description || "");
	const [error, setError] = useState<string | null>(null);

	const isPending = isCreating || isUpdating;

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);

		if (!name.trim()) {
			setError("Name is required");
			return;
		}

		try {
			if (isEditing && board) {
				await updateBoard(board.id, { name, description });
				onSuccess(board.id);
			} else {
				const newBoard = await createBoard({ name, description });
				if (newBoard?.id) {
					onSuccess(newBoard.id);
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="name">Name *</Label>
				<Input
					id="name"
					value={name}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						setName(e.target.value)
					}
					placeholder="e.g., Project Alpha"
					disabled={isPending}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="description">Description</Label>
				<Textarea
					id="description"
					value={description}
					onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
						setDescription(e.target.value)
					}
					placeholder="Describe your board..."
					disabled={isPending}
					rows={3}
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
							? "Update Board"
							: "Create Board"}
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
