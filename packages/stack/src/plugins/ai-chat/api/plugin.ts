import type { DBAdapter as Adapter } from "@btst/db";
import { isServerAuth } from "../../../authorization/server";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { LanguageModel, Tool } from "ai";
import { aiChatSchema as dbSchema } from "../db";
import {
	chatRequestSchema,
	createConversationSchema,
	updateConversationSchema,
} from "../schemas";
import { getAllConversations, getConversationById } from "./getters";
import {
	type AiChatAccess,
	type AiChatBackendHooks,
	type ChatApiContext,
	ConversationOperationInputSchema,
	createAiChatOperations,
	UpdateConversationOperationInputSchema,
} from "./operations";

export type {
	AiChatAccess,
	AiChatBackendHooks,
	ChatApiContext,
} from "./operations";
export {
	AI_CHAT_OPERATION_INVENTORY,
	AI_CHAT_RAW_ESCAPE_HATCH_INVENTORY,
	AiChatOperationError,
	ChatOperationInputSchema,
	ConversationOperationInputSchema,
	UpdateConversationOperationInputSchema,
} from "./operations";

/**
 * @deprecated Use `access: "authorized" | "public"`. This alias remains for
 * the v3 release-candidate migration only.
 */
export type AiChatMode = "authenticated" | "public";

type KnownKeys<T> = {
	[K in keyof T]: string extends K ? never : K;
}[keyof T];

type NoKeyCollision<
	TTools,
	TClientTools extends Record<string, Tool>,
> = KnownKeys<TTools> & keyof TClientTools extends never
	? TClientTools
	: {
			[K in keyof TClientTools]: K extends KnownKeys<TTools>
				? never
				: TClientTools[K];
		};

/** AI Chat server configuration. */
export interface AiChatBackendConfig {
	model: LanguageModel;
	/**
	 * Explicit server access policy. Authorized mode persists identity-scoped
	 * history and denies missing rules. Public mode exposes only stateless chat.
	 * @default "authorized"
	 */
	access?: AiChatAccess;
	/** @deprecated Use `access`; `authenticated` maps to `authorized`. */
	mode?: AiChatMode;
	/** Temporary v3 RC identity bridge. `createServerAuth()` identity wins. */
	getUserId?: (
		context: Pick<ChatApiContext, "request" | "headers" | "body" | "params">,
	) => string | null | undefined | Promise<string | null | undefined>;
	systemPrompt?: string;
	tools?: Record<string, Tool>;
	enablePageTools?: boolean;
	clientToolSchemas?: Record<string, Tool>;
	hooks?: AiChatBackendHooks;
}

function resolveAccess(config: Pick<AiChatBackendConfig, "access" | "mode">) {
	const legacyAccess = config.mode
		? config.mode === "public"
			? "public"
			: "authorized"
		: undefined;
	if (config.access && legacyAccess && config.access !== legacyAccess) {
		throw new TypeError(
			"AI Chat `access` and deprecated `mode` must describe the same access policy.",
		);
	}
	return config.access ?? legacyAccess ?? "authorized";
}

/** AI Chat backend plugin backed by one typed operation catalog. */
export const aiChatBackendPlugin = <
	TTools extends Record<string, Tool> = Record<never, Tool>,
	TClientTools extends Record<string, Tool> = Record<never, Tool>,
>(
	config: Omit<AiChatBackendConfig, "tools" | "clientToolSchemas"> & {
		tools?: TTools;
		clientToolSchemas?: NoKeyCollision<TTools, TClientTools>;
	},
) => {
	const access = resolveAccess(config);
	const operationsConfig = {
		...config,
		access,
		tools: config.tools as Record<string, Tool> | undefined,
		clientToolSchemas: config.clientToolSchemas as
			| Record<string, Tool>
			| undefined,
	};

	return defineBackendPlugin({
		name: "ai-chat",
		dbPlugin: dbSchema,
		operationRouteMap: { chat: "startStream" },
		operations: (adapter: Adapter, context) =>
			createAiChatOperations(adapter, {
				...operationsConfig,
				requestAuthorizationConfigured: Boolean(
					context?.auth &&
						(isServerAuth(context.auth) ||
							typeof context.auth.can === "function"),
				),
			}),

		/** Trusted raw data access. It intentionally bypasses operations and hooks. */
		api: (adapter: Adapter) => ({
			getAllConversations: (userId?: string) =>
				getAllConversations(adapter, userId),
			getConversationById: (id: string) => getConversationById(adapter, id),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const chat = createEndpoint(
				"/chat",
				{ method: "POST", body: chatRequestSchema, requireRequest: true },
				operations.startStream.route((ctx) => ctx.body),
			);
			const listConversations = createEndpoint(
				"/chat/conversations",
				{ method: "GET", requireRequest: true },
				operations.listConversations.route(() => ({})),
			);
			const getConversation = createEndpoint(
				"/chat/conversations/:id",
				{
					method: "GET",
					params: ConversationOperationInputSchema,
					requireRequest: true,
				},
				operations.getConversation.route((ctx) => ctx.params),
			);
			const createConversation = createEndpoint(
				"/chat/conversations",
				{
					method: "POST",
					body: createConversationSchema,
					requireRequest: true,
				},
				operations.createConversation.route((ctx) => ctx.body),
			);
			const updateConversation = createEndpoint(
				"/chat/conversations/:id",
				{
					method: "PUT",
					body: updateConversationSchema,
					requireRequest: true,
				},
				operations.updateConversation.route((ctx) =>
					UpdateConversationOperationInputSchema.parse({
						id: ctx.params.id,
						data: ctx.body,
					}),
				),
			);
			const deleteConversation = createEndpoint(
				"/chat/conversations/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteConversation.route((ctx) => ({ id: ctx.params.id })),
			);

			return {
				chat,
				listConversations,
				getConversation,
				createConversation,
				updateConversation,
				deleteConversation,
			} as const;
		},
	});
};

export type AiChatApiRouter = ReturnType<
	ReturnType<typeof aiChatBackendPlugin>["routes"]
>;
