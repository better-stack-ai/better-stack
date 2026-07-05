"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { StackAuthProvider } from "../shared/auth-types";
import { StackAuthBoundary } from "./auth";
import type {
	StackApiConfig,
	StackRouter,
	StackRouterConfig,
	WithOptionalRouterOverrides,
} from "./router";

/**
 * Context value that provides plugin-specific overrides
 * Generic over the shape of all plugin overrides
 */
interface StackContextValue<TPluginOverrides extends Record<string, any>> {
	/**
	 * The overrides for the plugin.
	 */
	overrides: TPluginOverrides;
	/**
	 * The base path where the client router is mounted.
	 */
	basePath: string;
	/**
	 * Resolved top-level router (static preset fields merged with the
	 * preset's `useRouter` hook result).
	 */
	router?: StackRouter;
	/**
	 * Top-level API config applied to all plugins.
	 */
	api?: StackApiConfig;
}

const StackContext = createContext<StackContextValue<any> | null>(null);

/**
 * The `overrides` prop shape for `StackProvider`: per plugin, the fields
 * managed by the top-level `router` / `api` props become optional, and
 * plugin blocks whose remaining fields are all optional can be omitted
 * entirely.
 */
export type StackProviderOverrides<
	TPluginOverrides extends Record<string, any>,
> = {
	[K in keyof TPluginOverrides]?: WithOptionalRouterOverrides<
		TPluginOverrides[K]
	>;
};

/** Removes keys whose value is `undefined` so they don't clobber lower layers in spreads. */
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
	const result: Record<string, any> = {};
	for (const key of Object.keys(obj)) {
		if (obj[key] !== undefined) {
			result[key] = obj[key];
		}
	}
	return result as Partial<T>;
}

function resolveStaticRouter(
	router: StackRouterConfig | undefined,
): StackRouter | undefined {
	if (!router) return undefined;
	const { useRouter: _useRouter, ...staticFields } = router;
	return stripUndefined(staticFields);
}

/**
 * Internal component that evaluates the router preset's `useRouter` hook.
 * Rendered only when the hook exists, so the hook itself is always called
 * unconditionally within this component.
 */
function RouterBridge({
	useRouter,
	staticRouter,
	value,
	children,
}: {
	useRouter: () => StackRouter;
	staticRouter: StackRouter | undefined;
	value: Omit<StackContextValue<any>, "router">;
	children?: ReactNode;
}) {
	const hookRouter = useRouter();
	const router: StackRouter = {
		...staticRouter,
		...stripUndefined(hookRouter),
	};

	return (
		<StackContext.Provider value={{ ...value, router }}>
			{children}
		</StackContext.Provider>
	);
}

/**
 * Provider component for BTST context
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
 * <StackProvider<MyPluginOverrides>
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
 * </StackProvider>
 * ```
 *
 * With a framework router preset, the shared `Link`/`navigate`/`refresh`/
 * `Image` wiring and API config move to the top level and per-plugin
 * overrides only carry genuinely plugin-specific values:
 *
 * @example
 * ```tsx
 * import { nextRouter } from "@btst/stack/next";
 *
 * <StackProvider<MyPluginOverrides>
 *   basePath="/pages"
 *   router={nextRouter()}
 *   api={{ baseURL, basePath: "/api/data" }}
 *   overrides={{
 *     blog: { uploadImage },
 *   }}
 * >
 *   {children}
 * </StackProvider>
 * ```
 */
export function StackProvider<
	TPluginOverrides extends Record<string, any> = Record<string, any>,
>({
	children,
	overrides,
	basePath,
	router,
	api,
	auth,
}: {
	children?: ReactNode;
	overrides?: StackProviderOverrides<TPluginOverrides>;
	basePath: string;
	router?: StackRouterConfig;
	api?: StackApiConfig;
	/**
	 * Optional auth provider. When set, `useIdentity()` / `useCan()` and
	 * `<CanAccess>` resolve identity and permissions through it. When omitted,
	 * behavior is identical to before: identity is `null` and all permission
	 * checks pass.
	 */
	auth?: StackAuthProvider;
}) {
	const staticRouter = resolveStaticRouter(router);
	const value: Omit<StackContextValue<any>, "router"> = {
		overrides: overrides ?? {},
		basePath,
		api,
	};

	const content = auth ? (
		<StackAuthBoundary provider={auth}>{children}</StackAuthBoundary>
	) : (
		children
	);

	if (router?.useRouter) {
		return (
			<RouterBridge
				useRouter={router.useRouter}
				staticRouter={staticRouter}
				value={value}
			>
				{content}
			</RouterBridge>
		);
	}

	return (
		<StackContext.Provider value={{ ...value, router: staticRouter }}>
			{content}
		</StackContext.Provider>
	);
}

/**
 * Hook to access the entire BTST context
 * Useful if you need access to multiple plugins or the full context
 *
 * @returns The full context value including overrides and basePath
 * @throws Error if used outside of StackProvider
 *
 * @example
 * ```tsx
 * const { overrides, basePath } = useStack<MyPluginOverrides>();
 * ```
 */
export function useStack<
	TPluginOverrides extends Record<string, any> = Record<string, any>,
>() {
	const context = useContext(
		StackContext,
	) as StackContextValue<TPluginOverrides> | null;

	if (!context) {
		throw new Error(
			"useStack must be used within StackProvider. " +
				"Wrap your app with <StackProvider> in your layout file.",
		);
	}

	return context;
}

/**
 * Like `useStack`, but returns `null` instead of throwing when rendered
 * outside a `StackProvider`.
 *
 * @internal Used by core components (e.g. route gating) that must not change
 * behavior for consumers rendering outside the provider.
 */
export function useStackOrNull<
	TPluginOverrides extends Record<string, any> = Record<string, any>,
>() {
	return useContext(StackContext) as StackContextValue<TPluginOverrides> | null;
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
	const context = useStack();

	const pluginOverrides = context.overrides[pluginName];

	// Resolution order (lowest to highest precedence):
	// hook defaults -> top-level router/api -> per-plugin overrides
	const { router, api } = context;
	if (!router && !api) {
		// No top-level router/api configured — behave exactly as before
		const overrides = defaultValues
			? { ...defaultValues, ...pluginOverrides }
			: pluginOverrides;
		return overrides as OverridesResult<TOverrides, TDefaults>;
	}

	const routerApiLayer = stripUndefined({
		Link: router?.Link,
		Image: router?.Image,
		navigate: router?.navigate,
		refresh: router?.refresh,
		getSearchParams: router?.getSearchParams,
		setSearchParams: router?.setSearchParams,
		apiBaseURL: api?.baseURL,
		apiBasePath: api?.basePath,
	});

	const overrides = {
		...defaultValues,
		...routerApiLayer,
		...pluginOverrides,
	};

	return overrides as OverridesResult<TOverrides, TDefaults>;
}

/**
 * Hook to access the base path where the client router is mounted
 *
 * @returns The base path string (e.g., "/pages")
 * @throws Error if used outside of StackProvider
 *
 * @example
 * ```tsx
 * const basePath = useBasePath();
 * // basePath = "/pages"
 * ```
 */
export function useBasePath() {
	const context = useStack();
	if (!context) {
		throw new Error(
			"useBasePath must be used within StackProvider. " +
				"Wrap your app with <StackProvider> in your layout file.",
		);
	}
	return context.basePath;
}
