/**
 * Options passed to notification methods.
 */
export interface NotifyOptions {
	/** Optional longer description shown below the message */
	description?: string;
}

/**
 * Pluggable notification provider, passed to `StackProvider` via the `notify` prop.
 *
 * When omitted, sonner toasts are used as the default implementation.
 *
 * @example
 * ```tsx
 * const notify: StackNotifyProvider = {
 *   success: (msg) => myToast.success(msg),
 *   error: (msg) => myToast.error(msg),
 * };
 *
 * <StackProvider notify={notify} ...>
 * ```
 */
export interface StackNotifyProvider {
	success?: (message: string, options?: NotifyOptions) => void;
	error?: (message: string, options?: NotifyOptions) => void;
	info?: (message: string, options?: NotifyOptions) => void;
	warning?: (message: string, options?: NotifyOptions) => void;
}
