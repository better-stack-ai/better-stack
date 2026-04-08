"use client";

import { useEffect, useState } from "react";
import { getRegisteredRoutes, type RegisteredRoute } from "./plugin";

/**
 * React hook that returns all registered client route paths.
 * Updates whenever the component mounts (after client hydration).
 */
export function useRegisteredRoutes(): RegisteredRoute[] {
	const [routes, setRoutes] = useState<RegisteredRoute[]>(() =>
		getRegisteredRoutes(),
	);

	useEffect(() => {
		setRoutes(getRegisteredRoutes());
	}, []);

	return routes;
}
