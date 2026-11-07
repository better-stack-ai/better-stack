"use client";

import { useCallback, useEffect, useState } from "react";
import { useRegisterPageAIContext } from "@btst/stack/page-context";
import {
	PermissionAccess,
	PermissionCheck,
	usePluginOverrides,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { helpdeskPermissions } from "../../../permissions";
import type {
	HelpdeskTicketDetail,
	HelpdeskCannedReply,
	TicketPriority,
	TicketStatus,
} from "../../../types";
import { HELPDESK_PLUGIN_ID } from "../../constants";
import {
	useAgentReply,
	useAgentTicket,
	useCannedReplies,
	useUpdateTicket,
	useReplyAttachments,
} from "../../hooks";
import type { HelpdeskPluginOverrides } from "../../overrides";
import { AttachmentComposer } from "../attachments";
import {
	Conversation,
	Feedback,
	Field,
	HelpdeskPage,
	HelpdeskForm,
	SLAStatusBadge,
	StatusBadge,
	formatDate,
	priorities,
	selectClass,
	statuses,
	useHelpdeskAction,
} from "../shared";

import { ticketReplyPageDescription } from "./ticket-reply-context";

function TicketReplyAIContext({
	ticket,
	cannedReplies,
	onDraft,
}: {
	ticket: HelpdeskTicketDetail;
	cannedReplies: HelpdeskCannedReply[];
	onDraft: (body: string) => void;
}) {
	useRegisterPageAIContext({
		routeName: "helpdesk-inbox-ticket",
		pageDescription: ticketReplyPageDescription(ticket, cannedReplies),
		suggestions: ["Draft a reply using the conversation and canned replies"],
		clientTools: {
			draftTicketReply: async (input) => {
				if (
					input.ticketId !== ticket.id ||
					typeof input.body !== "string" ||
					!input.body.trim() ||
					input.body.length > 20000
				)
					return {
						success: false,
						message:
							"Draft must match the current ticket and contain 1–20,000 characters.",
					};
				onDraft(input.body);
				return {
					success: true,
					message: "Draft inserted for agent review. No reply was sent.",
				};
			},
		},
	});
	return null;
}
function CannedReplyPicker({
	onSelect,
	onReplies,
}: {
	onSelect: (body: string) => void;
	onReplies: (replies: HelpdeskCannedReply[]) => void;
}) {
	const [offset, setOffset] = useState(0);
	const { data } = useCannedReplies({ limit: 25, offset });
	useEffect(() => {
		onReplies(data.items);
	}, [data.items, onReplies]);
	return (
		<div className="space-y-2">
			<Field label="Canned reply">
				{(id) => (
					<select
						id={id}
						className={selectClass}
						value=""
						onChange={(event) => {
							const reply = data.items.find(
								(item) => item.id === event.target.value,
							);
							if (reply) onSelect(reply.body);
						}}
					>
						<option value="">Insert a saved response</option>
						{data.items.map((reply) => (
							<option key={reply.id} value={reply.id}>
								{reply.title}
							</option>
						))}
					</select>
				)}
			</Field>
			{data.total > 25 && (
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={offset === 0}
						onClick={() => setOffset(Math.max(0, offset - 25))}
					>
						Previous replies
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={offset + 25 >= data.total}
						onClick={() => setOffset(offset + 25)}
					>
						Next replies
					</Button>
					<span className="text-xs text-muted-foreground">
						{offset + 1}–{Math.min(offset + 25, data.total)} of {data.total}
					</span>
				</div>
			)}
		</div>
	);
}
function TicketControls({ ticket }: { ticket: HelpdeskTicketDetail }) {
	const update = useUpdateTicket();
	const action = useHelpdeskAction();
	return (
		<HelpdeskForm
			disabled={update.isPending}
			className="space-y-4"
			onSubmit={(event) => {
				event.preventDefault();
				const fields = new FormData(event.currentTarget);
				void action.run(async () => {
					await update.mutateAsync({
						id: ticket.id,
						data: {
							status: fields.get("status") as TicketStatus,
							priority: fields.get("priority") as TicketPriority,
							assigneeId: String(fields.get("assigneeId") || "").trim() || null,
						},
					});
				}, "Ticket updated.");
			}}
		>
			<Field label="Status">
				{(id) => (
					<select
						key={ticket.updatedAt}
						id={id}
						name="status"
						className={selectClass}
						defaultValue={ticket.status}
					>
						{statuses.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				)}
			</Field>
			<Field label="Priority">
				{(id) => (
					<select
						key={ticket.updatedAt}
						id={id}
						name="priority"
						className={selectClass}
						defaultValue={ticket.priority}
					>
						{priorities.map((value) => (
							<option key={value} value={value}>
								{value}
							</option>
						))}
					</select>
				)}
			</Field>
			<Field label="Assignee ID">
				{(id) => (
					<Input
						key={ticket.updatedAt}
						id={id}
						name="assigneeId"
						defaultValue={ticket.assigneeId || ""}
						placeholder="Unassigned"
						maxLength={200}
					/>
				)}
			</Field>
			<Feedback {...action} />
			<Button disabled={update.isPending} className="min-h-11 w-full">
				{update.isPending ? "Saving…" : "Save ticket"}
			</Button>
		</HelpdeskForm>
	);
}
export function InboxTicketPage({ id }: { id: string }) {
	const { data: ticket } = useAgentTicket(id);
	const reply = useAgentReply();
	const [body, setBody] = useState("");
	const [cannedPage, setCannedPage] = useState<{
		ticketId: string;
		items: HelpdeskCannedReply[];
	} | null>(null);
	const handleCannedReplies = useCallback(
		(items: HelpdeskCannedReply[]) => setCannedPage({ ticketId: id, items }),
		[id],
	);
	const [visibility, setVisibility] = useState("public");
	const attachments = useReplyAttachments(id, true, visibility === "internal");
	useEffect(() => {
		setBody("");
		setVisibility("public");
	}, [id]);
	const action = useHelpdeskAction();
	const { renderTicketSidebar } =
		usePluginOverrides<HelpdeskPluginOverrides>(HELPDESK_PLUGIN_ID);
	return (
		<HelpdeskPage title={ticket.subject}>
			<div className="flex flex-wrap items-center gap-3">
				<StatusBadge status={ticket.status} />
				<SLAStatusBadge ticket={ticket} />
				<span className="text-sm text-muted-foreground">
					Customer: {ticket.customerId}
				</span>
			</div>
			<div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
				<div className="min-w-0 space-y-6">
					<Conversation page="helpdeskInboxTicket" messages={ticket.messages} />
					{ticket.status === "closed" ? (
						<p className="text-muted-foreground">
							Reopen this ticket to send a reply or add a note.
						</p>
					) : (
						<PermissionAccess
							permission={helpdeskPermissions.ticket.reply({
								ticketId: id,
								customerId: ticket.customerId,
							})}
						>
							<>
								<PermissionCheck
									permission={helpdeskPermissions.cannedReply.list()}
								>
									{({ can }) => (
										<TicketReplyAIContext
											ticket={ticket}
											cannedReplies={
												can && cannedPage?.ticketId === id
													? cannedPage.items
													: []
											}
											onDraft={(draft) => {
												setBody(draft);
												setVisibility("public");
											}}
										/>
									)}
								</PermissionCheck>
								<HelpdeskForm
									disabled={reply.isPending}
									className="space-y-4 rounded-lg border p-4"
									onSubmit={(event) => {
										event.preventDefault();
										void action.run(
											async () => {
												if (attachments.blocked) return;
												await reply.mutateAsync({
													id,
													body,
													isInternalNote: visibility === "internal",
													attachmentIds: attachments.attachmentIds,
												});
												attachments.reset();
												setBody("");
											},
											visibility === "internal"
												? "Internal note added. Customers cannot see this note."
												: "Public reply sent.",
										);
									}}
								>
									<div className="grid gap-4 sm:grid-cols-2">
										<Field label="Message visibility">
											{(fieldId) => (
												<select
													id={fieldId}
													className={selectClass}
													value={visibility}
													onChange={(event) =>
														setVisibility(event.target.value)
													}
												>
													<option value="public">Public reply</option>
													<option value="internal">Internal note</option>
												</select>
											)}
										</Field>
										<PermissionAccess
											permission={helpdeskPermissions.cannedReply.list()}
										>
											<CannedReplyPicker
												onSelect={setBody}
												onReplies={handleCannedReplies}
											/>
										</PermissionAccess>
									</div>
									{visibility === "internal" && (
										<p className="text-sm font-medium">
											Only support agents can see this note.
										</p>
									)}
									<Field label="Reply">
										{(fieldId) => (
											<Textarea
												id={fieldId}
												required
												rows={6}
												maxLength={20000}
												value={body}
												onChange={(event) => setBody(event.target.value)}
											/>
										)}
									</Field>
									<AttachmentComposer value={attachments} />
									<Feedback {...action} />
									<Button
										disabled={reply.isPending || attachments.blocked}
										className="min-h-11"
									>
										{reply.isPending
											? "Sending…"
											: visibility === "internal"
												? "Add internal note"
												: "Send reply"}
									</Button>
								</HelpdeskForm>
							</>
						</PermissionAccess>
					)}
				</div>
				<aside
					aria-label="Ticket details"
					className="min-w-0 space-y-6 rounded-lg border p-4"
				>
					<h2 className="text-lg font-semibold">Ticket details</h2>
					<PermissionAccess
						permission={helpdeskPermissions.ticket.update({
							ticketId: id,
							customerId: ticket.customerId,
						})}
					>
						<TicketControls ticket={ticket} />
					</PermissionAccess>
					<dl className="space-y-3 break-words text-sm">
						<div>
							<dt className="text-muted-foreground">First response due</dt>
							<dd>{formatDate(ticket.slaDueAt)}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">First responded</dt>
							<dd>
								{ticket.firstRespondedAt
									? formatDate(ticket.firstRespondedAt)
									: "Awaiting response"}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Resolved</dt>
							<dd>
								{ticket.resolvedAt
									? formatDate(ticket.resolvedAt)
									: "Not resolved"}
							</dd>
						</div>
					</dl>
					{renderTicketSidebar?.({ ticket })}
				</aside>
			</div>
		</HelpdeskPage>
	);
}
