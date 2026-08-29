"use client";
import {
	createContext,
	useContext,
	type ReactElement,
	type ReactNode,
} from "react";
import type { QueryClient } from "@tanstack/react-query";
import type {
	ClientLocation,
	ClientStackContext,
	ClientProviderPluginRuntime,
	InferredPluginOverrides,
	RegisteredClientPlugins,
	ResolvedClientStack,
} from "../types";
import type { StackClientAuth, StackIdentity } from "../shared/auth-types";
import type { StackI18nProvider } from "../shared/i18n-types";
import type { StackNotifyProvider } from "../shared/notify-types";
import { StackAuthBoundary } from "./auth";
import { StackI18nBoundary } from "./i18n";
import { StackNotifyBoundary } from "./notify";
import type { StackApiConfig, StackRouter, StackRouterConfig } from "./router";

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
	/** Resolved top-level site location used to compare plugin site origins. */
	site?: ClientLocation;
	/** Effective browser-safe runtime for each registered client plugin. */
	plugins?: Record<string, ClientProviderPluginRuntime>;
	/** The query client owned by the resolved client stack. */
	queryClient?: QueryClient;
	/** Resolved plugin definitions used by client-only introspection helpers. */
	clientStackContext?: ClientStackContext;
	/** Top-level auth provider used by identity-aware components. */
	auth?: StackClientAuth;
}

const StackContext = createContext<StackContextValue<any> | null>(null);

/**
 * The `overrides` prop shape for `StackProvider`.
 * Plugin blocks are optional; fields inside each block retain the plugin's
 * declared requirements.
 */
export type StackProviderOverrides<
	TPluginOverrides extends Record<string, any>,
> = Partial<TPluginOverrides>;

type StackProviderServices = {
	children?: ReactNode;
	router?: StackRouterConfig;
	/**
	 * Browser authorization created by `createClientAuth()`. When omitted,
	 * identity is `null` and presentation-only descriptor checks remain
	 * permissive; backend authorization is independent and authoritative.
	 */
	auth?: StackClientAuth;
	/**
	 * Request identity resolved on the server. `undefined` means no snapshot was
	 * supplied; `null` is an explicitly hydrated anonymous identity.
	 */
	initialIdentity?: StackIdentity | null;
	notify?: StackNotifyProvider;
	i18n?: StackI18nProvider;
};

type CanonicalStackProviderOverrideProps<
	TStack extends ResolvedClientStack<any, any>,
> = InferredPluginOverrides<
	NoInfer<RegisteredClientPlugins<TStack>>
> extends infer TOverrides extends Record<string, any>
	? {} extends TOverrides
		? { overrides?: TOverrides }
		: { overrides: TOverrides }
	: never;

type CanonicalStackProviderProps<TStack extends ResolvedClientStack<any, any>> =
	StackProviderServices & {
		/** Resolved browser client stack; supplies API/site/plugin runtime once. */
		stack: TStack;
		/** Runtime paths come from `stack`. */
		basePath?: never;
		/** Runtime API configuration comes from `stack`. */
		api?: never;
	} & CanonicalStackProviderOverrideProps<TStack>;

type CanonicalStackProviderImplementationProps = StackProviderServices & {
	stack: ResolvedClientStack<any, any>;
	overrides?: Record<string, any>;
	basePath?: never;
	api?: never;
};

type LegacyStackProviderProps<TPluginOverrides extends Record<string, any>> =
	StackProviderServices & {
		/** @deprecated Pass the resolved `stack` instead. Removed by #225. */
		stack?: never;
		overrides?: StackProviderOverrides<TPluginOverrides>;
		basePath: string;
		api?: StackApiConfig;
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
 * @example
 * ```tsx
 * const clientStack = createClientStack({
 *   api,
 *   site,
 *   queryClient,
 *   plugins: {
 *     messages: messagesClientPlugin(),
 *   },
 * });
 *
 * <StackProvider
 *   stack={clientStack}
 *   router={frameworkRouter}
 *   overrides={{
 *     messages: {
 *       MarkdownRenderer: (props) => <ReactMarkdown {...props} />,
 *     }
 *   }}
 * >
 *   {children}
 * </StackProvider>
 * ```
 *
 * Runtime locations and plugin override types come from the resolved stack.
 * Framework services and optional identity hydration remain provider concerns.
 *
 * @example
 * ```tsx
 * import { nextRouter } from "@btst/stack/next";
 *
 * <StackProvider
 *   stack={clientStack}
 *   router={nextRouter()}
 *   auth={clientAuth}
 *   initialIdentity={initialIdentity}
 * >
 *   {children}
 * </StackProvider>
 * ```
 */
export function StackProvider<
	TPluginOverrides extends Record<string, any> = Record<string, any>,
>(props: LegacyStackProviderProps<TPluginOverrides>): ReactElement;
export function StackProvider<
	const TStack extends ResolvedClientStack<any, any>,
>(props: CanonicalStackProviderProps<TStack>): ReactElement;
export function StackProvider({
	children,
	overrides,
	basePath,
	stack,
	router,
	api,
	auth,
	initialIdentity,
	notify,
	i18n,
}:
	| LegacyStackProviderProps<Record<string, any>>
	| CanonicalStackProviderImplementationProps): ReactElement {
	const projection = stack?.provider;
	const resolvedBasePath = projection?.site.basePath ?? basePath;
	if (resolvedBasePath === undefined) {
		throw new Error(
			"StackProvider requires a resolved client stack or a legacy basePath.",
		);
	}
	const staticRouter = resolveStaticRouter(router);
	const value: Omit<StackContextValue<any>, "router"> = {
		overrides: overrides ?? {},
		basePath: resolvedBasePath,
		api: projection?.api ?? api,
		site: projection?.site,
		plugins: projection?.plugins,
		queryClient: projection?.queryClient,
		clientStackContext: stack?.context,
		auth,
	};

	const content = auth ? (
		<StackAuthBoundary provider={auth} initialIdentity={initialIdentity}>
			{children}
		</StackAuthBoundary>
	) : (
		children
	);

	const stackTree = router?.useRouter ? (
		<RouterBridge
			useRouter={router.useRouter}
			staticRouter={staticRouter}
			value={value}
		>
			{content}
		</RouterBridge>
	) : (
		<StackContext.Provider value={{ ...value, router: staticRouter }}>
			{content}
		</StackContext.Provider>
	);

	return (
		<StackNotifyBoundary notify={notify}>
			<StackI18nBoundary i18n={i18n}>{stackTree}</StackI18nBoundary>
		</StackNotifyBoundary>
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
 * function MessagesList() {
 *   const { MarkdownRenderer } = usePluginOverrides<MessagesPluginOverrides>("messages");
 *   return <MarkdownRenderer>{message.body}</MarkdownRenderer>;
 * }
 *
 * // With defaults - optional fields with defaults become required
 * function MessagesList() {
 *   const { localization } = usePluginOverrides<MessagesPluginOverrides, Partial<MessagesPluginOverrides>>("messages", {
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
	const { overrides: allOverrides } = useStack();
	const pluginOverrides = allOverrides[pluginName];
	const overrides = defaultValues
		? { ...defaultValues, ...pluginOverrides }
		: (pluginOverrides ?? {});

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
