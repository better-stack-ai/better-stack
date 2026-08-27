"use client";

import type { ComponentProps, ReactNode } from "react";
import { PermissionAccess } from "@btst/stack/context";

type PermissionCheck = Pick<
	ComponentProps<typeof PermissionAccess>,
	"permission" | "legacyPermission"
>;

/** Render children when at least one exact permission is allowed. */
export function PermissionAccessAny({
	checks,
	children,
}: {
	checks: readonly PermissionCheck[];
	children: ReactNode;
}) {
	const [check, ...rest] = checks;
	if (!check) return null;

	return (
		<PermissionAccess
			permission={check.permission}
			legacyPermission={check.legacyPermission}
			fallback={
				<PermissionAccessAny checks={rest}>{children}</PermissionAccessAny>
			}
		>
			{children}
		</PermissionAccess>
	);
}
