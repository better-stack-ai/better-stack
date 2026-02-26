"use client";

import {
	createContext,
	useCallback,
	useContext,
	useId,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

/**
 * A client-side tool handler — receives the AI's tool call args and returns a result.
 * The result is sent back to the model so it can continue the conversation.
 */
export type PageAIClientTool = (
	args: any,
) => Promise<{ success: boolean; message?: string }>;

/**
 * Configuration registered by a page to provide AI context and capabilities.
 * Any component in the tree can call useRegisterPageAIContext with this config.
 */
export interface PageAIContextConfig {
	/**
	 * Identifier for the current route/page (e.g. "blog-post", "ui-builder-edit-page").
	 * Shown as a badge in the chat header.
	 */
	routeName: string;

	/**
	 * Human-readable description of the current page and its content.
	 * Injected into the AI system prompt so it understands what the user is looking at.
	 * Capped at 8,000 characters server-side.
	 */
	pageDescription: string;

	/**
	 * Optional suggested prompts shown as quick-action chips in the chat empty state.
	 * These augment (not replace) any static suggestions configured in plugin overrides.
	 */
	suggestions?: string[];

	/**
	 * Client-side tool handlers keyed by tool name.
	 * When the AI calls a tool by this name, the handler is invoked with the tool args.
	 * The result is sent back to the model via addToolResult.
	 *
	 * Tool schemas must be registered server-side via enablePageTools + clientToolSchemas
	 * in aiChatBackendPlugin (built-in tools like fillBlogForm are pre-registered).
	 */
	clientTools?: Record<string, PageAIClientTool>;
}

interface PageAIAPIContextValue {
	register: (id: string, config: PageAIContextConfig) => void;
	unregister: (id: string) => void;
	getActive: () => PageAIContextConfig | null;
}

/**
 * Stable API context — holds register/unregister/getActive.
 * Never changes reference, so useRegisterPageAIContext effects don't re-run
 * simply because the provider re-rendered after a bumpVersion call.
 */
const PageAIAPIContext = createContext<PageAIAPIContextValue | null>(null);

/**
 * Reactive version context — incremented on every register/unregister.
 * Consumers of usePageAIContext subscribe here so they re-render when
 * registrations change and re-call getActive() to pick up the latest config.
 */
const PageAIVersionContext = createContext<number>(0);

/**
 * Provider that enables route-aware AI context across the app.
 *
 * Place this at the root layout — above all StackProviders — so it spans
 * both your main app tree and any chat modals rendered as parallel/intercept routes.
 *
 * @example
 * // app/layout.tsx
 * import { PageAIContextProvider } from "@btst/stack/plugins/ai-chat/client/context"
 *
 * export default function RootLayout({ children }) {
 *   return <PageAIContextProvider>{children}</PageAIContextProvider>
 * }
 */
export function PageAIContextProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	// Map from stable registration id → config
	// Using useRef so mutations don't trigger re-renders of the provider itself
	const registrationsRef = useRef<Map<string, PageAIContextConfig>>(new Map());
	// Track insertion order so the last-registered (most specific) wins
	const insertionOrderRef = useRef<string[]>([]);

	// Version counter — bumped on every register/unregister so consumers re-read
	const [version, setVersion] = useState(0);
	const bumpVersion = useCallback(() => setVersion((v) => v + 1), []);

	const register = useCallback(
		(id: string, config: PageAIContextConfig) => {
			registrationsRef.current.set(id, config);
			// Move to end to mark as most recent
			insertionOrderRef.current = insertionOrderRef.current.filter(
				(k) => k !== id,
			);
			insertionOrderRef.current.push(id);
			bumpVersion();
		},
		[bumpVersion],
	);

	const unregister = useCallback(
		(id: string) => {
			registrationsRef.current.delete(id);
			insertionOrderRef.current = insertionOrderRef.current.filter(
				(k) => k !== id,
			);
			bumpVersion();
		},
		[bumpVersion],
	);

	const getActive = useCallback((): PageAIContextConfig | null => {
		const order = insertionOrderRef.current;
		if (order.length === 0) return null;
		// Last registered wins (most deeply nested / most recently mounted)
		const lastId = order[order.length - 1];
		if (!lastId) return null;
		return registrationsRef.current.get(lastId) ?? null;
	}, []);

	// Memoize the API object so its reference never changes — this is what
	// breaks the infinite loop: useRegisterPageAIContext has `ctx` (the API)
	// in its effect deps, and a stable reference means the effect won't re-run
	// just because the provider re-rendered after bumpVersion().
	const api = useMemo(
		() => ({ register, unregister, getActive }),
		[register, unregister, getActive],
	);

	return (
		<PageAIAPIContext.Provider value={api}>
			<PageAIVersionContext.Provider value={version}>
				{children}
			</PageAIVersionContext.Provider>
		</PageAIAPIContext.Provider>
	);
}

/**
 * Register page AI context from any component.
 * The registration is cleaned up automatically when the component unmounts.
 *
 * Pass `null` to conditionally disable context (e.g. while data is loading).
 *
 * @example
 * // Blog post page
 * useRegisterPageAIContext(post ? {
 *   routeName: "blog-post",
 *   pageDescription: `Blog post: "${post.title}"\n\n${post.content?.slice(0, 16000)}`,
 *   suggestions: ["Summarize this post", "What are the key takeaways?"],
 * } : null)
 */
export function useRegisterPageAIContext(
	config: PageAIContextConfig | null,
): void {
	// Use the stable API context — its reference never changes, so adding it
	// to the dependency array below does NOT cause the effect to re-run after
	// bumpVersion() fires. This breaks the register → bumpVersion → re-render
	// → effect re-run → register loop that caused "Maximum update depth exceeded".
	const ctx = useContext(PageAIAPIContext);
	const id = useId();

	useEffect(() => {
		if (!ctx || !config) return;
		ctx.register(id, config);
		return () => {
			ctx.unregister(id);
		};
		// Stringify to deep-compare config without referential instability
		// (inline objects and functions are recreated on every render).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ctx, id, JSON.stringify(config)]);
}

/**
 * Read the currently active page AI context.
 * Returns null when no page has registered context, or when PageAIContextProvider
 * is not in the tree.
 *
 * Used internally by ChatInterface to inject context into requests.
 */
export function usePageAIContext(): PageAIContextConfig | null {
	// Subscribe to the version counter so this hook re-runs whenever a page
	// registers or unregisters context, then read the latest active config.
	useContext(PageAIVersionContext);
	const ctx = useContext(PageAIAPIContext);
	if (!ctx) return null;
	return ctx.getActive();
}
