import { useState, useEffect } from "react";
import { useIdentity } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "./overrides";

/**
 * Resolves the legacy `currentUserId` override when provided, otherwise uses
 * the identity from the top-level Stack auth provider.
 */
export function useResolvedCurrentUserId(
	raw: CommentsPluginOverrides["currentUserId"],
): { currentUserId: string | undefined; isPending: boolean } {
	const { identity, isPending: isProviderPending } = useIdentity();
	const [legacyResult, setLegacyResult] = useState<{
		currentUserId: string | undefined;
		isPending: boolean;
	}>({ currentUserId: undefined, isPending: typeof raw === "function" });

	useEffect(() => {
		if (typeof raw !== "function") return;

		let cancelled = false;
		setLegacyResult({ currentUserId: undefined, isPending: true });
		void Promise.resolve(raw())
			.then((id) => {
				if (!cancelled) {
					setLegacyResult({
						currentUserId: id ?? undefined,
						isPending: false,
					});
				}
			})
			.catch((err: unknown) => {
				console.error("[btst/comments] Failed to resolve currentUserId:", err);
				if (!cancelled) {
					setLegacyResult({ currentUserId: undefined, isPending: false });
				}
			});

		return () => {
			cancelled = true;
		};
	}, [raw]);

	if (typeof raw === "string") {
		return { currentUserId: raw, isPending: false };
	}
	if (typeof raw === "function") return legacyResult;
	return {
		currentUserId: identity?.id,
		isPending: isProviderPending,
	};
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
