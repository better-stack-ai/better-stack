"use client";

import { useMemo } from "react";
import { useStackOrNull } from "@btst/stack/context";
import type { ClientStack, ClientStackContext } from "../../../types";
import { getRegisteredRoutes, type RegisteredRoute } from "./plugin";

type RegisteredRoutesSource = ClientStackContext | Pick<ClientStack, "context">;

function resolveContext(
	source: RegisteredRoutesSource | undefined,
	providerContext: ClientStackContext | undefined,
): ClientStackContext | null {
	if (!source) return providerContext ?? null;
	return Object.hasOwn(source, "context")
		? (source as Pick<ClientStack, "context">).context
		: (source as ClientStackContext);
}

/**
 * Returns registered client route paths for the enclosing provider or an
 * explicitly supplied resolved stack/context.
 */
export function useRegisteredRoutes(
	source?: RegisteredRoutesSource,
): RegisteredRoute[] {
	const provider = useStackOrNull();
	const context = resolveContext(source, provider?.clientStackContext);
	return useMemo(() => getRegisteredRoutes(context), [context]);
}
