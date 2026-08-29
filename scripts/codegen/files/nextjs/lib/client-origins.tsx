"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ResolvedStackClientOrigins } from "./stack-client";

const ClientOriginsContext = createContext<ResolvedStackClientOrigins | null>(
	null,
);

export function ClientOriginsProvider({
	children,
	origins,
}: {
	children: ReactNode;
	origins: ResolvedStackClientOrigins;
}) {
	return (
		<ClientOriginsContext.Provider value={origins}>
			{children}
		</ClientOriginsContext.Provider>
	);
}

export function useClientOrigins() {
	const origins = useContext(ClientOriginsContext);
	if (!origins) {
		throw new Error("Client origins must be hydrated by a server layout.");
	}
	return origins;
}
