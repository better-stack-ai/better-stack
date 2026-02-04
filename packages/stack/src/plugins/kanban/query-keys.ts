import {
	mergeQueryKeys,
	createQueryKeys,
} from "@lukemorales/query-key-factory";
import type { KanbanApiRouter } from "./api";
import { createApiClient } from "@btst/stack/plugins/client";
import type { SerializedBoardWithColumns } from "./types";

interface BoardsListParams {
	slug?: string;
	ownerId?: string;
	organizationId?: string;
	limit?: number;
	offset?: number;
}

// Type guard for better-call error responses
function isErrorResponse(
	response: unknown,
): response is { error: unknown; data?: never } {
	return (
		typeof response === "object" &&
		response !== null &&
		"error" in response &&
		response.error !== null &&
		response.error !== undefined
	);
}

// Helper to convert error to a proper Error object with meaningful message
function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "object" && error !== null) {
		const errorObj = error as Record<string, unknown>;
		const message =
			(typeof errorObj.message === "string" ? errorObj.message : null) ||
			(typeof errorObj.error === "string" ? errorObj.error : null) ||
			JSON.stringify(error);

		const err = new Error(message);
		Object.assign(err, error);
		return err;
	}

	return new Error(String(error));
}

export function createKanbanQueryKeys(
	client: ReturnType<typeof createApiClient<KanbanApiRouter>>,
	headers?: HeadersInit,
) {
	const boards = createBoardsQueries(client, headers);

	return mergeQueryKeys(boards);
}

function createBoardsQueries(
	client: ReturnType<typeof createApiClient<KanbanApiRouter>>,
	headers?: HeadersInit,
) {
	return createQueryKeys("boards", {
		list: (params?: BoardsListParams) => ({
			queryKey: [
				{
					slug: params?.slug,
					ownerId: params?.ownerId,
					organizationId: params?.organizationId,
					limit: params?.limit ?? 50,
					offset: params?.offset ?? 0,
				},
			],
			queryFn: async () => {
				try {
					const response = await client("/boards", {
						method: "GET",
						query: {
							slug: params?.slug,
							ownerId: params?.ownerId,
							organizationId: params?.organizationId,
							limit: params?.limit ?? 50,
							offset: params?.offset ?? 0,
						},
						headers,
					});

					if (isErrorResponse(response)) {
						const errorResponse = response as { error: unknown };
						throw toError(errorResponse.error);
					}

					return ((response as { data?: unknown }).data ??
						[]) as unknown as SerializedBoardWithColumns[];
				} catch (error) {
					throw error;
				}
			},
		}),

		detail: (boardId: string) => ({
			queryKey: [boardId],
			queryFn: async () => {
				if (!boardId) return null;

				try {
					const response = await client("/boards/:id", {
						method: "GET",
						params: { id: boardId },
						headers,
					});

					if (isErrorResponse(response)) {
						const errorResponse = response as { error: unknown };
						throw toError(errorResponse.error);
					}

					return ((response as { data?: unknown }).data ??
						null) as unknown as SerializedBoardWithColumns | null;
				} catch (error) {
					throw error;
				}
			},
		}),

		// Get board by slug
		bySlug: (slug: string) => ({
			queryKey: ["slug", slug],
			queryFn: async () => {
				if (!slug) return null;

				try {
					const response = await client("/boards", {
						method: "GET",
						query: { slug, limit: 1 },
						headers,
					});

					if (isErrorResponse(response)) {
						const errorResponse = response as { error: unknown };
						throw toError(errorResponse.error);
					}

					const boards = ((response as { data?: unknown }).data ??
						[]) as unknown as SerializedBoardWithColumns[];
					return boards[0] ?? null;
				} catch (error) {
					throw error;
				}
			},
		}),
	});
}
