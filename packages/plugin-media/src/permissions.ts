import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const tenantFact = { tenantId: z.string().optional() };
const folderFact = {
	folderId: z.string(),
	parentId: z.string().optional(),
	...tenantFact,
};
const assetFact = {
	assetId: z.string(),
	folderId: z.string().optional(),
	mimeType: z.string(),
	...tenantFact,
};

/** Browser-safe, schema-backed permissions published by Media. */
export const mediaPermissions = definePermissions("media", {
	library: {
		/** Read the server-scoped asset/folder collection used by the library and picker. */
		read: permission(),
	},
	asset: {
		/** Receive, present, or select one asset from an authorized collection read. */
		read: permission(z.object(assetFact)),
		/**
		 * Start or finish an upload. `callback` is reserved for a provider-verified
		 * completion callback whose context was bound into the server-issued token.
		 */
		upload: permission(
			z.object({
				phase: z.enum(["initialize", "direct", "finalize", "callback"]),
				folderId: z.string().optional(),
				/** Omitted by pre-file browser gates; server operations always derive it. */
				mimeType: z.string().optional(),
				...tenantFact,
			}),
		),
		/** Update a server-resolved asset. */
		update: permission(
			z.object({
				...assetFact,
				/** `null` means moving to root; omitted means the folder is unchanged. */
				targetFolderId: z.string().nullable().optional(),
			}),
		),
		/** Delete a server-resolved asset and its storage object. */
		delete: permission(z.object(assetFact)),
	},
	folder: {
		/** Create a folder beneath a server-resolved parent. */
		create: permission(
			z.object({
				parentId: z.string().optional(),
				...tenantFact,
			}),
		),
		/** Delete a server-resolved folder after authorizing every folder in its subtree. */
		delete: permission(z.object(folderFact)),
	},
});
