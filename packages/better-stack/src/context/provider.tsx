"use client";
import { createContext, useContext, type ReactNode } from "react";

/**
 * Context value that provides plugin-specific overrides
 * Generic over the shape of all plugin overrides
 */
interface BetterStackContextValue<
	TPluginOverrides extends Record<string, any>,
> {
	/**
	 * The overrides for the plugin.
	 */
	overrides: TPluginOverrides;
	/**
	 * The base path where the client router is mounted.
	 */
	basePath: string;
}

const BetterStackContext = createContext<BetterStackContextValue<any> | null>(
	null,
);

/**
 * Provider component for BetterStack context
 * Provides type-safe access to plugin-specific overrides
 *
 * Only requires override values, not plugin objects - keeps bundle size minimal!
 *
 * @example
 * ```tsx
 * // Define the type shape (no import of plugin values needed!)
 * type MyPluginOverrides = {
 *   todos: TodosPluginOverrides;
 *   messages: MessagesPluginOverrides;
 * };
 *
 * <BetterStackProvider<MyPluginOverrides>
 *   overrides={{
 *     todos: {
 *       Link: (props) => <NextLink {...props} />,
 *       navigate: (path) => router.push(path),
 *     },
 *     messages: {
 *       MarkdownRenderer: (props) => <ReactMarkdown {...props} />,
 *     }
 *   }}
 * >
 *   {children}
 * </BetterStackProvider>
 * ```
 */
export function BetterStackProvider<
	TPluginOverrides extends Record<string, any> = Record<string, any>,
>({
	children,
	overrides,
	basePath,
}: {
	children?: ReactNode;
	overrides: TPluginOverrides;
	basePath: string;
}) {
	const value: BetterStackContextValue<TPluginOverrides> = {
		overrides,
		basePath,
	};

	return (
		<BetterStackContext.Provider value={value}>
			{children}
		</BetterStackContext.Provider>
	);
}

/**
 * Hook to access the entire BetterStack context
 * Useful if you need access to multiple plugins or the full context
 *
 * @returns The full context value including overrides and basePath
 * @throws Error if used outside of BetterStackProvider
 *
 * @example
 * ```tsx
 * const { overrides, basePath } = useBetterStack<MyPluginOverrides>();
 * ```
 */
export function useBetterStack<
	TPluginOverrides extends Record<string, any> = Record<string, any>,
>() {
	const context = useContext(
		BetterStackContext,
	) as BetterStackContextValue<TPluginOverrides> | null;

	if (!context) {
		throw new Error(
			"useBetterStack must be used within BetterStackProvider. " +
				"Wrap your app with <BetterStackProvider> in your layout file.",
		);
	}

	return context;
}

// Helper type: merge TOverrides with TDefaults, making defaulted properties required
type OverridesResult<TOverrides, TDefaults> = undefined extends TDefaults
	? TOverrides
	: TOverrides & Required<Pick<TDefaults & {}, keyof TDefaults>>;

/**
 * Hook to access overrides for a specific plugin
 * This is type-safe and will only expose the overrides defined by that plugin
 *
 * When default values are provided, properties with defaults are guaranteed to be non-null.
 *
 * @example
 * ```tsx
 * // Without defaults - trusts plugin is configured
 * function TodosList() {
 *   const { navigate } = usePluginOverrides<TodosPluginOverrides>("todos");
 *   // navigate is (path: string) => void (required fields are non-nullable)
 *   navigate("/todos/add");
 * }
 *
 * // With defaults - optional fields with defaults become required
 * function TodosList() {
 *   const { localization } = usePluginOverrides<TodosPluginOverrides, Partial<TodosPluginOverrides>>("todos", {
 *     localization: DEFAULT_LOCALIZATION
 *   });
 *   // localization is Localization (guaranteed to exist because we provided a default)
 *   console.log(localization.SOME_KEY);
 * }
 * ```
 */
export function usePluginOverrides<
	TOverrides = any,
	TDefaults extends Partial<TOverrides> | undefined = undefined,
>(
	pluginName: string,
	defaultValues?: TDefaults,
): OverridesResult<TOverrides, TDefaults> {
	const context = useBetterStack();

	const pluginOverrides = context.overrides[pluginName];

	// If defaults are provided, merge them with plugin overrides
	// This ensures default properties exist even if plugin is partially configured
	const overrides = defaultValues
		? { ...defaultValues, ...pluginOverrides }
		: pluginOverrides;

	return overrides as OverridesResult<TOverrides, TDefaults>;
}

/**
 * Hook to access the base path where the client router is mounted
 *
 * @returns The base path string (e.g., "/pages")
 * @throws Error if used outside of BetterStackProvider
 *
 * @example
 * ```tsx
 * const basePath = useBasePath();
 * // basePath = "/pages"
 * ```
 */
export function useBasePath() {
	const context = useBetterStack();
	if (!context) {
		throw new Error(
			"useBasePath must be used within BetterStackProvider. " +
				"Wrap your app with <BetterStackProvider> in your layout file.",
		);
	}
	return context.basePath;
}
