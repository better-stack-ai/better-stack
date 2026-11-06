"use client";

import { useId, useState, type FormEvent } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { feedbackPermissions } from "../../../permissions";
import {
	useCreateChangelogEntry,
	useFeedbackChangelog,
	useFeedbackPosts,
} from "../../hooks";
import { FEEDBACK_PLUGIN_ID } from "../../constants";
import { FeedbackPage, Field, Pagination } from "../shared";

function ChangelogEditor({ onPublished }: { onPublished: () => void }) {
	const id = useId();
	const [offset, setOffset] = useState(0);
	const [selected, setSelected] = useState<string[]>([]);
	const [error, setError] = useState("");
	const { data: shipped } = useFeedbackPosts({
		status: "shipped",
		limit: 25,
		offset,
	});
	const create = useCreateChangelogEntry();
	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		setError("");
		try {
			await create.mutateAsync({
				title: String(fields.get("title")),
				body: String(fields.get("body")),
				postIds: selected,
			});
			onPublished();
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Release could not be published.",
			);
		}
	};
	return (
		<form
			onSubmit={submit}
			className="space-y-4 rounded-lg border p-5"
			aria-label="Publish a release"
		>
			<Field id={`${id}-title`} label="Release title">
				<Input
					id={`${id}-title`}
					name="title"
					required
					maxLength={200}
					autoFocus
				/>
			</Field>
			<Field id={`${id}-body`} label="Release notes">
				<Textarea
					id={`${id}-body`}
					name="body"
					required
					maxLength={20000}
					rows={5}
				/>
			</Field>
			<fieldset className="space-y-3">
				<legend className="mb-3 text-sm font-medium">
					Linked shipped requests
				</legend>
				{shipped.items.length ? (
					shipped.items.map((post) => (
						<label
							key={post.id}
							className="flex min-h-11 items-center gap-3 text-sm"
						>
							<input
								type="checkbox"
								value={post.id}
								checked={selected.includes(post.id)}
								onChange={(event) =>
									setSelected((current) =>
										event.target.checked
											? [...current, post.id]
											: current.filter((postId) => postId !== post.id),
									)
								}
							/>
							{post.title}
						</label>
					))
				) : (
					<p className="text-sm text-muted-foreground">
						Ship a feature request to link it to a release.
					</p>
				)}
			</fieldset>
			<Pagination offset={offset} total={shipped.total} onChange={setOffset} />
			{error && (
				<p role="alert" className="text-destructive">
					{error}
				</p>
			)}
			<Button type="submit" disabled={create.isPending}>
				{create.isPending ? "Publishing…" : "Publish release"}
			</Button>
		</form>
	);
}

export function FeedbackChangelogPage() {
	const [offset, setOffset] = useState(0);
	const [editing, setEditing] = useState(false);
	const [message, setMessage] = useState("");
	const { data } = useFeedbackChangelog({ limit: 25, offset });
	const { Link, resolve } = usePluginSiteNavigation(FEEDBACK_PLUGIN_ID);
	return (
		<FeedbackPage title="Changelog">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<p className="text-muted-foreground">
					Release notes and the requests behind each improvement.
				</p>
				<PermissionAccess permission={feedbackPermissions.changelog.create()}>
					<Button aria-expanded={editing} onClick={() => setEditing(!editing)}>
						{editing ? "Cancel release" : "Write a release"}
					</Button>
				</PermissionAccess>
			</div>
			{message && <p role="status">{message}</p>}
			{editing && (
				<PermissionAccess permission={feedbackPermissions.changelog.create()}>
					<ChangelogEditor
						onPublished={() => {
							setEditing(false);
							setMessage("Release published");
						}}
					/>
				</PermissionAccess>
			)}
			<div className="space-y-8">
				{data.items.length ? (
					data.items.map((entry) => (
						<article key={entry.id} className="space-y-4 rounded-lg border p-6">
							<time
								className="text-sm text-muted-foreground"
								dateTime={entry.publishedAt}
							>
								{entry.publishedAt.slice(0, 10)}
							</time>
							<h2 className="break-words text-2xl font-semibold">
								{entry.title}
							</h2>
							<p className="whitespace-pre-wrap break-words leading-7">
								{entry.body}
							</p>
							{entry.posts.length > 0 && (
								<div className="space-y-2">
									<h3 className="text-sm font-medium">Shipped requests</h3>
									<ul className="list-inside list-disc space-y-2">
										{entry.posts.map((post) => (
											<li key={post.id}>
												<Link
													href={
														resolve(`feedback/${encodeURIComponent(post.slug)}`)
															.href
													}
													className="rounded-sm underline focus-visible:outline-2 focus-visible:outline-ring"
												>
													{post.title}
												</Link>
											</li>
										))}
									</ul>
								</div>
							)}
						</article>
					))
				) : (
					<p className="py-8 text-muted-foreground">
						No releases published yet.
					</p>
				)}
			</div>
			<Pagination offset={offset} total={data.total} onChange={setOffset} />
		</FeedbackPage>
	);
}
