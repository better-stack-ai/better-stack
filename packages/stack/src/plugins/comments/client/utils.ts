import { useState, useEffect } from "react";
import type { CommentsPluginOverrides } from "./overrides";
import { toError as toErrorShared } from "../error-utils";

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

/**
 * Normalise any thrown value into an Error.
 *
 * Handles three shapes:
 * 1. Already an Error — returned as-is.
 * 2. A plain object — message is taken from `.message`, then `.error` (API
 *    error-response shape), then JSON.stringify. All original properties are
 *    copied onto the Error via Object.assign so callers can inspect them.
 * 3. Anything else — converted via String().
 */
export const toError = toErrorShared;

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
