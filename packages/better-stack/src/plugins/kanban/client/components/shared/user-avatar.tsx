"use client";

import { memo } from "react";
import { User } from "lucide-react";
import {
	Avatar,
	AvatarImage,
	AvatarFallback,
} from "@workspace/ui/components/avatar";
import type { KanbanUser } from "../../overrides";

interface UserAvatarProps {
	user: KanbanUser | null;
	size?: "sm" | "default" | "lg";
	className?: string;
}

/**
 * Get initials from a user's name
 */
function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) {
		return parts[0]?.charAt(0).toUpperCase() || "";
	}
	return (
		(parts[0]?.charAt(0) || "") + (parts[parts.length - 1]?.charAt(0) || "")
	).toUpperCase();
}

/**
 * UserAvatar component displays a user's avatar or initials fallback
 * Uses the shadcn Avatar component with Radix primitives
 */
function UserAvatarComponent({
	user,
	size = "sm",
	className,
}: UserAvatarProps) {
	// No user - show placeholder icon
	if (!user) {
		return (
			<Avatar size={size} className={className} title="Unassigned">
				<AvatarFallback>
					<User className="size-3 group-data-[size=default]/avatar:size-4 group-data-[size=lg]/avatar:size-5" />
				</AvatarFallback>
			</Avatar>
		);
	}

	const initials = getInitials(user.name);

	return (
		<Avatar size={size} className={className} title={user.name}>
			{user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
			<AvatarFallback className="bg-primary/10 text-primary font-medium">
				{initials}
			</AvatarFallback>
		</Avatar>
	);
}

export const UserAvatar = memo(UserAvatarComponent);
