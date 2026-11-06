"use client";

import { useState } from "react";
import { useListState } from "@btst/stack/client/hooks";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { helpdeskPermissions } from "../../../permissions";
import type { TicketPriority, TicketStatus } from "../../../types";
import { HELPDESK_PLUGIN_ID } from "../../constants";
import { useCreateTicket, useCustomerTickets } from "../../hooks";
import {
	Field,
	HELPDESK_LIST_STATE_SCHEMA,
	TicketSearch,
	Feedback,
	HelpdeskPage,
	HelpdeskForm,
	Pagination,
	StatusBadge,
	formatDate,
	priorities,
	selectClass,
	useHelpdeskAction,
} from "../shared";

export function PortalPage() {
	const [{ search, status, priority: filterPriority, offset }, setListState] =
		useListState("helpdesk-portal", HELPDESK_LIST_STATE_SCHEMA);
	const { data } = useCustomerTickets({
		search: search || undefined,
		status: (status || undefined) as TicketStatus | undefined,
		priority: (filterPriority || undefined) as TicketPriority | undefined,
		limit: 25,
		offset,
	});
	const create = useCreateTicket();
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [priority, setPriority] = useState<TicketPriority>("medium");
	const action = useHelpdeskAction();
	const { Link, resolve, navigate } =
		usePluginSiteNavigation(HELPDESK_PLUGIN_ID);
	return (
		<HelpdeskPage
			title="My support tickets"
			description="Open a ticket and keep your conversation with support in one place."
		>
			<PermissionAccess
				permission={helpdeskPermissions.customerTicket.create()}
			>
				<HelpdeskForm
					disabled={create.isPending}
					className="space-y-4 rounded-lg border p-4 sm:p-6"
					onSubmit={(event) => {
						event.preventDefault();
						void action.run(async () => {
							const ticket = await create.mutateAsync({
								subject,
								body,
								priority,
							});
							await navigate(`helpdesk/${ticket.id}`);
						});
					}}
				>
					<h2 className="text-lg font-semibold">Open a support ticket</h2>
					<div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
						<Field label="Subject">
							{(id) => (
								<Input
									id={id}
									required
									maxLength={200}
									value={subject}
									onChange={(event) => setSubject(event.target.value)}
								/>
							)}
						</Field>
						<Field label="Priority">
							{(id) => (
								<select
									id={id}
									className={selectClass}
									value={priority}
									onChange={(event) =>
										setPriority(event.target.value as TicketPriority)
									}
								>
									{priorities.map((value) => (
										<option key={value} value={value}>
											{value}
										</option>
									))}
								</select>
							)}
						</Field>
					</div>
					<Field label="Message">
						{(id) => (
							<Textarea
								id={id}
								required
								maxLength={20000}
								rows={4}
								value={body}
								onChange={(event) => setBody(event.target.value)}
							/>
						)}
					</Field>
					<Feedback {...action} />
					<Button className="min-h-11" disabled={create.isPending}>
						{create.isPending ? "Opening ticket…" : "Open ticket"}
					</Button>
				</HelpdeskForm>
			</PermissionAccess>
			<section aria-label="My tickets" className="space-y-4">
				<h2 className="text-lg font-semibold">Your tickets</h2>
				<TicketSearch
					search={search}
					onSearch={(value) => setListState({ search: value, offset: 0 })}
				/>
				{data.items.length ? (
					<ul className="divide-y rounded-lg border">
						{data.items.map((ticket) => (
							<li
								key={ticket.id}
								className="flex flex-wrap items-start justify-between gap-3 p-4"
							>
								<div className="min-w-0">
									<Link
										href={resolve(`helpdesk/${ticket.id}`).href}
										className="inline-flex min-h-11 items-center break-words font-medium underline-offset-4 hover:underline"
									>
										{ticket.subject}
									</Link>
									<p className="text-xs text-muted-foreground">
										Updated {formatDate(ticket.updatedAt)}
									</p>
								</div>
								<StatusBadge status={ticket.status} />
							</li>
						))}
					</ul>
				) : (
					<p className="py-8 text-muted-foreground">
						{search || status || filterPriority
							? "No tickets match these filters."
							: "You have no support tickets yet."}
					</p>
				)}
				<Pagination
					offset={offset}
					total={data.total}
					onChange={(value) => setListState({ offset: value })}
				/>
			</section>
		</HelpdeskPage>
	);
}
