import type { ComponentType, ReactNode } from "react";
import type { CalendarTimePickerProps } from "./components/time-picker";
import type { PaymentCheckout } from "@btst/stack/payments";

/** Browser payment customization for Calendar. */
export interface CalendarPluginOverrides {
	/** Replace time selection on booking or rescheduling pages. */
	pageOverrides?: Partial<
		Record<
			"calendarBooking" | "calendarReschedule",
			{ TimePicker?: ComponentType<CalendarTimePickerProps> }
		>
	>;
	/** Render the provider form for client-secret checkouts. Hosted checkouts redirect automatically. */
	renderPayment?: (checkout: PaymentCheckout) => ReactNode;
}
