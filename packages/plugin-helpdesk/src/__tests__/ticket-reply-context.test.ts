import { expect, it } from "vitest";
import { ticketReplyPageDescription } from "../client/components/pages/ticket-reply-context";
import type { HelpdeskTicketDetail, HelpdeskCannedReply } from "../types";

it("grounds long-ticket drafts in recent public messages and bounded canned replies", () => {
	const ticket = {
		id: "ticket-alice",
		subject: "Billing",
		messages: [
			{
				authorType: "customer",
				body: "a".repeat(20000),
				isInternalNote: false,
			},
			{
				authorType: "agent",
				body: "Private account investigation",
				isInternalNote: true,
			},
			{
				authorType: "customer",
				body: "The latest invoice is still wrong",
				isInternalNote: false,
			},
		],
	} as HelpdeskTicketDetail;
	const canned = [
		{
			title: "Billing response",
			body: "We will review your invoice. " + "x".repeat(20000),
		},
	] as HelpdeskCannedReply[];
	const description = ticketReplyPageDescription(ticket, canned);
	expect(description.length).toBeLessThanOrEqual(16000);
	expect(description).toContain("ticket-alice");
	expect(description).toContain("The latest invoice is still wrong");
	expect(description).toContain(
		"Billing response: We will review your invoice.",
	);
	expect(description).toContain("earlier text omitted");
	expect(description).toContain("truncated");
	expect(description).not.toContain("Private account investigation");
});
