"use client";

import {
	createContext,
	useContext,
	useEffect,
	useRef,
	type ReactNode,
} from "react";
import { useStackOrNull } from "../../context/provider";

const RouteLifecycleOwner = createContext(false);

/** One committed page render owns lifecycle notifications, including nested route renderers. */
export function RouteLifecycle({
	path,
	children,
}: {
	path: string;
	children: ReactNode;
}) {
	const parentOwnsLifecycle = useContext(RouteLifecycleOwner);
	const context = useStackOrNull()?.clientStackContext;
	const observedPath = useRef<string | undefined>(undefined);
	useEffect(() => {
		if (parentOwnsLifecycle || !context || observedPath.current === path)
			return;
		observedPath.current = path;
		for (const plugin of Object.values(context.plugins)) {
			if (!plugin.hooks?.onRouteRender) continue;
			try {
				void Promise.resolve(plugin.hooks.onRouteRender({ path })).catch(
					() => {},
				);
			} catch {
				// Observers must not prevent a page from rendering.
			}
		}
	}, [context, path, parentOwnsLifecycle]);
	return (
		<RouteLifecycleOwner.Provider value>
			{children}
		</RouteLifecycleOwner.Provider>
	);
}
