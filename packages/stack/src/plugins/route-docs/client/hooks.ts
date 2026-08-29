"use client";

import { useMemo } from "react";
import type { ClientStackContext } from "../../../types";
import { getRegisteredRoutes, type RegisteredRoute } from "./plugin";

/**
 * Returns registered client route paths for the supplied resolved stack context.
 */
export function useRegisteredRoutes(
	context: ClientStackContext,
): RegisteredRoute[] {
	return useMemo(() => getRegisteredRoutes(context), [context]);
}
