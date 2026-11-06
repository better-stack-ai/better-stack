import type { ComponentType, ReactNode } from "react";
import type {
	CustomerMessage,
	HelpdeskMessage,
	HelpdeskTicketDetail,
} from "../types";

/** Helpdesk-specific runtime presentation customization. */
export interface HelpdeskPluginOverrides {
	/** Conversation presentation for customer and agent ticket pages. */
	pageOverrides?: Partial<
		Record<
			"helpdeskTicket" | "helpdeskInboxTicket",
			{
				Conversation?: ComponentType<{
					messages: (CustomerMessage | HelpdeskMessage)[];
				}>;
			}
		>
	>;
	/** Additional agent sidebar content, rendered after the ticket controls. */
	renderTicketSidebar?: (context: {
		ticket: HelpdeskTicketDetail;
	}) => ReactNode;
}
