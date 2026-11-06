"use client";

import { useListState } from "@btst/stack/client/hooks";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Input } from "@workspace/ui/components/input";
import type { TicketPriority, TicketStatus } from "../../../types";
import { HELPDESK_PLUGIN_ID } from "../../constants";
import { useHelpdeskInbox } from "../../hooks";
import {
	Field,
	HELPDESK_LIST_STATE_SCHEMA,
	TicketSearch,
	HelpdeskPage,
	Pagination,
	SLAStatusBadge,
	StatusBadge,
	formatDate,
	priorities,
	selectClass,
	statuses,
} from "../shared";

export function InboxPage() {
	const [{ search, status, priority, assigneeId, offset }, setListState] =
		useListState("helpdesk-inbox", HELPDESK_LIST_STATE_SCHEMA);
	const { data } = useHelpdeskInbox({
		search: search || undefined,
		status: (status || undefined) as TicketStatus | undefined,
		priority: (priority || undefined) as TicketPriority | undefined,
		assigneeId: assigneeId || undefined,
		limit: 25,
		offset,
	});
	const { Link, resolve } = usePluginSiteNavigation(HELPDESK_PLUGIN_ID);
	return (
		<HelpdeskPage
			title="Support inbox"
			description="Triage tickets, track response targets, and continue customer conversations."
		>
			<TicketSearch
				search={search}
				onSearch={(value) => setListState({ search: value, offset: 0 })}
			/>
			<div className="grid gap-4 sm:grid-cols-3">
				<Field label="Filter by status">
					{(id) => (
						<select
							id={id}
							className={selectClass}
							value={status}
							onChange={(event) => {
								setListState({ status: event.target.value, offset: 0 });
							}}
						>
							<option value="">All statuses</option>
							{statuses.map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					)}
				</Field>
				<Field label="Filter by priority">
					{(id) => (
						<select
							id={id}
							className={selectClass}
							value={priority}
							onChange={(event) => {
								setListState({ priority: event.target.value, offset: 0 });
							}}
						>
							<option value="">All priorities</option>
							{priorities.map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					)}
				</Field>
				<Field label="Filter by assignee">
					{(id) => (
						<Input
							id={id}
							value={assigneeId}
							placeholder="All agents"
							onChange={(event) => {
								setListState({ assigneeId: event.target.value, offset: 0 });
							}}
						/>
					)}
				</Field>
			</div>
			{data.items.length ? (
				<div
					className="overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring"
					tabIndex={0}
					role="region"
					aria-label="Support inbox table"
				>
					<table className="min-w-[44rem] w-full text-left text-sm">
						<caption className="sr-only">
							Support ticket queue and first-response SLA status
						</caption>
						<thead className="border-b bg-muted/40">
							<tr>
								<th className="p-4 font-medium">Ticket</th>
								<th className="p-4 font-medium">Status</th>
								<th className="p-4 font-medium">Priority</th>
								<th className="p-4 font-medium">Assignee</th>
								<th className="p-4 font-medium">Response SLA</th>
							</tr>
						</thead>
						<tbody>
							{data.items.map((ticket) => (
								<tr key={ticket.id} className="border-b last:border-0">
									<td className="max-w-xs p-4">
										<Link
											href={resolve(`helpdesk/inbox/${ticket.id}`).href}
											className="inline-flex min-h-11 items-center break-words font-medium underline-offset-4 hover:underline"
										>
											{ticket.subject}
										</Link>
										<p className="text-xs text-muted-foreground">
											{ticket.customerId}
										</p>
									</td>
									<td className="p-4">
										<StatusBadge status={ticket.status} />
									</td>
									<td className="p-4 capitalize">{ticket.priority}</td>
									<td className="max-w-40 break-words p-4">
										{ticket.assigneeId || "Unassigned"}
									</td>
									<td className="p-4">
										<SLAStatusBadge ticket={ticket} />
										<p className="mt-2 text-xs text-muted-foreground">
											Due {formatDate(ticket.slaDueAt)}
										</p>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="py-10 text-muted-foreground">
					No tickets match these filters.
				</p>
			)}
			<Pagination
				offset={offset}
				total={data.total}
				onChange={(value) => setListState({ offset: value })}
			/>
		</HelpdeskPage>
	);
}
