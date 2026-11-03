"use client";

import { useId, useState, type FormEvent } from "react";
import {
	createApiClient,
	isErrorResponse,
	toError,
} from "@btst/stack/plugins/client";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";

/** Standalone public subscription form; a StackProvider is not required. */
export interface SubscribeFormProps {
	/** Origin of the newsletter API; an empty string uses the current origin. */
	apiBaseURL: string;
	/** Mount path of the backend stack, such as /api/data. */
	apiBasePath: string;
	/** Tags assigned to subscriptions from this form. */
	tags?: string[];
	/** Called after the API accepts the subscription request. */
	onSuccess?: () => void;
	/** Optional wrapper class for embedding in an existing page. */
	className?: string;
}

export function SubscribeForm({
	apiBaseURL,
	apiBasePath,
	tags = [],
	onSuccess,
	className,
}: SubscribeFormProps) {
	const id = useId();
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = event.currentTarget;
		const data = new FormData(form);
		setPending(true);
		setError("");
		setMessage("");
		try {
			const client = createApiClient({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			});
			const response = await client(
				"@post/newsletter/subscribe" as never,
				{
					method: "POST",
					body: {
						email: String(data.get("email")),
						name: String(data.get("name") || "") || undefined,
						tags,
					},
				} as never,
			);
			if (isErrorResponse(response)) throw toError(response);
			const result = response as unknown as { message?: string };
			setMessage(
				result.message ??
					"You're subscribed. Check your inbox for any confirmation steps.",
			);
			form.reset();
			onSuccess?.();
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Subscription failed. Try again.",
			);
		} finally {
			setPending(false);
		}
	};
	return (
		<form onSubmit={submit} className={className ?? "space-y-4"}>
			<div className="space-y-2">
				<Label htmlFor={`${id}-name`}>Name (optional)</Label>
				<Input
					id={`${id}-name`}
					name="name"
					autoComplete="name"
					maxLength={200}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor={`${id}-email`}>Email address</Label>
				<Input
					id={`${id}-email`}
					name="email"
					type="email"
					required
					autoComplete="email"
					maxLength={254}
				/>
			</div>
			<Button type="submit" disabled={pending}>
				{pending ? "Subscribing…" : "Subscribe"}
			</Button>
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
		</form>
	);
}
