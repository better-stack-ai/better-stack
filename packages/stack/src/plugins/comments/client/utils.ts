import { useState, useEffect } from "react";
import type { CommentsPluginOverrides } from "./overrides";

/**
 * Resolves `currentUserId` from the plugin overrides, supporting both a static
 * string and a sync/async function. Returns `undefined` until resolution completes.
 */
export function useResolvedCurrentUserId(
	raw: CommentsPluginOverrides["currentUserId"],
): string | undefined {
	const [resolved, setResolved] = useState<string | undefined>(
		typeof raw === "string" ? raw : undefined,
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
		} else {
			setResolved(raw ?? undefined);
		}
	}, [raw]);

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
