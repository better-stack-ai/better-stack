import { useIdentity } from "@btst/stack/context";

/** Resolves the current user from the top-level Stack auth provider. */
export function useCurrentUserId(): {
	currentUserId: string | undefined;
	isPending: boolean;
} {
	const { identity, isPending } = useIdentity();
	return {
		currentUserId: identity?.id,
		isPending,
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
