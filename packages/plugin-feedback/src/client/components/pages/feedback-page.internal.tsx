"use client";

import { useId, useState, type FormEvent } from "react";
import { PermissionAccess } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { feedbackPermissions } from "../../../permissions";
import type { FeedbackStatus } from "../../../types";
import { useCreateFeedbackPost, useFeedbackPosts } from "../../hooks";
import { FeedbackPostCard } from "../post-card";
import {
	FeedbackPage,
	Field,
	Pagination,
	selectClass,
	statusLabels,
} from "../shared";

export function FeedbackBoardPage() {
	const id = useId();
	const [category, setCategory] = useState("");
	const [status, setStatus] = useState<FeedbackStatus | "">("");
	const [offset, setOffset] = useState(0);
	const [showForm, setShowForm] = useState(false);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const { data } = useFeedbackPosts({
		category: category.trim() || undefined,
		status: status || undefined,
		limit: 25,
		offset,
	});
	const create = useCreateFeedbackPost();
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = event.currentTarget;
		const fields = new FormData(form);
		setError("");
		setMessage("");
		try {
			await create.mutateAsync({
				title: String(fields.get("title")),
				body: String(fields.get("body")),
				category: String(fields.get("category") || "").trim() || undefined,
			});
			form.reset();
			setShowForm(false);
			setMessage("Feature request submitted");
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Request could not be submitted.",
			);
		}
	};
	return (
		<FeedbackPage title="Feature requests">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<p className="max-w-2xl text-muted-foreground">
					Share an idea and vote for the improvements you want to see.
				</p>
				<PermissionAccess permission={feedbackPermissions.post.create()}>
					<Button
						onClick={() => setShowForm(!showForm)}
						aria-expanded={showForm}
					>
						{showForm ? "Cancel request" : "Submit a request"}
					</Button>
				</PermissionAccess>
			</div>
			{message && <p role="status">{message}</p>}
			{showForm && (
				<PermissionAccess permission={feedbackPermissions.post.create()}>
					<form
						onSubmit={submit}
						className="space-y-4 rounded-lg border p-5"
						aria-label="Submit a feature request"
					>
						<Field id={`${id}-title`} label="Request title">
							<Input
								id={`${id}-title`}
								name="title"
								required
								maxLength={200}
								autoFocus
							/>
						</Field>
						<Field id={`${id}-body`} label="Description">
							<Textarea
								id={`${id}-body`}
								name="body"
								required
								maxLength={20000}
								rows={5}
							/>
						</Field>
						<Field id={`${id}-category`} label="Category">
							<Input id={`${id}-category`} name="category" maxLength={100} />
						</Field>
						{error && (
							<p role="alert" className="text-destructive">
								{error}
							</p>
						)}
						<Button type="submit" disabled={create.isPending}>
							{create.isPending ? "Submitting…" : "Submit request"}
						</Button>
					</form>
				</PermissionAccess>
			)}
			<div className="grid gap-4 sm:grid-cols-2">
				<Field id={`${id}-filter-category`} label="Filter by category">
					<Input
						id={`${id}-filter-category`}
						value={category}
						onChange={(event) => {
							setCategory(event.target.value);
							setOffset(0);
						}}
						placeholder="All categories"
					/>
				</Field>
				<Field id={`${id}-filter-status`} label="Filter by status">
					<select
						id={`${id}-filter-status`}
						className={selectClass}
						value={status}
						onChange={(event) => {
							setStatus(event.target.value as FeedbackStatus | "");
							setOffset(0);
						}}
					>
						<option value="">All statuses</option>
						{Object.entries(statusLabels).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</Field>
			</div>
			<div className="space-y-4">
				{data.items.length ? (
					data.items.map((post) => (
						<FeedbackPostCard key={post.id} post={post} />
					))
				) : (
					<p className="py-8 text-muted-foreground">
						No feature requests match these filters.
					</p>
				)}
			</div>
			<Pagination offset={offset} total={data.total} onChange={setOffset} />
		</FeedbackPage>
	);
}
