"use client";
import { createContext, useContext, useMemo } from "react";
import { toast } from "sonner";
import type {
	NotifyOptions,
	StackNotifyProvider,
} from "../shared/notify-types";

const NotifyContext = createContext<Required<StackNotifyProvider> | null>(null);

/** Sonner-backed defaults used when no custom `notify` prop is configured. */
export const defaultNotifyProvider: Required<StackNotifyProvider> = {
	success: (message: string, options?: NotifyOptions) => {
		toast.success(message, options);
	},
	error: (message: string, options?: NotifyOptions) => {
		toast.error(message, options);
	},
	info: (message: string, options?: NotifyOptions) => {
		toast.info(message, options);
	},
	warning: (message: string, options?: NotifyOptions) => {
		toast.warning(message, options);
	},
};

function mergeNotifyProvider(
	custom: StackNotifyProvider | undefined,
): Required<StackNotifyProvider> {
	return {
		success: custom?.success ?? defaultNotifyProvider.success,
		error: custom?.error ?? defaultNotifyProvider.error,
		info: custom?.info ?? defaultNotifyProvider.info,
		warning: custom?.warning ?? defaultNotifyProvider.warning,
	};
}

export function StackNotifyBoundary({
	notify,
	children,
}: {
	notify?: StackNotifyProvider;
	children?: React.ReactNode;
}) {
	const value = useMemo(() => mergeNotifyProvider(notify), [notify]);

	return (
		<NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>
	);
}

/**
 * Returns notification methods routed through the `notify` provider on
 * `StackProvider`, falling back to sonner toasts when no override is set.
 *
 * @example
 * ```tsx
 * const notify = useNotify();
 * notify.success("Post saved");
 * notify.error("Failed to delete", { description: "Try again later" });
 * ```
 */
export function useNotify(): Required<StackNotifyProvider> {
	const notify = useContext(NotifyContext);
	return notify ?? defaultNotifyProvider;
}
