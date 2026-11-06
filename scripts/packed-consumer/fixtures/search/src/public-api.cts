import {
	searchBackendPlugin,
	type SearchApiRouter,
} from "@btst/plugin-search/api";
import { searchClientPlugin } from "@btst/plugin-search/client";
import {
	SearchDialog,
	SearchInput,
} from "@btst/plugin-search/client/components";
import { useSearch } from "@btst/plugin-search/client/hooks";
import { createSearchQueryKeys } from "@btst/plugin-search/query-keys";
import { searchPermissions } from "@btst/plugin-search/permissions";
import {
	blogSearchProvider,
	cmsSearchProvider,
	ecommerceSearchProvider,
	schoolSearchProvider,
} from "@btst/plugin-search/providers";
import type {
	SearchProvider,
	SearchResponse,
	SearchResult,
} from "@btst/plugin-search/types";

const provider: SearchProvider = {
	id: "application",
	label: "Application",
	search: async () => ({ items: [], hasMore: false }),
};
const backend = searchBackendPlugin({ providers: [provider] });
const backendId: "search" = backend.id;
const clientId: "search" = searchClientPlugin().id;
export {
	backendId,
	clientId,
	SearchDialog,
	SearchInput,
	useSearch,
	createSearchQueryKeys,
	searchPermissions,
	blogSearchProvider,
	cmsSearchProvider,
	ecommerceSearchProvider,
	schoolSearchProvider,
};
export type { SearchApiRouter, SearchProvider, SearchResponse, SearchResult };
