"use client";
import { useState, type FormEvent } from "react";
import { PermissionAccess } from "@btst/stack/context";
import { useRegisterPageAIContext } from "@btst/stack/page-context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
	useActivities,
	useCreateActivity,
	useUpdateActivity,
	useDeleteActivity,
} from "../hooks";
import { crmPermissions } from "../../permissions";
import type { ActivityInput } from "@btst/stack/plugins/crm/query-keys";
import {
	Field,
	Feedback,
	DeleteRecord,
	Pagination,
	selectClass,
	useCrmAction,
} from "./shared";

export function ActivityTimeline({
	contactId,
	dealId,
	description,
}: {
	contactId?: string;
	dealId?: string;
	description: string;
}) {
	const [offset, setOffset] = useState(0);
	const { data } = useActivities({ contactId, dealId, limit: 25, offset });
	const create = useCreateActivity();
	const update = useUpdateActivity();
	const remove = useDeleteActivity();
	const [logging, setLogging] = useState(false);
	const action = useCrmAction();
	useRegisterPageAIContext({
		routeName: contactId ? "crm-contact-detail" : "crm-deal-detail",
		pageDescription:
			`${description}\nRecent activities:\n${data.items.map((a) => `${a.type}: ${a.body}${a.dueAt ? ` Follow-up due ${a.dueAt}` : ""}`).join("\n")}`.slice(
				0,
				16000,
			),
		suggestions: [
			"Summarize this relationship's history",
			"Draft a follow-up email",
			"Log a call note",
		],
		clientTools: {
			logCrmActivity: async (input: ActivityInput) => {
				await create.mutateAsync({ ...input, contactId, dealId });
				return { success: true, message: "Activity saved" };
			},
		},
	});
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = event.currentTarget;
		const fields = new FormData(form);
		const due = String(fields.get("dueAt") || "");
		void action.run(async () => {
			await create.mutateAsync({
				type: String(fields.get("type")) as ActivityInput["type"],
				body: String(fields.get("body")),
				contactId,
				dealId,
				dueAt: due ? new Date(due).toISOString() : null,
			});
			form.reset();
			setLogging(false);
		}, "Activity saved");
	};
	return (
		<section className="min-w-0 space-y-5" aria-label="Activity timeline">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="text-xl font-semibold">Activity timeline</h2>
				<PermissionAccess
					permission={crmPermissions.activity.create({
						contactId: contactId ?? null,
						dealId: dealId ?? null,
					})}
				>
					<Button
						className="min-h-11"
						variant="outline"
						onClick={() => setLogging(!logging)}
					>
						Log activity
					</Button>
				</PermissionAccess>
			</div>
			<Feedback {...action} />
			{logging && (
				<form className="space-y-4 rounded-lg border p-4" onSubmit={save}>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field label="Type">
							{(id) => (
								<select id={id} name="type" className={selectClass}>
									<option value="note">Note</option>
									<option value="call">Call</option>
									<option value="email">Email</option>
									<option value="meeting">Meeting</option>
								</select>
							)}
						</Field>
						<Field label="Follow-up due">
							{(id) => <Input id={id} name="dueAt" type="datetime-local" />}
						</Field>
					</div>
					<Field label="Activity details">
						{(id) => (
							<Textarea
								id={id}
								name="body"
								required
								maxLength={20000}
								rows={4}
							/>
						)}
					</Field>
					<div className="flex gap-3">
						<Button
							type="submit"
							className="min-h-11"
							disabled={create.isPending}
						>
							Save activity
						</Button>
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={() => setLogging(false)}
						>
							Cancel
						</Button>
					</div>
				</form>
			)}
			{data.items.length ? (
				<ol className="divide-y">
					{data.items.map((activity) => (
						<li key={activity.id} className="space-y-3 py-5">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<h3 className="font-medium capitalize">{activity.type}</h3>
								<time
									className="text-sm text-muted-foreground"
									dateTime={activity.createdAt}
								>
									{new Date(activity.createdAt).toLocaleString()}
								</time>
							</div>
							<p className="whitespace-pre-wrap break-words text-sm leading-6">
								{activity.body}
							</p>
							{activity.dueAt && (
								<p className="text-sm">
									{activity.completedAt ? "Completed" : "Follow-up due"}:{" "}
									<time dateTime={activity.completedAt ?? activity.dueAt}>
										{new Date(
											activity.completedAt ?? activity.dueAt,
										).toLocaleString()}
									</time>
								</p>
							)}
							<div className="flex flex-wrap gap-2">
								{activity.dueAt && (
									<PermissionAccess
										permission={crmPermissions.activity.update({
											id: activity.id,
										})}
									>
										<Button
											variant="outline"
											className="min-h-11"
											disabled={update.isPending}
											onClick={() =>
												void action.run(
													async () => {
														await update.mutateAsync({
															id: activity.id,
															data: {
																completedAt: activity.completedAt
																	? null
																	: new Date().toISOString(),
															},
														});
													},
													activity.completedAt
														? "Follow-up reopened"
														: "Follow-up completed",
												)
											}
										>
											{activity.completedAt
												? "Reopen follow-up"
												: "Complete follow-up"}
										</Button>
									</PermissionAccess>
								)}
								<PermissionAccess
									permission={crmPermissions.activity.delete({
										id: activity.id,
									})}
								>
									<DeleteRecord
										label="Delete activity"
										description="This activity will be removed from the timeline."
										pending={remove.isPending}
										onDelete={() =>
											void action.run(async () => {
												await remove.mutateAsync(activity.id);
											}, "Activity deleted")
										}
									/>
								</PermissionAccess>
							</div>
						</li>
					))}
				</ol>
			) : (
				<p className="py-6 text-muted-foreground">
					No activities yet. Log a note, call, email, or meeting to start the
					timeline.
				</p>
			)}
			<Pagination offset={offset} total={data.total} onChange={setOffset} />
		</section>
	);
}
