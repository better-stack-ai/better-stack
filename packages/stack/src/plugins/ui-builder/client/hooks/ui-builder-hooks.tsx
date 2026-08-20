"use client";

import type {
	ResourceFormConfig,
	ResourceFormResult,
} from "@btst/stack/plugins/client/hooks";
import type {
	ComponentLayer,
	Variable,
} from "@workspace/ui/components/ui-builder/types";
import type {
	CreateUIBuilderPageInput,
	UpdateUIBuilderPageInput,
} from "../../query-keys";
import type {
	PaginatedUIBuilderPages,
	SerializedUIBuilderPage,
} from "../../types";
import { uiBuilder } from "./ui-builder-resource";

export type {
	CreateUIBuilderPageInput,
	UpdateUIBuilderPageInput,
} from "../../query-keys";

function flattenPages(pages: PaginatedUIBuilderPages[] | undefined): {
	pages: SerializedUIBuilderPage[];
	total: number;
} {
	return {
		pages:
			pages?.flatMap((page) =>
				Array.isArray(page?.items) ? page.items : [],
			) ?? [],
		total: pages?.[0]?.total ?? 0,
	};
}

function parseLayers(layersJson: string): ComponentLayer[] {
	try {
		return JSON.parse(layersJson) as ComponentLayer[];
	} catch {
		return [];
	}
}

function parseVariables(variablesJson: string): Variable[] {
	try {
		return JSON.parse(variablesJson) as Variable[];
	} catch {
		return [];
	}
}

export interface UseUIBuilderPagesOptions {
	/** Number of items per page (default: 10). */
	limit?: number;
	/** Whether to enable the query (default: true). */
	enabled?: boolean;
}

export interface UseUIBuilderPagesResult {
	pages: SerializedUIBuilderPage[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	loadMore: () => void;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => void;
}

export function useUIBuilderPages(
	options: UseUIBuilderPagesOptions = {},
): UseUIBuilderPagesResult {
	const { limit = 10, enabled = true } = options;
	const {
		data,
		isLoading,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = uiBuilder.cmsContent.list.useInfinite([{ limit }], { enabled });
	const flattened = flattenPages(data?.pages);

	return {
		...flattened,
		isLoading,
		error,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

export function useSuspenseUIBuilderPages(
	options: UseUIBuilderPagesOptions = {},
): {
	pages: SerializedUIBuilderPage[];
	total: number;
	loadMore: () => Promise<unknown>;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => Promise<unknown>;
} {
	const { limit = 10 } = options;
	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
		uiBuilder.cmsContent.list.useSuspenseInfinite([{ limit }]);
	const flattened = flattenPages(data.pages);

	return {
		...flattened,
		loadMore: fetchNextPage,
		hasMore: !!hasNextPage,
		isLoadingMore: isFetchingNextPage,
		refetch,
	};
}

export function useUIBuilderPage(id: string): {
	page: SerializedUIBuilderPage | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { data, isLoading, error, refetch } = uiBuilder.cmsContent.detail.use(
		[id],
		{ enabled: !!id },
	);
	return { page: data ?? null, isLoading, error, refetch };
}

export function useSuspenseUIBuilderPage(id: string): {
	page: SerializedUIBuilderPage | null;
	refetch: () => Promise<unknown>;
} {
	const { data, refetch } = uiBuilder.cmsContent.detail.useSuspense([id]);
	return { page: data ?? null, refetch };
}

export function useUIBuilderPageBySlug(slug: string): {
	page: SerializedUIBuilderPage | null;
	layers: ComponentLayer[];
	variables: Variable[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
} {
	const { data, isLoading, error, refetch } = uiBuilder.cmsContent.bySlug.use(
		[slug],
		{ enabled: !!slug },
	);
	const page = data ?? null;
	return {
		page,
		layers: page ? parseLayers(page.parsedData.layers) : [],
		variables: page ? parseVariables(page.parsedData.variables) : [],
		isLoading,
		error,
		refetch,
	};
}

export function useSuspenseUIBuilderPageBySlug(slug: string): {
	page: SerializedUIBuilderPage | null;
	layers: ComponentLayer[];
	variables: Variable[];
	refetch: () => Promise<unknown>;
} {
	const { data, refetch } = uiBuilder.cmsContent.bySlug.useSuspense([slug]);
	const page = data ?? null;
	return {
		page,
		layers: page ? parseLayers(page.parsedData.layers) : [],
		variables: page ? parseVariables(page.parsedData.variables) : [],
		refetch,
	};
}

export function useCreateUIBuilderPage() {
	return uiBuilder.cmsContent.create.use();
}

export function useUpdateUIBuilderPage() {
	return uiBuilder.cmsContent.update.use();
}

export function useDeleteUIBuilderPage() {
	return uiBuilder.cmsContent.delete.use();
}

/**
 * Create/edit lifecycle for the UI Builder page editor: selects the mutation,
 * awaits invalidation, notifies, redirects, and exposes server field errors.
 */
export function useUIBuilderPageForm<TValues>(
	config: ResourceFormConfig<
		TValues,
		SerializedUIBuilderPage | null,
		SerializedUIBuilderPage
	>,
): ResourceFormResult<
	TValues,
	SerializedUIBuilderPage | null,
	SerializedUIBuilderPage
> {
	return uiBuilder.cmsContent.useForm<
		TValues,
		SerializedUIBuilderPage,
		SerializedUIBuilderPage | null
	>(config);
}

export type UIBuilderPageFormValues = CreateUIBuilderPageInput;
export type UIBuilderPageUpdateValues = UpdateUIBuilderPageInput;
