import type { Asset, SerializedAsset, Folder } from "@btst/plugin-media/types";
import type {
	MediaClientConfig,
	MediaUploadClientConfig,
} from "@btst/plugin-media/client";
import { mediaClientPlugin } from "@btst/plugin-media/client";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { QueryClient } from "@tanstack/react-query";
import type { MediaPickerProps } from "@btst/plugin-media/client/components";
import type { StorageAdapter } from "@btst/plugin-media/api";
import { createMediaQueryKeys } from "@btst/plugin-media/query-keys";
export type PublicMediaContract = {
	asset: Asset;
	serialized: SerializedAsset;
	folder: Folder;
	client: MediaClientConfig;
	upload: MediaUploadClientConfig;
	picker: MediaPickerProps;
	storage: StorageAdapter;
};
export { createMediaQueryKeys };

const queryClient = new QueryClient();
const definition = mediaClientPlugin({ uploadMode: "s3" });
definition.id satisfies "media";
const stack = createClientStack({
	api: { baseURL: "https://app.example.test", basePath: "/api" },
	site: { baseURL: "https://app.example.test", basePath: "/pages" },
	queryClient,
	plugins: { media: definition },
});
StackProvider({ stack, overrides: { media: { imageCompression: false } } });
createClientStack({
	api: { baseURL: "https://app.example.test", basePath: "/api" },
	site: { baseURL: "https://app.example.test", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error Registration keys preserve the literal runtime ID.
		assets: mediaClientPlugin(),
	},
});
mediaClientPlugin({
	// @ts-expect-error Shared origins belong to the core client runtime.
	apiBaseURL: "https://app.example.test",
});
mediaClientPlugin({
	// @ts-expect-error Shared paths belong to the core client runtime.
	apiBasePath: "/api",
});
mediaClientPlugin({
	// @ts-expect-error Shared site origins belong to the core client runtime.
	siteBaseURL: "https://app.example.test",
});
mediaClientPlugin({
	// @ts-expect-error Shared site paths belong to the core client runtime.
	siteBasePath: "/pages",
});
mediaClientPlugin({
	// @ts-expect-error The QueryClient belongs to the enclosing stack.
	queryClient,
});
mediaClientPlugin({
	// @ts-expect-error Request headers belong to the shared API configuration.
	headers: new Headers(),
});
mediaClientPlugin({
	// @ts-expect-error Browser headers belong to the resolved API endpoint.
	browserHeaders: { "x-public": "value" },
});
mediaClientPlugin({
	// @ts-expect-error Credentials belong to the resolved API endpoint.
	credentials: "include",
});
mediaClientPlugin({
	hooks: {
		// @ts-expect-error Preserve the canonical error hook name.
		onLoadError: () => undefined,
	},
});
