"use client";

import { useState, type ComponentType } from "react";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { useTranslate } from "@btst/stack/context";
import type { StackError } from "@btst/stack/plugins/client";
import type { CommentsLocalization } from "../localization";

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
	/** Localization strings */
	localization?: Partial<CommentsLocalization>;
}

export function CommentForm({
	authorId: _authorId,
	initialBody = "",
	submitLabel,
	onSubmit,
	onCancel,
	InputComponent,
	localization,
}: CommentFormProps) {
	const t = useTranslate();
	const [body, setBody] = useState(initialBody);
	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const resolvedSubmitLabel =
		submitLabel ??
		localization?.COMMENTS_FORM_POST_COMMENT ??
		t("comments.form.postComment", "Post comment");

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!body.trim()) return;
		setError(null);
		setIsPending(true);
		try {
			await onSubmit(body.trim());
			setBody("");
		} catch (err) {
			// Server-side Zod failures arrive as a StackError with a field-error
			// map — surface the `body` message inline instead of the generic one.
			const bodyError = (err as StackError)?.errors?.body;
			const bodyMessage = Array.isArray(bodyError) ? bodyError[0] : bodyError;
			setError(
				bodyMessage ??
					(err instanceof Error && err.message
						? err.message
						: (localization?.COMMENTS_FORM_SUBMIT_ERROR ??
							t("comments.form.submitError", "Failed to submit comment"))),
			);
		} finally {
			setIsPending(false);
		}
	};

	return (
		<form
			data-testid="comment-form"
			onSubmit={handleSubmit}
			className="flex flex-col gap-2"
		>
			{InputComponent ? (
				<InputComponent
					value={body}
					onChange={setBody}
					disabled={isPending}
					placeholder={
						localization?.COMMENTS_FORM_PLACEHOLDER ??
						t("comments.form.placeholder", "Write a comment…")
					}
				/>
			) : (
				<Textarea
					value={body}
					onChange={(e) => setBody(e.target.value)}
					placeholder={
						localization?.COMMENTS_FORM_PLACEHOLDER ??
						t("comments.form.placeholder", "Write a comment…")
					}
					disabled={isPending}
					rows={3}
					className="resize-none"
				/>
			)}

			{error && (
				<p
					className="text-sm text-destructive"
					data-testid="comment-form-error"
				>
					{error}
				</p>
			)}

			<div className="flex gap-2 justify-end">
				{onCancel && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onCancel}
						disabled={isPending}
					>
						{localization?.COMMENTS_FORM_CANCEL ??
							t("comments.form.cancel", "Cancel")}
					</Button>
				)}
				<Button type="submit" size="sm" disabled={isPending || !body.trim()}>
					{isPending
						? (localization?.COMMENTS_FORM_POSTING ??
							t("comments.form.posting", "Posting…"))
						: resolvedSubmitLabel}
				</Button>
			</div>
		</form>
	);
}
