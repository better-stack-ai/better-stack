"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PermissionAccess, usePluginOverrides } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import {
	useSubscribers,
	useCreateSubscriber,
	useUpdateSubscriber,
	useDeleteSubscriber,
	useImportSubscribers,
	useSubscriberExport,
	useSubscriberGrowth,
} from "../../hooks";
import { newsletterPermissions } from "../../../permissions";
import { NEWSLETTER_PLUGIN_ID } from "../../constants";
import type { NewsletterPluginOverrides } from "../../overrides";
import type { Subscriber, SubscriberGrowth } from "../../../types";
import type { SubscriberInput } from "../../../query-keys";
import {
	Field,
	NewsletterPage,
	Pagination,
	Status,
	selectClass,
} from "../shared";

export function SubscribersPage() {
	const id = useId();
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("");
	const [tag, setTag] = useState("");
	const [offset, setOffset] = useState(0);
	const [editing, setEditing] = useState<Subscriber | null | undefined>();
	const [deleting, setDeleting] = useState<Subscriber>();
	const [importing, setImporting] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const { data } = useSubscribers({
		query: query || undefined,
		status: status || undefined,
		tag: tag || undefined,
		offset,
		limit: 25,
	});
	const formRef = useRef<HTMLFormElement>(null);
	useEffect(() => {
		if (editing !== undefined)
			formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
	}, [editing]);
	const create = useCreateSubscriber();
	const update = useUpdateSubscriber();
	const remove = useDeleteSubscriber();
	const importCSV = useImportSubscribers();
	const exportCSV = useSubscriberExport();
	const { localization } =
		usePluginOverrides<NewsletterPluginOverrides>(NEWSLETTER_PLUGIN_ID);
	const pending =
		create.isPending ||
		update.isPending ||
		remove.isPending ||
		importCSV.isPending ||
		exportCSV.isFetching;
	const run = async (action: () => Promise<void>) => {
		setError("");
		setMessage("");
		try {
			await action();
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "The subscriber change failed. Try again.",
			);
		}
	};
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		const input: SubscriberInput = {
			email: String(fields.get("email")),
			name: String(fields.get("name") || ""),
			tags: String(fields.get("tags") || "")
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean),
			status: String(fields.get("status")) as SubscriberInput["status"],
		};
		void run(async () => {
			if (editing) await update.mutateAsync({ id: editing.id, data: input });
			else await create.mutateAsync(input);
			setEditing(undefined);
			setMessage("Subscriber saved");
		});
	};
	return (
		<NewsletterPage
			page="subscribers"
			title={localization?.subscribers ?? "Subscribers"}
			description="Keep your audience up to date. Target a campaign with the tags you assign here."
			action={
				<PermissionAccess
					permission={newsletterPermissions.subscriber.create()}
				>
					<Button
						onClick={() => {
							setEditing(null);
							setImporting(false);
						}}
					>
						Add subscriber
					</Button>
				</PermissionAccess>
			}
		>
			<PermissionAccess permission={newsletterPermissions.analytics.read()}>
				<SubscriberGrowthSection />
			</PermissionAccess>
			<div className="flex flex-wrap gap-3">
				<PermissionAccess
					permission={newsletterPermissions.subscriber.import()}
				>
					<Button
						variant="outline"
						disabled={pending}
						onClick={() => {
							setImporting(!importing);
							setEditing(undefined);
						}}
					>
						Import CSV
					</Button>
				</PermissionAccess>
				<PermissionAccess
					permission={newsletterPermissions.subscriber.export()}
				>
					<Button
						variant="outline"
						disabled={pending}
						onClick={() =>
							void run(async () => {
								const result = await exportCSV.refetch();
								if (result.error) throw result.error;
								const csv = result.data?.csv;
								if (csv === undefined)
									throw new Error("CSV could not be exported. Try again.");
								const url = URL.createObjectURL(
									new Blob([csv], { type: "text/csv;charset=utf-8" }),
								);
								const anchor = document.createElement("a");
								anchor.href = url;
								anchor.download = "subscribers.csv";
								anchor.click();
								URL.revokeObjectURL(url);
								setMessage("Subscribers exported");
							})
						}
					>
						Export CSV
					</Button>
				</PermissionAccess>
			</div>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
			{editing !== undefined && (
				<form
					ref={formRef}
					key={editing?.id ?? "new"}
					className="space-y-5 rounded-lg border p-5"
					onSubmit={save}
				>
					<h2 className="text-xl font-medium">
						{editing ? "Edit subscriber" : "Add subscriber"}
					</h2>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field id={`${id}-email`} label="Email">
							<Input
								id={`${id}-email`}
								name="email"
								type="email"
								required
								maxLength={254}
								defaultValue={editing?.email}
							/>
						</Field>
						<Field id={`${id}-name`} label="Name">
							<Input
								id={`${id}-name`}
								name="name"
								maxLength={200}
								defaultValue={editing?.name ?? ""}
							/>
						</Field>
						<Field
							id={`${id}-tags`}
							label="Tags"
							hint="Separate tags with commas."
						>
							<Input
								id={`${id}-tags`}
								name="tags"
								defaultValue={editing?.tags.join(", ")}
							/>
						</Field>
						<Field id={`${id}-status`} label="Status">
							<select
								id={`${id}-status`}
								name="status"
								className={selectClass}
								defaultValue={editing?.status ?? "subscribed"}
							>
								<option value="subscribed">Subscribed</option>
								<option value="unsubscribed">Unsubscribed</option>
								<option value="bounced">Bounced</option>
							</select>
						</Field>
					</div>
					<div className="flex gap-3">
						<Button type="submit" disabled={pending}>
							Save subscriber
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => setEditing(undefined)}
						>
							Cancel
						</Button>
					</div>
				</form>
			)}
			{importing && (
				<form
					className="space-y-4 rounded-lg border p-5"
					onSubmit={(event) => {
						event.preventDefault();
						const csv = String(new FormData(event.currentTarget).get("csv"));
						void run(async () => {
							const result = await importCSV.mutateAsync(csv);
							setMessage(`${result.imported} subscribers imported`);
							setImporting(false);
						});
					}}
				>
					<Field
						id={`${id}-csv`}
						label="CSV data"
						hint="Use email, name, status and tags columns. Tags are a JSON array in a quoted CSV cell."
					>
						<Textarea
							id={`${id}-csv`}
							name="csv"
							rows={6}
							required
							placeholder={
								"email,name,status,tags\nreader@example.com,Alex,subscribed,"
							}
						/>
					</Field>
					<Button type="submit" disabled={pending}>
						Import subscribers
					</Button>
				</form>
			)}
			<div className="grid gap-4 sm:grid-cols-3">
				<Field id={`${id}-search`} label="Search subscribers">
					<Input
						id={`${id}-search`}
						type="search"
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setOffset(0);
						}}
						placeholder="Email or name"
					/>
				</Field>
				<Field id={`${id}-filter-status`} label="Filter by status">
					<select
						id={`${id}-filter-status`}
						className={selectClass}
						value={status}
						onChange={(e) => {
							setStatus(e.target.value);
							setOffset(0);
						}}
					>
						<option value="">All statuses</option>
						<option value="subscribed">Subscribed</option>
						<option value="unsubscribed">Unsubscribed</option>
						<option value="bounced">Bounced</option>
					</select>
				</Field>
				<Field id={`${id}-filter-tag`} label="Filter by tag">
					<Input
						id={`${id}-filter-tag`}
						value={tag}
						onChange={(e) => {
							setTag(e.target.value);
							setOffset(0);
						}}
						placeholder="Any tag"
					/>
				</Field>
			</div>
			{data.items.length === 0 ? (
				<p className="py-8 text-muted-foreground">
					No subscribers match. Add a subscriber or adjust your filters.
				</p>
			) : (
				<div className="overflow-x-auto rounded-lg border">
					<table className="w-full min-w-[650px] text-left text-sm">
						<caption className="sr-only">Newsletter subscribers</caption>
						<thead className="border-b bg-muted/40">
							<tr>
								<th className="p-4 font-medium">Email</th>
								<th className="p-4 font-medium">Status</th>
								<th className="p-4 font-medium">Tags</th>
								<th className="p-4 font-medium">Actions</th>
							</tr>
						</thead>
						<tbody>
							{data.items.map((subscriber) => (
								<tr className="border-b last:border-0" key={subscriber.id}>
									<td className="p-4">
										{subscriber.email}
										{subscriber.name && (
											<p className="mt-1 text-xs text-muted-foreground">
												{subscriber.name}
											</p>
										)}
									</td>
									<td className="p-4">
										<Status value={subscriber.status} />
									</td>
									<td className="p-4">{subscriber.tags.join(", ") || "—"}</td>
									<td className="p-4">
										<div className="flex gap-2">
											<PermissionAccess
												permission={newsletterPermissions.subscriber.update({
													subscriberId: subscriber.id,
													status: subscriber.status,
												})}
											>
												<Button
													size="sm"
													className="min-h-11"
													variant="outline"
													aria-label={`Edit ${subscriber.email}`}
													onClick={() => {
														setEditing(subscriber);
														setImporting(false);
													}}
												>
													Edit
												</Button>
											</PermissionAccess>
											<PermissionAccess
												permission={newsletterPermissions.subscriber.delete({
													subscriberId: subscriber.id,
													status: subscriber.status,
												})}
											>
												<Button
													size="sm"
													className="min-h-11"
													variant="outline"
													aria-label={`Delete ${subscriber.email}`}
													disabled={pending}
													onClick={() => setDeleting(subscriber)}
												>
													Delete
												</Button>
											</PermissionAccess>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<Pagination offset={offset} total={data.total} onChange={setOffset} />
			<AlertDialog
				open={!!deleting}
				onOpenChange={(open) => {
					if (!open) setDeleting(undefined);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete subscriber?</AlertDialogTitle>
						<AlertDialogDescription>
							{deleting?.email} will be removed from your subscriber list.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								const subscriber = deleting;
								if (subscriber)
									void run(async () => {
										await remove.mutateAsync(subscriber.id);
										setMessage("Subscriber deleted");
										if (data.items.length === 1 && offset > 0)
											setOffset(offset - 25);
									});
							}}
						>
							Delete subscriber
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</NewsletterPage>
	);
}

function SubscriberGrowthSection() {
	const { data: growth } = useSubscriberGrowth();
	return <SubscriberGrowthChart growth={growth} />;
}

function SubscriberGrowthChart({ growth }: { growth: SubscriberGrowth }) {
	const max = Math.max(1, ...growth.points.map((point) => point.count));
	const points = growth.points
		.map(
			(point, index) =>
				`${growth.points.length === 1 ? 300 : 20 + (index / (growth.points.length - 1)) * 560},${130 - (point.count / max) * 110}`,
		)
		.join(" ");
	return (
		<section
			aria-labelledby="newsletter-growth-title"
			className="grid gap-6 border-b pb-6 sm:grid-cols-[1fr_2fr]"
		>
			<div className="space-y-3">
				<h2 id="newsletter-growth-title" className="text-lg font-medium">
					Subscriber growth
				</h2>
				<p className="text-3xl font-semibold tabular-nums">
					{growth.total.toLocaleString()}{" "}
					<span className="text-base font-normal text-muted-foreground">
						total subscribers
					</span>
				</p>
				<p className="text-sm text-muted-foreground">
					{growth.subscribed} subscribed, {growth.unsubscribed} unsubscribed,{" "}
					{growth.bounced} bounced
				</p>
			</div>
			<div className="min-w-0">
				{growth.points.length ? (
					<>
						<svg
							viewBox="0 0 600 150"
							role="img"
							aria-label="Cumulative subscribers over time"
							className="h-32 w-full text-primary"
						>
							<title>Cumulative subscribers over time</title>
							<line
								x1="20"
								y1="130"
								x2="580"
								y2="130"
								stroke="currentColor"
								opacity="0.2"
							/>
							<polyline
								points={points}
								fill="none"
								stroke="currentColor"
								strokeWidth="3"
							/>
							{growth.points.length === 1 && (
								<circle
									cx="300"
									cy={130 - (growth.points[0]!.count / max) * 110}
									r="4"
									fill="currentColor"
								/>
							)}
						</svg>
						<div className="flex justify-between gap-4 text-xs text-muted-foreground">
							<span>{growth.points[0]?.date}</span>
							<span>{growth.points.at(-1)?.date}</span>
						</div>
						<details className="mt-2 text-xs text-muted-foreground">
							<summary className="cursor-pointer">View growth data</summary>
							<ul className="mt-2 space-y-1">
								{growth.points.map((point) => (
									<li key={point.date}>
										{point.date}: {point.count} subscribers
									</li>
								))}
							</ul>
						</details>
					</>
				) : (
					<p className="py-8 text-sm text-muted-foreground">
						Growth appears after your first subscriber joins.
					</p>
				)}
			</div>
		</section>
	);
}
