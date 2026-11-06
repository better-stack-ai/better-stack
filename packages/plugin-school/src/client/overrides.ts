import type { PaymentCheckout } from "@btst/stack/payments";
import type { ComponentType, ReactNode } from "react";
import type { Lesson } from "../types";

/** Browser runtime customizations for the School plugin. */
export interface SchoolPluginOverrides {
	/** Render the provider form for client-secret checkouts. Hosted checkouts redirect automatically. */
	renderPayment?: (checkout: PaymentCheckout) => ReactNode;
	/** Upload images inserted into lesson Markdown. */
	uploadFile?: (file: File) => Promise<string>;
	/** Select an existing course cover or lesson image. */
	imagePicker?: ComponentType<{ onSelect: (url: string) => void }>;
	/** Replace the course cover URL input; also used when no lesson imagePicker is supplied. */
	imageInputField?: ComponentType<{
		value: string;
		onChange: (url: string) => void;
	}>;
	/** Label displayed above the catalog. */
	schoolName?: string;
	/** Content rendered below the lesson, resources, and progress controls. */
	lessonBottomSlot?: (lesson: Lesson) => ReactNode;
}
