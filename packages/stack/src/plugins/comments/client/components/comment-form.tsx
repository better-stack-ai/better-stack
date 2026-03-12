"use client";

import { useState, type ComponentType } from "react";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";

export interface CommentFormProps {
	/** Current user's ID — required to post */
	authorId: string;
	/** Optional parent comment ID for replies */
	parentId?: string | null;
	/** Initial body value (for editing) */
	initialBody?: string;
	/** Label for the submit button */
	submitLabel?: string;
	/** Called when form is submitted */
	onSubmit: (body: string) => Promise<void>;
	/** Called when cancel is clicked (shows Cancel button when provided) */
	onCancel?: () => void;
	/** Custom input component — defaults to a plain Textarea */
	InputComponent?: ComponentType<{
		value: string;
		onChange: (value: string) => void;
		disabled?: boolean;
		placeholder?: string;
	}>;
}

export function CommentForm({
	authorId: _authorId,
	initialBody = "",
	submitLabel = "Post comment",
	onSubmit,
	onCancel,
	InputComponent,
}: CommentFormProps) {
	const [body, setBody] = useState(initialBody);
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!body.trim()) return;
		setError(null);
		setIsPending(true);
		try {
			await onSubmit(body.trim());
			setBody("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to submit comment");
		} finally {
			setIsPending(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-2">
			{InputComponent ? (
				<InputComponent
					value={body}
					onChange={setBody}
					disabled={isPending}
					placeholder="Write a comment…"
				/>
			) : (
				<Textarea
					value={body}
					onChange={(e) => setBody(e.target.value)}
					placeholder="Write a comment…"
					disabled={isPending}
					rows={3}
					className="resize-none"
				/>
			)}

			{error && <p className="text-sm text-destructive">{error}</p>}

			<div className="flex gap-2 justify-end">
				{onCancel && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onCancel}
						disabled={isPending}
					>
						Cancel
					</Button>
				)}
				<Button type="submit" size="sm" disabled={isPending || !body.trim()}>
					{isPending ? "Posting…" : submitLabel}
				</Button>
			</div>
		</form>
	);
}
