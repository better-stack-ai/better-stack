import {
	defineClientPlugin,
	createApiClient,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import { ChatInterface } from "./components/chat-interface";
import type { AiChatApiRouter } from "../api";

export interface AiChatClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
}

function createChatMeta() {
	return () => {
		return [
			{ title: "Chat" },
			{ name: "title", content: "Chat" },
			{ name: "description", content: "Start a conversation with AI" },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: "Chat" },
			{ property: "og:description", content: "Start a conversation with AI" },
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: "Chat" },
			{ name: "twitter:description", content: "Start a conversation with AI" },
		];
	};
}

export const aiChatClientPlugin = (config: AiChatClientConfig) =>
	defineClientPlugin({
		name: "ai-chat",
		routes: () => ({
			chat: createRoute("/chat", () => ({
				PageComponent: () => (
					<ChatInterface
						apiPath={`${config.apiBaseURL}${config.apiBasePath}/chat`}
					/>
				),
				meta: createChatMeta(),
			})),
			chatConversation: createRoute("/chat/:id", ({ params }) => ({
				loader: async () => {
					const client = createApiClient<AiChatApiRouter>({
						baseURL: config.apiBaseURL,
						basePath: config.apiBasePath,
					});
					try {
						const res = await client("/conversations/:id", {
							method: "GET",
							params: { id: params.id },
						});
						return { conversation: res };
					} catch (e) {
						console.error(e);
						return { conversation: null };
					}
				},
				PageComponent: ({ loaderData }: any) => {
					const initialMessages = loaderData.conversation?.messages?.map(
						(m: any) => ({
							id: m.id,
							role: m.role,
							parts: [
								{
									type: "text",
									text: m.content || "",
								},
							],
						}),
					);
					return (
						<ChatInterface
							apiPath={`${config.apiBaseURL}${config.apiBasePath}/chat`}
							id={params.id}
							initialMessages={initialMessages}
						/>
					);
				},
			})),
		}),
	});
