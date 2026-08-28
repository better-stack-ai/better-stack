import aiChat = require("@btst/stack/plugins/ai-chat/api");
import blog = require("@btst/stack/plugins/blog/api");
import cms = require("@btst/stack/plugins/cms/api");
import comments = require("@btst/stack/plugins/comments/api");
import formBuilder = require("@btst/stack/plugins/form-builder/api");
import kanban = require("@btst/stack/plugins/kanban/api");
import media = require("@btst/stack/plugins/media/api");
import openApi = require("@btst/stack/plugins/open-api/api");

const aiOptions = { model: {} as never } satisfies aiChat.AiChatBackendConfig;
const blogOptions = {} satisfies blog.BlogBackendOptions;
const cmsOptions = { contentTypes: [] } satisfies cms.CMSBackendConfig;
const commentsOptions = { hooks: {} } satisfies comments.CommentsBackendOptions;
const formBuilderOptions = {} satisfies formBuilder.FormBuilderBackendConfig;
const kanbanOptions = { hooks: {} } satisfies kanban.KanbanBackendOptions;
const storageAdapter = {} as media.DirectStorageAdapter;
const mediaOptions = { storageAdapter } satisfies media.MediaBackendConfig;
const openApiOptions = {} satisfies openApi.OpenAPIOptions;

aiChat.aiChatBackendPlugin(aiOptions).id satisfies "aiChat";
blog.blogBackendPlugin(blogOptions).id satisfies "blog";
cms.cmsBackendPlugin(cmsOptions).id satisfies "cms";
comments.commentsBackendPlugin(commentsOptions).id satisfies "comments";
formBuilder.formBuilderBackendPlugin(formBuilderOptions)
	.id satisfies "formBuilder";
kanban.kanbanBackendPlugin(kanbanOptions).id satisfies "kanban";
media.mediaBackendPlugin(mediaOptions).id satisfies "media";
openApi.openApiBackendPlugin(openApiOptions).id satisfies "openApi";

blog.blogBackendPlugin();
comments.commentsBackendPlugin();
formBuilder.formBuilderBackendPlugin();
kanban.kanbanBackendPlugin();
openApi.openApiBackendPlugin();

// @ts-expect-error AI Chat requires a model.
aiChat.aiChatBackendPlugin();
// @ts-expect-error AI Chat requires a model in its options object.
aiChat.aiChatBackendPlugin({});
// @ts-expect-error CMS requires content type definitions.
cms.cmsBackendPlugin();
// @ts-expect-error CMS requires content type definitions in its options object.
cms.cmsBackendPlugin({});
// @ts-expect-error Media requires a storage adapter.
media.mediaBackendPlugin();
// @ts-expect-error Media requires a storage adapter in its options object.
media.mediaBackendPlugin({});
// @ts-expect-error Blog lifecycle hooks cannot be positional.
blog.blogBackendPlugin({ onBeforeListPosts: async () => undefined });
// @ts-expect-error Comments lifecycle hooks cannot be flat options.
comments.commentsBackendPlugin({ onBeforePost: async () => undefined });
// @ts-expect-error Kanban lifecycle hooks cannot be positional.
kanban.kanbanBackendPlugin({ onBeforeListBoards: async () => undefined });
