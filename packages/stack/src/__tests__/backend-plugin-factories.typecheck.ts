import type { DatabaseDefinition, DBAdapter } from "@btst/db";
import { createBackendStack } from "../api";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
} from "../plugins/api";
import {
	aiChatBackendPlugin,
	type AiChatBackendConfig,
	type AiChatBackendHooks,
} from "../plugins/ai-chat/api";
import {
	blogBackendPlugin,
	type BlogBackendHooks,
	type BlogBackendOptions,
} from "../plugins/blog/api";
import { cmsBackendPlugin, type CMSBackendConfig } from "../plugins/cms/api";
import {
	commentsBackendPlugin,
	type CommentsBackendHooks,
	type CommentsBackendOptions,
} from "../plugins/comments/api";
import {
	formBuilderBackendPlugin,
	type FormBuilderBackendConfig,
	type FormBuilderBackendHooks,
} from "../plugins/form-builder/api";
import {
	kanbanBackendPlugin,
	type KanbanBackendHooks,
	type KanbanBackendOptions,
} from "../plugins/kanban/api";
import {
	type DirectStorageAdapter,
	mediaBackendPlugin,
	type MediaBackendConfig,
	type MediaBackendHooks,
} from "../plugins/media/api";
import {
	openApiBackendPlugin,
	type OpenAPIOptions,
} from "../plugins/open-api/api";

const aiHooks = {} satisfies AiChatBackendHooks;
const blogHooks = {} satisfies BlogBackendHooks;
const commentsHooks = {} satisfies CommentsBackendHooks;
const formBuilderHooks = {} satisfies FormBuilderBackendHooks;
const kanbanHooks = {} satisfies KanbanBackendHooks;
const mediaHooks = {} satisfies MediaBackendHooks;
const storageAdapter = {} as DirectStorageAdapter;

const aiOptions = {
	model: {} as never,
	hooks: aiHooks,
} satisfies AiChatBackendConfig;
const blogOptions = { hooks: blogHooks } satisfies BlogBackendOptions;
const cmsOptions = { contentTypes: [], hooks: {} } satisfies CMSBackendConfig;
const commentsOptions = {
	allowEditing: true,
	resolveUser: async () => null,
	hooks: commentsHooks,
} satisfies CommentsBackendOptions;
const formBuilderOptions = {
	hooks: formBuilderHooks,
} satisfies FormBuilderBackendConfig;
const kanbanOptions = { hooks: kanbanHooks } satisfies KanbanBackendOptions;
const mediaOptions = {
	storageAdapter,
	resolveTenantId: async () => undefined,
	hooks: mediaHooks,
} satisfies MediaBackendConfig;
const openApiOptions = {
	title: "Example",
	version: "1.0.0",
} satisfies OpenAPIOptions;

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
// @ts-expect-error AI Chat's required model cannot be defaulted away.
aiChatBackendPlugin({});
// @ts-expect-error CMS requires content type definitions.
cmsBackendPlugin();
// @ts-expect-error CMS's required content types cannot be defaulted away.
cmsBackendPlugin({});
// @ts-expect-error Media requires a server-side storage adapter.
mediaBackendPlugin();
// @ts-expect-error Media's required storage adapter cannot be defaulted away.
mediaBackendPlugin({});

// @ts-expect-error Blog lifecycle callbacks belong under `hooks`.
blogBackendPlugin({ onBeforeListPosts: async () => undefined });
// @ts-expect-error Comments lifecycle callbacks belong under `hooks`.
commentsBackendPlugin({ onBeforeCreateComment: async () => undefined });
// @ts-expect-error Kanban lifecycle callbacks belong under `hooks`.
kanbanBackendPlugin({ onBeforeListBoards: async () => undefined });
// @ts-expect-error Form Builder lifecycle callbacks belong under `hooks`.
formBuilderBackendPlugin({ onBeforeCreateForm: async () => undefined });
// @ts-expect-error Media lifecycle callbacks belong under `hooks`.
mediaBackendPlugin({ storageAdapter, onBeforeUpload: async () => undefined });

const consumerBackendPlugin = () =>
	defineBackendPlugin({
		id: "consumerProbe",
		dbPlugin: createDbPlugin("consumer-probe", {}),
		routes: () => ({
			probe: createEndpoint("/probe", { method: "GET" }, async () => ({
				ok: true,
			})),
		}),
	});

consumerBackendPlugin().id satisfies "consumerProbe";
createBackendStack({
	basePath: "/api/data",
	plugins: { consumerProbe: consumerBackendPlugin() },
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
});
