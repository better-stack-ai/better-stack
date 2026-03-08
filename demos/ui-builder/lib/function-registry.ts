import { z } from "zod";
import { toast } from "sonner";
import type { FunctionRegistry } from "@btst/stack/plugins/ui-builder";

export const functionRegistry: FunctionRegistry = {
	showWelcomeToast: {
		name: "Show Welcome Toast",
		schema: z.tuple([]),
		fn: () => {
			toast.success("Welcome! Let's get started 🚀");
		},
		description: "Shows a welcome notification",
	},
	showSuccessToast: {
		name: "Show Success Toast",
		schema: z.tuple([]),
		fn: () => {
			toast.success("Action completed successfully!");
		},
		description: "Shows a success notification",
	},
	showInfoToast: {
		name: "Show Info Toast",
		schema: z.tuple([]),
		fn: () => {
			toast.info("Here's some helpful information.");
		},
		description: "Shows an info notification",
	},
	logToConsole: {
		name: "Log to Console",
		schema: z.tuple([]),
		fn: () => {
			console.log("[Demo] Button clicked at", new Date().toISOString());
		},
		description: "Logs a message to the browser console",
	},
};
