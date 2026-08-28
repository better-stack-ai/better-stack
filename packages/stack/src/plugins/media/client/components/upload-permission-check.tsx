"use client";

import {
	PermissionCheck,
	type PermissionCheckState,
} from "@btst/stack/context";
import type { ReactNode } from "react";
import { mediaPermissions } from "../../permissions";
import type { MediaUploadMode } from "../overrides";

function UploadPhaseCheck({
	phases,
	folderId,
	children,
}: {
	phases: readonly ("initialize" | "direct" | "finalize")[];
	folderId?: string;
	children: (state: PermissionCheckState) => ReactNode;
}) {
	const [phase, ...rest] = phases;
	if (!phase) return children({ can: true, isPending: false });
	return (
		<PermissionCheck
			permission={mediaPermissions.asset.upload({
				phase,
				...(folderId ? { folderId } : {}),
			})}
			legacyPermission={{ resource: "media:asset", action: "create" }}
		>
			{(state) => {
				if (state.error || state.isPending || !state.can)
					return children(state);
				return (
					<UploadPhaseCheck phases={rest} folderId={folderId}>
						{children}
					</UploadPhaseCheck>
				);
			}}
		</PermissionCheck>
	);
}

/** Gate a browser upload flow through every server phase it will invoke. */
export function MediaUploadPermissionCheck({
	mode,
	folderId,
	children,
}: {
	mode: MediaUploadMode;
	folderId?: string;
	children: (state: PermissionCheckState) => ReactNode;
}) {
	return (
		<UploadPhaseCheck
			phases={mode === "direct" ? ["direct"] : ["initialize", "finalize"]}
			folderId={folderId}
		>
			{children}
		</UploadPhaseCheck>
	);
}

/** Gate URL registration through the exact finalization descriptor. */
export function MediaFinalizePermissionCheck({
	folderId,
	children,
}: {
	folderId?: string;
	children: (state: PermissionCheckState) => ReactNode;
}) {
	return (
		<UploadPhaseCheck phases={["finalize"]} folderId={folderId}>
			{children}
		</UploadPhaseCheck>
	);
}
