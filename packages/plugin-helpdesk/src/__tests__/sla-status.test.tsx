import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SLAStatusBadge } from "../client/components/shared";
import type { HelpdeskTicket } from "../types";

const ticket: HelpdeskTicket = {
	id: "ticket",
	subject: "Customer question",
	status: "open",
	priority: "high",
	customerId: "customer",
	requesterEmail: null,
	assigneeId: null,
	slaDueAt: "2026-11-06T12:00:00Z",
	resolutionDueAt: "2026-11-06T17:00:00Z",
	firstRespondedAt: null,
	resolvedAt: null,
	createdAt: "2026-11-06T09:00:00Z",
	updatedAt: "2026-11-06T09:00:00Z",
};

describe("agent SLA target badges", () => {
	it("keeps response and resolution pending states separate", () => {
		expect(renderToStaticMarkup(<SLAStatusBadge ticket={ticket} />)).toContain(
			"Response pending",
		);
		expect(
			renderToStaticMarkup(
				<SLAStatusBadge ticket={ticket} target="resolution" />,
			),
		).toContain("Resolution pending");
	});

	it("does not satisfy the response target when resolution is met", () => {
		const resolved = { ...ticket, resolvedAt: ticket.resolutionDueAt! };
		expect(
			renderToStaticMarkup(<SLAStatusBadge ticket={resolved} />),
		).toContain("Response pending");
		expect(
			renderToStaticMarkup(
				<SLAStatusBadge ticket={resolved} target="resolution" />,
			),
		).toContain("Resolution met");
	});

	it("keeps a late resolution breached while the response is met", () => {
		const resolved = {
			...ticket,
			firstRespondedAt: ticket.slaDueAt,
			resolvedAt: "2026-11-06T17:00:00.001Z",
		};
		expect(
			renderToStaticMarkup(<SLAStatusBadge ticket={resolved} />),
		).toContain("Response met");
		const html = renderToStaticMarkup(
			<SLAStatusBadge ticket={resolved} target="resolution" />,
		);
		expect(html).toContain("Resolution breached");
		expect(html).toContain("text-destructive");
	});

	it("keeps a late public response breached after completion", () => {
		expect(
			renderToStaticMarkup(
				<SLAStatusBadge
					ticket={{ ...ticket, firstRespondedAt: "2026-11-06T12:01:00Z" }}
				/>,
			),
		).toContain("Response breached");
	});

	it.each([undefined, null])(
		"does not invent a resolution target for an unconfigured record (%s)",
		(resolutionDueAt) => {
			expect(
				renderToStaticMarkup(
					<SLAStatusBadge
						ticket={{ ...ticket, resolutionDueAt }}
						target="resolution"
					/>,
				),
			).toContain("No resolution target");
		},
	);
});
