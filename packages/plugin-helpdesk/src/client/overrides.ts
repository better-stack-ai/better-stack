import type { ReactNode } from "react";
import type { HelpdeskTicketDetail } from "../types";

/** Helpdesk-specific runtime presentation customization. */
export interface HelpdeskPluginOverrides {
	/** Additional agent sidebar content, rendered after the ticket controls. */
	renderTicketSidebar?: (context: {
		ticket: HelpdeskTicketDetail;
	}) => ReactNode;
}
