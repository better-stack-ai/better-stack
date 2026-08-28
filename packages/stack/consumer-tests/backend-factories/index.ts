import {
	aiChatBackendPlugin,
	type AiChatBackendConfig,
} from "@btst/stack/plugins/ai-chat/api";
import {
	blogBackendPlugin,
	type BlogBackendOptions,
} from "@btst/stack/plugins/blog/api";
import {
	cmsBackendPlugin,
	type CMSBackendConfig,
} from "@btst/stack/plugins/cms/api";
import {
	commentsBackendPlugin,
	type CommentsBackendOptions,
} from "@btst/stack/plugins/comments/api";
import {
	formBuilderBackendPlugin,
	type FormBuilderBackendConfig,
} from "@btst/stack/plugins/form-builder/api";
import {
	kanbanBackendPlugin,
	type KanbanBackendOptions,
} from "@btst/stack/plugins/kanban/api";
import {
	type DirectStorageAdapter,
	mediaBackendPlugin,
	type MediaBackendConfig,
} from "@btst/stack/plugins/media/api";
import {
	openApiBackendPlugin,
	type OpenAPIOptions,
} from "@btst/stack/plugins/open-api/api";

const aiOptions = { model: {} as never } satisfies AiChatBackendConfig;
const blogOptions = {} satisfies BlogBackendOptions;
const cmsOptions = { contentTypes: [] } satisfies CMSBackendConfig;
const commentsOptions = { hooks: {} } satisfies CommentsBackendOptions;
const formBuilderOptions = {} satisfies FormBuilderBackendConfig;
const kanbanOptions = { hooks: {} } satisfies KanbanBackendOptions;
const storageAdapter = {} as DirectStorageAdapter;
const mediaOptions = { storageAdapter } satisfies MediaBackendConfig;
const openApiOptions = {} satisfies OpenAPIOptions;

aiChatBackendPlugin(aiOptions).id satisfies "aiChat";
blogBackendPlugin(blogOptions).id satisfies "blog";
cmsBackendPlugin(cmsOptions).id satisfies "cms";
commentsBackendPlugin(commentsOptions).id satisfies "comments";
formBuilderBackendPlugin(formBuilderOptions).id satisfies "formBuilder";
kanbanBackendPlugin(kanbanOptions).id satisfies "kanban";
mediaBackendPlugin(mediaOptions).id satisfies "media";
openApiBackendPlugin(openApiOptions).id satisfies "openApi";

blogBackendPlugin();
commentsBackendPlugin();
formBuilderBackendPlugin();
kanbanBackendPlugin();
openApiBackendPlugin();

// @ts-expect-error AI Chat requires a model.
aiChatBackendPlugin();
// @ts-expect-error AI Chat requires a model in its options object.
aiChatBackendPlugin({});
// @ts-expect-error CMS requires content type definitions.
cmsBackendPlugin();
// @ts-expect-error CMS requires content type definitions in its options object.
cmsBackendPlugin({});
// @ts-expect-error Media requires a storage adapter.
mediaBackendPlugin();
// @ts-expect-error Media requires a storage adapter in its options object.
mediaBackendPlugin({});
// @ts-expect-error Blog lifecycle hooks cannot be positional.
blogBackendPlugin({ onBeforeListPosts: async () => undefined });
// @ts-expect-error Comments lifecycle hooks cannot be flat options.
commentsBackendPlugin({ onBeforePost: async () => undefined });
// @ts-expect-error Kanban lifecycle hooks cannot be positional.
kanbanBackendPlugin({ onBeforeListBoards: async () => undefined });
