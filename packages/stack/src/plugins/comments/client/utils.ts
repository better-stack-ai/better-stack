import { useState, useEffect } from "react";
import { useIdentity } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "./overrides";

/**
 * Resolves the legacy `currentUserId` override when provided, otherwise uses
 * the identity from the top-level Stack auth provider.
 */
export function useResolvedCurrentUserId(
	raw: CommentsPluginOverrides["currentUserId"],
): string | undefined {
	const { identity } = useIdentity();
	const providerUserId = identity?.id;
	const [resolved, setResolved] = useState<string | undefined>(
		typeof raw === "string"
			? raw
			: raw === undefined
				? providerUserId
				: undefined,
	);

	useEffect(() => {
		if (typeof raw === "function") {
			void Promise.resolve(raw())
				.then((id) => setResolved(id ?? undefined))
				.catch((err: unknown) => {
					console.error(
						"[btst/comments] Failed to resolve currentUserId:",
						err,
					);
				});
		} else if (typeof raw === "string") {
			setResolved(raw);
		} else {
			setResolved(providerUserId);
		}
	}, [providerUserId, raw]);

	return resolved;
}

export function getInitials(name: string | null | undefined): string {
	if (!name) return "?";
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0])
		.join("")
		.toUpperCase();
}
