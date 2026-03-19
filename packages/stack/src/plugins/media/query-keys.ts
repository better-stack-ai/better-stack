import {
	mergeQueryKeys,
	createQueryKeys,
} from "@lukemorales/query-key-factory";
import { createApiClient } from "@btst/stack/plugins/client";
import type { MediaApiRouter } from "./api/plugin";
import type { SerializedAsset, SerializedFolder } from "./types";
import { assetListDiscriminator } from "./api/query-key-defs";
import type { AssetListParams } from "./api/getters";

function isErrorResponse(response: unknown): response is { error: unknown } {
	return (
		typeof response === "object" &&
		response !== null &&
		"error" in response &&
		(response as Record<string, unknown>).error !== null &&
		(response as Record<string, unknown>).error !== undefined
	);
}

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "object" && error !== null) {
		const errorObj = error as Record<string, unknown>;
		const message =
			(typeof errorObj.message === "string" ? errorObj.message : null) ||
			JSON.stringify(error);
		const err = new Error(message);
		Object.assign(err, error);
		return err;
	}
	return new Error(String(error));
}

export function createMediaQueryKeys(
	client: ReturnType<typeof createApiClient<MediaApiRouter>>,
	headers?: HeadersInit,
) {
	return mergeQueryKeys(
		createQueryKeys("mediaAssets", {
			list: (params?: AssetListParams) => ({
				queryKey: [assetListDiscriminator(params)],
				queryFn: async ({ pageParam }: { pageParam?: number }) => {
					const response = await (client as any)("/media/assets", {
						method: "GET",
						query: {
							folderId: params?.folderId,
							mimeType: params?.mimeType,
							query: params?.query,
							offset: pageParam ?? params?.offset ?? 0,
							limit: params?.limit ?? 20,
						},
						headers,
					});
					if (isErrorResponse(response)) throw toError(response.error);
					const data = (response as any).data as {
						items: SerializedAsset[];
						total: number;
						limit?: number;
						offset?: number;
					};
					return data;
				},
			}),
			detail: (id: string) => ({
				queryKey: [id],
				queryFn: async () => {
					const response = await (client as any)("/media/assets", {
						method: "GET",
						query: { id },
						headers,
					});
					if (isErrorResponse(response)) throw toError(response.error);
					return (response as any).data as SerializedAsset | null;
				},
			}),
		}),
		createQueryKeys("mediaFolders", {
			list: (parentId?: string | null) => ({
				queryKey: [parentId ?? "root"],
				queryFn: async () => {
					const response = await (client as any)("/media/folders", {
						method: "GET",
						query:
							parentId !== undefined ? { parentId: parentId ?? undefined } : {},
						headers,
					});
					if (isErrorResponse(response)) throw toError(response.error);
					return (response as any).data as SerializedFolder[];
				},
			}),
		}),
	);
}

export type MediaQueryKeys = ReturnType<typeof createMediaQueryKeys>;
