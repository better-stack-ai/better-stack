import type { ReactNode } from "react";
import type { PaymentCheckout } from "@btst/stack/payments";

/** Browser payment customization for Calendar. */
export interface CalendarPluginOverrides {
	/** Render the provider form for client-secret checkouts. Hosted checkouts redirect automatically. */
	renderPayment?: (checkout: PaymentCheckout) => ReactNode;
}
