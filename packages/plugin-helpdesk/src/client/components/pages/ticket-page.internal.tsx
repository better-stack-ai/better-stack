"use client";

import { useState } from "react";
import { PermissionAccess, useIdentity } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { helpdeskPermissions } from "../../../permissions";
import { useCustomerReply, useCustomerTicket } from "../../hooks";
import {
	Conversation,
	Feedback,
	Field,
	HelpdeskPage,
	HelpdeskForm,
	StatusBadge,
	useHelpdeskAction,
} from "../shared";

export function TicketPage({ id }: { id: string }) {
	const { data: ticket } = useCustomerTicket(id);
	const { identity } = useIdentity();
	const reply = useCustomerReply();
	const [body, setBody] = useState("");
	const action = useHelpdeskAction();
	return (
		<HelpdeskPage title={ticket.subject}>
			<StatusBadge status={ticket.status} />
			<Conversation page="helpdeskTicket" messages={ticket.messages} />
			{ticket.status === "closed" ? (
				<p className="text-muted-foreground">
					This ticket is closed. Open a new ticket if you need more help.
				</p>
			) : (
				<PermissionAccess
					permission={helpdeskPermissions.customerTicket.reply({
						ticketId: id,
						customerId: identity?.id ?? "",
					})}
				>
					<HelpdeskForm
						disabled={reply.isPending}
						className="space-y-4 rounded-lg border p-4"
						onSubmit={(event) => {
							event.preventDefault();
							void action.run(async () => {
								await reply.mutateAsync({ id, body });
								setBody("");
							}, "Your reply was sent.");
						}}
					>
						<Field label="Reply">
							{(fieldId) => (
								<Textarea
									id={fieldId}
									required
									maxLength={20000}
									rows={5}
									value={body}
									onChange={(event) => setBody(event.target.value)}
								/>
							)}
						</Field>
						<Feedback {...action} />
						<Button disabled={reply.isPending} className="min-h-11">
							{reply.isPending ? "Sending…" : "Send reply"}
						</Button>
					</HelpdeskForm>
				</PermissionAccess>
			)}
		</HelpdeskPage>
	);
}
