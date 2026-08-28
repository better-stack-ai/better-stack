import { AsyncLocalStorage } from "node:async_hooks";
import type { DBAdapter as Adapter } from "@btst/db";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import {
	defineOperation,
	definePassthroughOperation,
	type DeepReadonly,
	type Operation,
	type OperationContext,
} from "@btst/stack/plugins/api";
import {
	convertToModelMessages,
	stepCountIs,
	streamText,
	type LanguageModel,
	type Tool,
	type UIMessage,
} from "ai";
import { z } from "zod";
import { aiChatPermissions } from "../permissions";
import {
	chatRequestSchema,
	createConversationSchema,
	updateConversationSchema,
} from "../schemas";
import type {
	Conversation,
	Message,
	SerializedConversation,
	SerializedMessage,
} from "../types";
import { getAllConversations, getConversationById } from "./getters";
import {
	BUILT_IN_PAGE_TOOL_ROUTE_ALLOWLIST,
	BUILT_IN_PAGE_TOOL_SCHEMAS,
} from "./page-tools";
import { serializeConversation, serializeMessage } from "./serializers";

type TransactionAdapter = Parameters<Parameters<Adapter["transaction"]>[0]>[0];
type ActiveAdapter = Omit<Adapter, "transaction"> &
	Partial<Pick<Adapter, "transaction">>;
type MemoryHistoryLockContext = {
	owner: object;
	adapter: ActiveAdapter;
	inTransaction?: boolean;
	rollbackError?: unknown;
	rollbackOnly?: boolean;
};

export type AiChatAccess = "authorized" | "public";

/** Runtime input for one conversation operation. */
export const ConversationOperationInputSchema = z.object({ id: z.string() });
/** Runtime input for one conversation rename operation. */
export const UpdateConversationOperationInputSchema = z.object({
	id: z.string(),
	data: updateConversationSchema,
});
/** Runtime input accepted only from trusted internal stream callers. */
export const ChatOperationInputSchema = chatRequestSchema.extend({
	trustedUserId: z.string().optional(),
}) as unknown as z.ZodType<ChatOperationInput>;
/** JSON-safe AI SDK message shape accepted at the operation boundary. */
export type ChatOperationInput = {
	readonly messages: readonly (
		| {
				readonly role: "system" | "user" | "assistant" | "data";
				readonly content: string;
				readonly id?: string;
		  }
		| {
				readonly role: "system" | "user" | "assistant" | "data";
				readonly parts: readonly ({
					readonly type: string;
					readonly text?: string;
				} & Record<string, any>)[];
				readonly id?: string;
				readonly metadata?: any;
		  }
	)[];
	readonly conversationId?: string;
	readonly model?: string;
	readonly pageContext?: string;
	readonly availableTools?: readonly string[];
	readonly routeName?: string;
	readonly trustedUserId?: string;
};
const EmptyInputSchema = z.object({});

type ConversationReadFacts = PermissionFactsFor<
	typeof aiChatPermissions.conversation.read
>;
type ConversationRecordFacts = PermissionFactsFor<
	typeof aiChatPermissions.conversation.update
>;
type StreamStartFacts = PermissionFactsFor<
	typeof aiChatPermissions.stream.start
>;

/** One conversation and its serialized message history. */
export type AiChatConversationResult = SerializedConversation & {
	readonly messages: readonly SerializedMessage[];
};

/** Complete AI Chat operation inventory shared by every server transport. */
export type AiChatOperations = {
	readonly startStream: Operation<
		typeof ChatOperationInputSchema,
		typeof aiChatPermissions.stream.start,
		Response,
		true
	>;
	readonly listConversations: Operation<
		typeof EmptyInputSchema,
		typeof aiChatPermissions.conversation.read,
		readonly SerializedConversation[]
	>;
	readonly getConversation: Operation<
		typeof ConversationOperationInputSchema,
		typeof aiChatPermissions.conversation.read,
		AiChatConversationResult
	>;
	readonly createConversation: Operation<
		typeof createConversationSchema,
		typeof aiChatPermissions.conversation.create,
		SerializedConversation
	>;
	readonly updateConversation: Operation<
		typeof UpdateConversationOperationInputSchema,
		typeof aiChatPermissions.conversation.update,
		SerializedConversation
	>;
	readonly deleteConversation: Operation<
		typeof ConversationOperationInputSchema,
		typeof aiChatPermissions.conversation.delete,
		{ readonly success: true }
	>;
};

/** Executable inventory used by tests, docs, and future transport audits. */
export const AI_CHAT_OPERATION_INVENTORY = Object.freeze({
	startStream: Object.freeze({
		http: "POST /chat",
		request: "forRequest(request).api.aiChat.startStream",
		internal: "internal.aiChat.startStream",
		ui: Object.freeze([
			"composer",
			"edit",
			"retry",
			"attachment",
			"tool-result",
		]),
		semantics: Object.freeze([
			"stream.start",
			"conversation.create",
			"message.send",
			"message.edit",
			"message.retry",
			"attachment.send",
			"tool.activate",
		]),
		publicSemantics: Object.freeze([
			"stream.start",
			"message.send",
			"message.edit",
			"message.retry",
			"attachment.send",
			"tool.activate",
		]),
		publicWhenConfigured: true,
	}),
	listConversations: Object.freeze({
		http: "GET /chat/conversations",
		request: "forRequest(request).api.aiChat.listConversations",
		internal: "internal.aiChat.listConversations",
		ui: Object.freeze(["conversation sidebar"]),
		semantics: Object.freeze(["conversation.read"]),
		publicWhenConfigured: false,
	}),
	getConversation: Object.freeze({
		http: "GET /chat/conversations/:id",
		request: "forRequest(request).api.aiChat.getConversation",
		internal: "internal.aiChat.getConversation",
		ui: Object.freeze(["conversation route"]),
		semantics: Object.freeze(["conversation.read"]),
		publicWhenConfigured: false,
	}),
	createConversation: Object.freeze({
		http: "POST /chat/conversations",
		request: "forRequest(request).api.aiChat.createConversation",
		internal: "internal.aiChat.createConversation",
		ui: Object.freeze(["new chat"]),
		semantics: Object.freeze(["conversation.create"]),
		publicWhenConfigured: false,
	}),
	updateConversation: Object.freeze({
		http: "PUT /chat/conversations/:id",
		request: "forRequest(request).api.aiChat.updateConversation",
		internal: "internal.aiChat.updateConversation",
		ui: Object.freeze(["rename conversation"]),
		semantics: Object.freeze(["conversation.update"]),
		publicWhenConfigured: false,
	}),
	deleteConversation: Object.freeze({
		http: "DELETE /chat/conversations/:id",
		request: "forRequest(request).api.aiChat.deleteConversation",
		internal: "internal.aiChat.deleteConversation",
		ui: Object.freeze(["delete conversation"]),
		semantics: Object.freeze(["conversation.delete"]),
		publicWhenConfigured: false,
	}),
});

/** Trusted raw getters bypassing authorization and operation lifecycle hooks. */
export const AI_CHAT_RAW_ESCAPE_HATCH_INVENTORY = Object.freeze([
	"api.aiChat.getAllConversations",
	"api.aiChat.getConversationById",
]);

/** A domain/HTTP failure raised after AI Chat authorization succeeds. */
export class AiChatOperationError extends Error {
	readonly statusCode: number;
	readonly code: string;

	constructor(statusCode: number, message: string, code: string) {
		super(message);
		this.name = "AiChatOperationError";
		this.statusCode = statusCode;
		this.code = code;
	}
}

async function runBeforeHook<T>(
	hook: () => T | Promise<T>,
	defaultMessage: string,
): Promise<Awaited<T>> {
	try {
		return await hook();
	} catch (cause) {
		if (cause instanceof AiChatOperationError) throw cause;
		throw new AiChatOperationError(
			403,
			cause instanceof Error ? cause.message : defaultMessage,
			"HOOK_DENIED",
		);
	}
}

/** Typed operation context supplied to AI Chat lifecycle hooks. */
export interface ChatApiContext<TInput = unknown, TFacts = unknown>
	extends OperationContext<TInput, TFacts> {
	readonly headers?: Headers;
	readonly body?: DeepReadonly<TInput>;
	readonly params?: Readonly<Record<string, string>>;
	readonly query?: DeepReadonly<TInput>;
}

/** Post-authorization AI Chat domain lifecycle hooks. */
export interface AiChatBackendHooks {
	onBeforeChat?: (
		messages: readonly { readonly role: string; readonly content: string }[],
		context: ChatApiContext<
			z.output<typeof ChatOperationInputSchema>,
			StreamStartFacts
		>,
	) => Promise<void> | void;
	onBeforeListConversations?: (
		context: ChatApiContext<
			z.output<typeof EmptyInputSchema>,
			ConversationReadFacts
		>,
	) => Promise<void> | void;
	onBeforeGetConversation?: (
		conversationId: string,
		context: ChatApiContext<
			z.output<typeof ConversationOperationInputSchema>,
			ConversationReadFacts
		>,
	) => Promise<void> | void;
	onBeforeCreateConversation?: (
		data: DeepReadonly<z.output<typeof createConversationSchema>>,
		context: ChatApiContext<
			z.output<typeof createConversationSchema>,
			undefined
		>,
	) => Promise<void> | void;
	onBeforeUpdateConversation?: (
		conversationId: string,
		data: DeepReadonly<z.output<typeof updateConversationSchema>>,
		context: ChatApiContext<
			z.output<typeof UpdateConversationOperationInputSchema>,
			ConversationRecordFacts
		>,
	) => Promise<void> | void;
	onBeforeDeleteConversation?: (
		conversationId: string,
		context: ChatApiContext<
			z.output<typeof ConversationOperationInputSchema>,
			ConversationRecordFacts
		>,
	) => Promise<void> | void;
	/**
	 * Post-authorization tool safety/filter hook. Structural route validation and
	 * exact `tool.activate` authorization have already succeeded.
	 */
	onBeforeToolsActivated?: (
		toolNames: readonly string[],
		routeName: string | undefined,
		context: ChatApiContext<
			z.output<typeof ChatOperationInputSchema>,
			StreamStartFacts
		>,
	) => Promise<readonly string[]> | readonly string[];
	onAfterChat?: (
		conversationId: string,
		messages: readonly SerializedMessage[],
		context: ChatApiContext<
			z.output<typeof ChatOperationInputSchema>,
			StreamStartFacts
		>,
	) => Promise<void> | void;
	onConversationsRead?: (
		conversations: readonly SerializedConversation[],
		context: ChatApiContext<
			z.output<typeof EmptyInputSchema>,
			ConversationReadFacts
		>,
	) => Promise<void> | void;
	onConversationRead?: (
		conversation: DeepReadonly<AiChatConversationResult>,
		context: ChatApiContext<
			z.output<typeof ConversationOperationInputSchema>,
			ConversationReadFacts
		>,
	) => Promise<void> | void;
	onConversationCreated?: (
		conversation: DeepReadonly<SerializedConversation>,
		context: ChatApiContext<
			z.output<typeof createConversationSchema>,
			undefined
		>,
	) => Promise<void> | void;
	onConversationUpdated?: (
		conversation: DeepReadonly<SerializedConversation>,
		context: ChatApiContext<
			z.output<typeof UpdateConversationOperationInputSchema>,
			ConversationRecordFacts
		>,
	) => Promise<void> | void;
	onConversationDeleted?: (
		conversationId: string,
		context: ChatApiContext<
			z.output<typeof ConversationOperationInputSchema>,
			ConversationRecordFacts
		>,
	) => Promise<void> | void;
	onChatError?: (
		error: Error,
		context: ChatApiContext<
			z.output<typeof ChatOperationInputSchema>,
			StreamStartFacts
		>,
	) => Promise<void> | void;
	onListConversationsError?: (
		error: Error,
		context: ChatApiContext<
			z.output<typeof EmptyInputSchema>,
			ConversationReadFacts
		>,
	) => Promise<void> | void;
	onGetConversationError?: (
		error: Error,
		context: ChatApiContext<
			z.output<typeof ConversationOperationInputSchema>,
			ConversationReadFacts
		>,
	) => Promise<void> | void;
	onCreateConversationError?: (
		error: Error,
		context: ChatApiContext<
			z.output<typeof createConversationSchema>,
			undefined
		>,
	) => Promise<void> | void;
	onUpdateConversationError?: (
		error: Error,
		context: ChatApiContext<
			z.output<typeof UpdateConversationOperationInputSchema>,
			ConversationRecordFacts
		>,
	) => Promise<void> | void;
	onDeleteConversationError?: (
		error: Error,
		context: ChatApiContext<
			z.output<typeof ConversationOperationInputSchema>,
			ConversationRecordFacts
		>,
	) => Promise<void> | void;
}

export interface AiChatOperationsConfig {
	access: AiChatAccess;
	requestAuthorizationConfigured?: boolean;
	model: LanguageModel;
	systemPrompt?: string;
	tools?: Record<string, Tool>;
	enablePageTools?: boolean;
	clientToolSchemas?: Record<string, Tool>;
	getUserId?: (
		context: Pick<ChatApiContext, "request" | "headers" | "body" | "params">,
	) => string | null | undefined | Promise<string | null | undefined>;
	hooks?: AiChatBackendHooks;
}

interface ConversationSnapshot {
	readonly id: string;
	readonly userId?: string;
	readonly title: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly messages: readonly MessageSnapshot[];
}

interface MessageSnapshot {
	readonly id: string;
	readonly conversationId: string;
	readonly role: Message["role"];
	readonly content: string;
	readonly createdAt: number;
}

interface StreamPreparation {
	readonly snapshot: ConversationSnapshot | null;
	readonly intent: StreamStartFacts["intent"];
	readonly messageId?: string;
	readonly mediaTypes: readonly string[];
	readonly authorizationToolNames: readonly string[];
	readonly toolNames: readonly string[];
}

function normalizeError(error: unknown, fallback: string): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === "string" ? error : fallback, {
		cause: error,
	});
}

function requestFields(request: Request | undefined) {
	return request ? { request, headers: request.headers } : {};
}

function hookContext<TInput, TFacts>(
	context: OperationContext<TInput, TFacts>,
	fields: {
		body?: DeepReadonly<TInput>;
		params?: Readonly<Record<string, string>>;
		query?: DeepReadonly<TInput>;
	} = {},
): ChatApiContext<TInput, TFacts> {
	return Object.freeze({
		...context,
		...requestFields(context.request),
		...fields,
	});
}

async function notifyError<TInput, TFacts>(
	hook:
		| ((
				error: Error,
				context: ChatApiContext<TInput, TFacts>,
		  ) => Promise<void> | void)
		| undefined,
	error: unknown,
	context: OperationContext<TInput, TFacts>,
	fields?: {
		body?: DeepReadonly<TInput>;
		params?: Readonly<Record<string, string>>;
		query?: DeepReadonly<TInput>;
	},
) {
	await hook?.(
		normalizeError(error, "AI Chat operation failed"),
		hookContext(context, fields),
	);
}

function publicConversation(
	conversation: Conversation,
): SerializedConversation {
	// `userId` is the minimum rendered owner hint needed by browser permission
	// gates. The server always reloads the authoritative owner before enforcement.
	return serializeConversation(conversation);
}

function conversationResult(
	conversation: Conversation & { messages: Message[] },
): AiChatConversationResult {
	return {
		...publicConversation(conversation),
		messages: conversation.messages.map(serializeMessage),
	};
}

function snapshotConversation(
	conversation: Conversation & { messages?: Message[] },
): ConversationSnapshot {
	return {
		id: conversation.id,
		...(conversation.userId ? { userId: conversation.userId } : {}),
		title: conversation.title,
		createdAt: conversation.createdAt.getTime(),
		updatedAt: conversation.updatedAt.getTime(),
		messages: (conversation.messages ?? []).map((message) => ({
			id: message.id,
			conversationId: message.conversationId,
			role: message.role,
			content: message.content,
			createdAt: message.createdAt.getTime(),
		})),
	};
}

function sameSnapshot(
	conversation: (Conversation & { messages: Message[] }) | null,
	expected: ConversationSnapshot | null,
) {
	if (!conversation || !expected)
		return conversation === null && expected === null;
	return (
		JSON.stringify(snapshotConversation(conversation)) ===
		JSON.stringify(expected)
	);
}

function recordFacts(
	id: string,
	snapshot: ConversationSnapshot | null,
): ConversationRecordFacts {
	return {
		conversationId: id,
		exists: snapshot !== null,
		...(snapshot?.userId ? { ownerId: snapshot.userId } : {}),
	};
}

function textContent(message: UIMessage): string {
	return (message.parts ?? [])
		.filter(
			(part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
				part.type === "text",
		)
		.map((part) => part.text)
		.join("");
}

function serializedParts(message: UIMessage): string {
	return JSON.stringify(
		(message.parts ?? []).filter(
			(part) => part.type === "text" || part.type === "file",
		),
	);
}

function matchesPersistedUserMessage(
	message: UIMessage,
	persisted: MessageSnapshot,
) {
	if (persisted.content === serializedParts(message)) return true;
	const parts = message.parts ?? [];
	return (
		parts.length === 1 &&
		parts[0]?.type === "text" &&
		persisted.content === parts[0].text
	);
}

function fileParts(messages: readonly UIMessage[]) {
	return messages.flatMap((message) =>
		(message.parts ?? []).filter(
			(part): part is Extract<UIMessage["parts"][number], { type: "file" }> =>
				part.type === "file",
		),
	);
}

function completedToolNames(message: UIMessage | undefined) {
	if (!message) return [];
	return [
		...new Set(
			(message.parts ?? []).flatMap((part) => {
				if (
					!("state" in part) ||
					(part.state !== "output-available" && part.state !== "output-error")
				) {
					return [];
				}
				if (part.type === "dynamic-tool" && "toolName" in part) {
					return typeof part.toolName === "string" ? [part.toolName] : [];
				}
				return part.type.startsWith("tool-") ? [part.type.slice(5)] : [];
			}),
		),
	];
}

function validateAttachments(messages: readonly UIMessage[]) {
	const files = fileParts(messages);
	if (files.length > 10) {
		throw new AiChatOperationError(
			400,
			"A chat request may include at most 10 attachments.",
			"TOO_MANY_ATTACHMENTS",
		);
	}
	for (const file of files) {
		if (
			typeof file.url !== "string" ||
			(!file.url.startsWith("https://") &&
				!file.url.startsWith("http://") &&
				!file.url.startsWith("data:"))
		) {
			throw new AiChatOperationError(
				400,
				"Attachment URLs must use http, https, or data URLs.",
				"INVALID_ATTACHMENT_URL",
			);
		}
		if (file.url.startsWith("data:") && file.url.length > 14_000_000) {
			throw new AiChatOperationError(
				413,
				"Inline attachments must not exceed 10 MB.",
				"ATTACHMENT_TOO_LARGE",
			);
		}
	}
}

function structuralToolNames(
	input: DeepReadonly<z.output<typeof ChatOperationInputSchema>>,
	config: AiChatOperationsConfig,
) {
	if (!config.enablePageTools || !input.availableTools?.length) return [];
	const consumerSchemas = config.clientToolSchemas ?? {};
	return [...new Set(input.availableTools)].filter((name) => {
		if (name in BUILT_IN_PAGE_TOOL_SCHEMAS) {
			const allowlist = BUILT_IN_PAGE_TOOL_ROUTE_ALLOWLIST[name];
			return Boolean(
				allowlist && input.routeName && allowlist.includes(input.routeName),
			);
		}
		return name in consumerSchemas;
	});
}

function buildTools(names: readonly string[], config: AiChatOperationsConfig) {
	const pageTools = Object.fromEntries(
		names.map((name) => [
			name,
			BUILT_IN_PAGE_TOOL_SCHEMAS[name] ?? config.clientToolSchemas?.[name],
		]),
	) as Record<string, Tool>;
	return Object.keys(pageTools).length > 0
		? { ...pageTools, ...config.tools }
		: config.tools;
}

function determineIntent(
	messages: readonly UIMessage[],
	snapshot: ConversationSnapshot | null,
): { intent: StreamStartFacts["intent"]; messageId?: string } {
	const last = messages[messages.length - 1];
	if (!last) return { intent: "send" };
	if (last.role !== "user" && last.role !== "assistant") {
		throw new AiChatOperationError(
			400,
			"A chat request must end with a user or assistant message.",
			"INVALID_MESSAGE_SEQUENCE",
		);
	}
	if (!snapshot) return { intent: "send" };
	const incomingUsers = messages.filter((message) => message.role === "user");
	const persistedUsers = snapshot.messages.filter(
		(message) => message.role === "user",
	);
	const sharedUserCount = Math.min(incomingUsers.length, persistedUsers.length);
	for (let index = 0; index < sharedUserCount; index++) {
		const incoming = incomingUsers[index];
		const persisted = persistedUsers[index];
		if (!incoming || !persisted) continue;
		const matches = matchesPersistedUserMessage(incoming, persisted);
		if (matches) continue;
		if (
			last.role === "user" &&
			incoming === last &&
			index === incomingUsers.length - 1
		) {
			return { intent: "edit", messageId: persisted.id };
		}
		throw new AiChatOperationError(
			409,
			"The conversation transcript changed before authorization.",
			"STALE_MESSAGE",
		);
	}
	if (incomingUsers.length > persistedUsers.length) {
		if (
			incomingUsers.length === persistedUsers.length + 1 &&
			incomingUsers[incomingUsers.length - 1] === last
		) {
			return { intent: "send" };
		}
		throw new AiChatOperationError(
			409,
			"The conversation transcript changed before authorization.",
			"STALE_MESSAGE",
		);
	}
	const isToolResult =
		last.role === "assistant" && completedToolNames(last).length > 0;
	if (isToolResult && incomingUsers.length !== persistedUsers.length) {
		throw new AiChatOperationError(
			409,
			"The tool continuation no longer follows the latest user message.",
			"STALE_MESSAGE",
		);
	}
	const target = persistedUsers[incomingUsers.length - 1];
	if (!target) {
		throw new AiChatOperationError(
			400,
			"Retry requires a persisted message.",
			"MESSAGE_NOT_FOUND",
		);
	}
	return {
		intent: isToolResult ? "tool-result" : "retry",
		messageId: target.id,
	};
}

function nextVersion(date: Date) {
	return new Date(Math.max(Date.now(), date.getTime() + 1));
}

const AFFECTED_ROW_KEYS = [
	"rowCount",
	"affectedRows",
	"rowsAffected",
	"changes",
	"numUpdatedRows",
] as const;

function hasPositiveCount(value: unknown): boolean {
	if (typeof value === "number") return Number.isFinite(value) && value > 0;
	if (typeof value === "bigint") return value > 0n;
	return false;
}

/** Normalize conditional-update results across the supported adapters. */
function didAffectRow(result: unknown, expectedId: string): boolean {
	if (typeof result === "number" || typeof result === "bigint") {
		return hasPositiveCount(result);
	}
	if (!result || typeof result !== "object") return false;
	const record = result as Record<string, unknown>;
	if ("count" in record) return hasPositiveCount(record.count);
	if (Array.isArray(result)) {
		return result.length > 0 && didAffectRow(result[0], expectedId);
	}
	for (const key of AFFECTED_ROW_KEYS) {
		if (key in record) return hasPositiveCount(record[key]);
	}
	if ("meta" in record) {
		const meta = record.meta;
		return Boolean(
			meta &&
				typeof meta === "object" &&
				"changes" in meta &&
				hasPositiveCount((meta as Record<string, unknown>).changes),
		);
	}
	return record.id === expectedId;
}

const memoryRollbackMarkers = new WeakMap<Adapter, (error: unknown) => void>();

function markMemoryRollback(adapter: Adapter, error: unknown) {
	memoryRollbackMarkers.get(adapter)?.(error);
}

/**
 * The published memory adapter rolls transactions back from a whole-database
 * clone. Serialize every access to the shared adapter so a rejected AI Chat
 * transaction cannot erase a concurrent operation from this or another plugin.
 */
function serializeMemoryOperations(adapter: Adapter): Adapter {
	if (adapter.id !== "memory" || memoryRollbackMarkers.has(adapter)) {
		return adapter;
	}
	const source: Adapter = { ...adapter };
	const lockContext = new AsyncLocalStorage<MemoryHistoryLockContext>();
	let tail = Promise.resolve();
	let activeOwner: object | undefined;
	const withLock = async <T>(
		run: (activeAdapter: ActiveAdapter) => Promise<T>,
	): Promise<T> => {
		const inherited = lockContext.getStore();
		if (inherited && inherited.owner === activeOwner) {
			return run(inherited.adapter);
		}
		let release = () => {};
		const previous = tail;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		const owner = {};
		activeOwner = owner;
		try {
			return await lockContext.run({ owner, adapter: source }, () =>
				run(source),
			);
		} finally {
			if (activeOwner === owner) activeOwner = undefined;
			release();
		}
	};
	const serialized: Adapter = {
		...source,
		create: ((input) =>
			withLock((active) => active.create(input))) as Adapter["create"],
		findOne: ((input) =>
			withLock((active) => active.findOne(input))) as Adapter["findOne"],
		findMany: ((input) =>
			withLock((active) => active.findMany(input))) as Adapter["findMany"],
		count: (input) => withLock((active) => active.count(input)),
		update: ((input) =>
			withLock((active) => active.update(input))) as Adapter["update"],
		updateMany: (input) => withLock((active) => active.updateMany(input)),
		delete: ((input) =>
			withLock((active) => active.delete(input))) as Adapter["delete"],
		deleteMany: (input) => withLock((active) => active.deleteMany(input)),
		consumeOne: ((input) =>
			withLock((active) => active.consumeOne(input))) as Adapter["consumeOne"],
		transaction: ((callback) =>
			withLock((active) => {
				const context = lockContext.getStore();
				if (!context)
					throw new TypeError("Missing AI Chat memory lock context.");
				if (context.inTransaction) {
					return callback(active as TransactionAdapter).catch((error) => {
						context.rollbackOnly = true;
						context.rollbackError = error;
						throw error;
					});
				}
				if (!active.transaction) {
					throw new TypeError("Missing AI Chat memory transaction adapter.");
				}
				return active.transaction((transaction) =>
					lockContext.run(
						{
							owner: context.owner,
							adapter: transaction,
							inTransaction: true,
						},
						async () => {
							const transactionContext = lockContext.getStore();
							const result = await callback(transaction);
							if (transactionContext?.rollbackOnly) {
								throw transactionContext.rollbackError;
							}
							return result;
						},
					),
				);
			})) as Adapter["transaction"],
	};
	Object.assign(adapter, serialized);
	memoryRollbackMarkers.set(adapter, (error) => {
		const context = lockContext.getStore();
		if (!context || context.owner !== activeOwner || !context.inTransaction) {
			return;
		}
		context.rollbackOnly = true;
		context.rollbackError = error;
	});
	return adapter;
}

function requireAtomicConversationTransactions(adapter: Adapter) {
	if (
		adapter.id !== "memory" &&
		typeof adapter.options?.adapterConfig.transaction !== "function"
	) {
		throw new AiChatOperationError(
			500,
			"AI Chat conversation writes require an adapter with isolated transaction support.",
			"ATOMIC_TRANSACTION_REQUIRED",
		);
	}
}

async function scopedUserId(
	context: OperationContext<any, any>,
	input: object,
	getUserId: AiChatOperationsConfig["getUserId"],
) {
	if (context.identity) return context.identity.id;
	const trustedUserId = (input as { trustedUserId?: string }).trustedUserId;
	if (!context.request && trustedUserId) return trustedUserId;
	if (!context.request || !getUserId) return undefined;
	const userId = await getUserId({
		request: context.request,
		headers: context.request.headers,
		body: context.input,
		...(typeof (input as { id?: unknown }).id === "string"
			? { params: { id: (input as { id: string }).id } }
			: {}),
	});
	if (!userId) {
		throw new AiChatOperationError(
			403,
			"Unauthorized: User authentication required",
			"AUTHENTICATION_REQUIRED",
		);
	}
	return userId;
}

function assertConversationScope(
	snapshot: ConversationSnapshot | null,
	userId: string | undefined,
	message: string,
) {
	if (userId && snapshot?.userId && snapshot.userId !== userId) {
		throw new AiChatOperationError(403, message, "FORBIDDEN");
	}
}

/** Build all AI Chat operations once for HTTP, request, and trusted execution. */
export function createAiChatOperations(
	sourceAdapter: Adapter,
	config: AiChatOperationsConfig,
): AiChatOperations {
	const adapter = serializeMemoryOperations(sourceAdapter);
	const hooks = config.hooks;
	const conversationSnapshots = new WeakMap<
		object,
		ConversationSnapshot | null
	>();
	const streamPreparations = new WeakMap<object, StreamPreparation>();
	const scopedUserIds = new WeakMap<object, string | undefined>();
	const pendingRequestedConversationClaims = new Set<string>();
	const pendingConversationMutationClaims = new Set<string>();
	const claimConversationMutation = (conversationId: string) => {
		requireAtomicConversationTransactions(adapter);
		if (pendingConversationMutationClaims.has(conversationId)) {
			throw new AiChatOperationError(
				409,
				"Conversation changed during authorization.",
				"STALE_CONVERSATION",
			);
		}
		pendingConversationMutationClaims.add(conversationId);
		return () => pendingConversationMutationClaims.delete(conversationId);
	};
	const assertHistoryAvailable = () => {
		if (config.access === "public") {
			throw new AiChatOperationError(
				404,
				"Conversations are not available in public mode.",
				"HISTORY_UNAVAILABLE",
			);
		}
	};

	const listConversations = defineOperation({
		input: EmptyInputSchema,
		permission: aiChatPermissions.conversation.read,
		legacyAuthorization: () => ({
			resource: "ai-chat:conversation",
			action: "read",
		}),
		facts: () => {
			assertHistoryAvailable();
			return { scope: "collection" as const };
		},
		before: async (context) => {
			const userId = await scopedUserId(
				context,
				context.input,
				config.getUserId,
			);
			scopedUserIds.set(context.input as object, userId);
			await runBeforeHook(
				() =>
					hooks?.onBeforeListConversations?.(
						hookContext(context, { query: context.input }),
					),
				"Unauthorized: Cannot list conversations",
			);
		},
		execute: async (context) => {
			const userId = scopedUserIds.get(context.input as object);
			const conversations =
				config.requestAuthorizationConfigured && context.request && !userId
					? []
					: (await getAllConversations(adapter, userId)).map(
							publicConversation,
						);
			await hooks?.onConversationsRead?.(
				conversations,
				hookContext(context, { query: context.input }),
			);
			return conversations;
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks?.onListConversationsError, error, context, {
				query: context.input,
			}),
	});

	const getConversation = defineOperation({
		input: ConversationOperationInputSchema,
		permission: aiChatPermissions.conversation.read,
		legacyAuthorization: ({ facts }) => ({
			resource: "ai-chat:conversation",
			action: "read",
			params:
				facts.scope === "record"
					? { id: facts.conversationId, ownerId: facts.ownerId }
					: undefined,
		}),
		facts: async ({ input }) => {
			assertHistoryAvailable();
			const conversation = await getConversationById(adapter, input.id);
			const snapshot = conversation ? snapshotConversation(conversation) : null;
			conversationSnapshots.set(input as object, snapshot);
			return {
				scope: "record" as const,
				...recordFacts(input.id, snapshot),
			};
		},
		before: async (context) => {
			const userId = await scopedUserId(
				context,
				context.input,
				config.getUserId,
			);
			assertConversationScope(
				conversationSnapshots.get(context.input as object) ?? null,
				context.identity ? undefined : userId,
				"Unauthorized: Cannot access this conversation",
			);
			const current = await getConversationById(adapter, context.input.id);
			if (
				!sameSnapshot(
					current,
					conversationSnapshots.get(context.input as object) ?? null,
				)
			) {
				throw new AiChatOperationError(
					409,
					"Conversation changed during authorization.",
					"STALE_CONVERSATION",
				);
			}
			await runBeforeHook(
				() =>
					hooks?.onBeforeGetConversation?.(
						context.input.id,
						hookContext(context, { params: { id: context.input.id } }),
					),
				"Unauthorized: Cannot get conversation",
			);
		},
		execute: async (context) => {
			const conversation = await getConversationById(adapter, context.input.id);
			if (!conversation) {
				throw new AiChatOperationError(
					404,
					"Conversation not found.",
					"CONVERSATION_NOT_FOUND",
				);
			}
			if (
				!sameSnapshot(
					conversation,
					conversationSnapshots.get(context.input as object) ?? null,
				)
			) {
				throw new AiChatOperationError(
					409,
					"Conversation changed during authorization.",
					"STALE_CONVERSATION",
				);
			}
			const result = conversationResult(conversation);
			await hooks?.onConversationRead?.(
				result,
				hookContext(context, { params: { id: context.input.id } }),
			);
			return result;
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks?.onGetConversationError, error, context, {
				params: { id: context.input.id },
			}),
	});

	const createConversation = defineOperation({
		input: createConversationSchema,
		permission: aiChatPermissions.conversation.create,
		legacyAuthorization: () => ({
			resource: "ai-chat:conversation",
			action: "create",
		}),
		facts: () => {
			assertHistoryAvailable();
			return undefined;
		},
		before: async (context) => {
			const userId = await scopedUserId(
				context,
				context.input,
				config.getUserId,
			);
			scopedUserIds.set(context.input as object, userId);
			await runBeforeHook(
				() =>
					hooks?.onBeforeCreateConversation?.(
						context.input,
						hookContext(context, { body: context.input }),
					),
				"Unauthorized: Cannot create conversation",
			);
		},
		execute: async (context) => {
			const userId = scopedUserIds.get(context.input as object);
			const now = new Date();
			const conversation = await adapter.create<Conversation>({
				model: "conversation",
				forceAllowId: Boolean(context.input.id),
				data: {
					...(context.input.id ? { id: context.input.id } : {}),
					...(userId ? { userId } : {}),
					title: context.input.title || "New Conversation",
					createdAt: now,
					updatedAt: now,
				} as Conversation,
			});
			const result = publicConversation(conversation);
			await hooks?.onConversationCreated?.(
				result,
				hookContext(context, { body: context.input }),
			);
			return result;
		},
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onCreateConversationError, error, context, {
				body: context.input,
			});
		},
	});

	const updateConversation = defineOperation({
		input: UpdateConversationOperationInputSchema,
		permission: aiChatPermissions.conversation.update,
		legacyAuthorization: ({ facts }) => ({
			resource: "ai-chat:conversation",
			action: "update",
			params: { id: facts.conversationId, ownerId: facts.ownerId },
		}),
		facts: async ({ input }) => {
			assertHistoryAvailable();
			const conversation = await getConversationById(adapter, input.id);
			const snapshot = conversation ? snapshotConversation(conversation) : null;
			conversationSnapshots.set(input as object, snapshot);
			return recordFacts(input.id, snapshot);
		},
		execute: async (context) => {
			const expected =
				conversationSnapshots.get(context.input as object) ?? null;
			if (!expected) {
				throw new AiChatOperationError(
					404,
					"Conversation not found.",
					"CONVERSATION_NOT_FOUND",
				);
			}
			const userId = await scopedUserId(
				context,
				context.input,
				config.getUserId,
			);
			assertConversationScope(
				expected,
				context.identity ? undefined : userId,
				"Unauthorized: Cannot update this conversation",
			);
			const releaseMutation = claimConversationMutation(expected.id);
			try {
				return await adapter.transaction(async (tx) => {
					const current = await getConversationById(tx, context.input.id);
					if (!sameSnapshot(current, expected)) {
						throw new AiChatOperationError(
							409,
							"Conversation changed during authorization.",
							"STALE_CONVERSATION",
						);
					}
					await runBeforeHook(
						() =>
							hooks?.onBeforeUpdateConversation?.(
								context.input.id,
								context.input.data,
								hookContext(context, {
									body: context.input,
									params: { id: context.input.id },
								}),
							),
						"Unauthorized: Cannot update conversation",
					);
					const updatedAt = nextVersion(new Date(expected.updatedAt));
					const matched = await tx.updateMany({
						model: "conversation",
						where: [
							{
								field: "id",
								value: expected.id,
								operator: "eq" as const,
							},
							{
								field: "updatedAt",
								value: new Date(expected.updatedAt),
								operator: "gte" as const,
							},
							{
								field: "updatedAt",
								value: new Date(expected.updatedAt),
								operator: "lte" as const,
							},
						],
						update: { title: context.input.data.title, updatedAt },
					});
					if (!didAffectRow(matched, expected.id)) {
						throw new AiChatOperationError(
							409,
							"Conversation changed during authorization.",
							"STALE_CONVERSATION",
						);
					}
					const updated = await tx.findOne<Conversation>({
						model: "conversation",
						where: [{ field: "id", value: expected.id }],
					});
					if (!updated) {
						throw new AiChatOperationError(
							404,
							"Conversation not found.",
							"CONVERSATION_NOT_FOUND",
						);
					}
					return publicConversation(updated);
				});
			} finally {
				releaseMutation();
			}
		},
		after: (context) =>
			hooks?.onConversationUpdated?.(
				context.result,
				hookContext(context, {
					body: context.input,
					params: { id: context.input.id },
				}),
			),
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onUpdateConversationError, error, context, {
				body: context.input,
				params: { id: context.input.id },
			});
		},
	});

	const deleteConversation = defineOperation({
		input: ConversationOperationInputSchema,
		permission: aiChatPermissions.conversation.delete,
		legacyAuthorization: ({ facts }) => ({
			resource: "ai-chat:conversation",
			action: "delete",
			params: { id: facts.conversationId, ownerId: facts.ownerId },
		}),
		facts: async ({ input }) => {
			assertHistoryAvailable();
			const conversation = await getConversationById(adapter, input.id);
			const snapshot = conversation ? snapshotConversation(conversation) : null;
			conversationSnapshots.set(input as object, snapshot);
			return recordFacts(input.id, snapshot);
		},
		execute: async (context) => {
			const expected =
				conversationSnapshots.get(context.input as object) ?? null;
			if (!expected) {
				throw new AiChatOperationError(
					404,
					"Conversation not found.",
					"CONVERSATION_NOT_FOUND",
				);
			}
			const userId = await scopedUserId(
				context,
				context.input,
				config.getUserId,
			);
			assertConversationScope(
				expected,
				context.identity ? undefined : userId,
				"Unauthorized: Cannot delete this conversation",
			);
			const releaseMutation = claimConversationMutation(expected.id);
			try {
				return await adapter.transaction(async (tx) => {
					const current = await getConversationById(tx, context.input.id);
					if (!sameSnapshot(current, expected)) {
						throw new AiChatOperationError(
							409,
							"Conversation changed during authorization.",
							"STALE_CONVERSATION",
						);
					}
					await runBeforeHook(
						() =>
							hooks?.onBeforeDeleteConversation?.(
								context.input.id,
								hookContext(context, {
									params: { id: context.input.id },
								}),
							),
						"Unauthorized: Cannot delete conversation",
					);
					const deleted = await tx.deleteMany({
						model: "conversation",
						where: [
							{
								field: "id",
								value: expected.id,
								operator: "eq" as const,
							},
							{
								field: "updatedAt",
								value: new Date(expected.updatedAt),
								operator: "gte" as const,
							},
							{
								field: "updatedAt",
								value: new Date(expected.updatedAt),
								operator: "lte" as const,
							},
						],
					});
					if (!didAffectRow(deleted, expected.id)) {
						throw new AiChatOperationError(
							409,
							"Conversation changed during authorization.",
							"STALE_CONVERSATION",
						);
					}
					return { success: true as const };
				});
			} finally {
				releaseMutation();
			}
		},
		after: (context) =>
			hooks?.onConversationDeleted?.(
				context.input.id,
				hookContext(context, { params: { id: context.input.id } }),
			),
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onDeleteConversationError, error, context, {
				params: { id: context.input.id },
			});
		},
	});

	const startStream = definePassthroughOperation({
		input: ChatOperationInputSchema,
		permission: aiChatPermissions.stream.start,
		access: config.access,
		legacyAuthorization: ({ facts }) =>
			config.access === "public"
				? { public: true as const }
				: {
						resource: "ai-chat:stream",
						action: "start",
						params: { ...facts },
					},
		facts: async ({ input }) => {
			const uiMessages = input.messages as UIMessage[];
			if (!uiMessages[0]) {
				throw new AiChatOperationError(
					400,
					"At least one message is required.",
					"EMPTY_CHAT",
				);
			}
			validateAttachments(uiMessages);
			const conversation =
				config.access === "authorized" && input.conversationId
					? await getConversationById(adapter, input.conversationId)
					: null;
			const snapshot = conversation ? snapshotConversation(conversation) : null;
			const intent = determineIntent(uiMessages, snapshot);
			const mediaTypes = fileParts(uiMessages).map((file) => file.mediaType);
			const toolNames = structuralToolNames(input, config);
			const toolResultNames = completedToolNames(
				uiMessages[uiMessages.length - 1],
			);
			const availableToolNames = new Set([
				...toolNames,
				...Object.keys(config.tools ?? {}),
			]);
			if (toolResultNames.some((name) => !availableToolNames.has(name))) {
				throw new AiChatOperationError(
					400,
					"Tool results must match a server-enabled tool.",
					"INVALID_TOOL_RESULT",
				);
			}
			streamPreparations.set(input as object, {
				snapshot,
				...intent,
				mediaTypes,
				authorizationToolNames: [...availableToolNames],
				toolNames,
			});
			return {
				...(input.conversationId
					? { conversationId: input.conversationId }
					: {}),
				...(snapshot?.userId ? { ownerId: snapshot.userId } : {}),
				createsConversation: snapshot === null,
				intent: intent.intent,
			};
		},
		additionalPermissions: ({ input, facts }) => {
			const prepared = streamPreparations.get(input as object);
			if (!prepared) {
				throw new AiChatOperationError(
					500,
					"Stream authorization context is unavailable.",
					"AUTHORIZATION_SNAPSHOT_MISSING",
				);
			}
			const requests = [];
			if (config.access === "authorized" && !prepared.snapshot) {
				requests.push(aiChatPermissions.conversation.create());
			}
			const base = {
				...(facts.conversationId
					? { conversationId: facts.conversationId }
					: {}),
				...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
			};
			if (prepared.intent === "send") {
				requests.push(
					aiChatPermissions.message.send({
						...base,
						createsConversation: !prepared.snapshot,
					}),
				);
			} else if (prepared.intent === "edit" && facts.conversationId) {
				if (!prepared.messageId) {
					throw new AiChatOperationError(
						500,
						"Edit authorization message is unavailable.",
						"AUTHORIZATION_SNAPSHOT_MISSING",
					);
				}
				requests.push(
					aiChatPermissions.message.edit({
						conversationId: facts.conversationId,
						messageId: prepared.messageId,
						...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
					}),
				);
			} else if (prepared.intent === "retry" && facts.conversationId) {
				if (!prepared.messageId) {
					throw new AiChatOperationError(
						500,
						"Retry authorization message is unavailable.",
						"AUTHORIZATION_SNAPSHOT_MISSING",
					);
				}
				requests.push(
					aiChatPermissions.message.retry({
						conversationId: facts.conversationId,
						messageId: prepared.messageId,
						...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
					}),
				);
			} else if (prepared.intent === "tool-result") {
				requests.push(
					aiChatPermissions.message.send({
						...base,
						createsConversation: false,
					}),
				);
				if (!facts.conversationId || !prepared.messageId) {
					throw new AiChatOperationError(
						500,
						"Tool continuation authorization message is unavailable.",
						"AUTHORIZATION_SNAPSHOT_MISSING",
					);
				}
				// A completed tool result starts another generation for the same
				// persisted user message. Requiring retry as well as send prevents an
				// assistant-ended browser transcript from bypassing a denied retry rule.
				requests.push(
					aiChatPermissions.message.retry({
						conversationId: facts.conversationId,
						messageId: prepared.messageId,
						...(facts.ownerId ? { ownerId: facts.ownerId } : {}),
					}),
				);
			}
			if (prepared.mediaTypes.length > 0) {
				requests.push(
					aiChatPermissions.attachment.send({
						...base,
						mediaTypes: [...prepared.mediaTypes],
					}),
				);
			}
			if (prepared.authorizationToolNames.length > 0) {
				requests.push(
					aiChatPermissions.tool.activate({
						...base,
						...(input.routeName ? { routeName: input.routeName } : {}),
						toolNames: [...prepared.authorizationToolNames],
					}),
				);
			}
			return requests;
		},
		legacyAdditionalAuthorization: ({ id, facts }) => {
			if (config.access === "public") return { public: true };
			const mapping: Record<string, { resource: string; action: string }> = {
				[aiChatPermissions.conversation.create.id]: {
					resource: "ai-chat:conversation",
					action: "create",
				},
				[aiChatPermissions.message.send.id]: {
					resource: "ai-chat:message",
					action: "create",
				},
				[aiChatPermissions.message.edit.id]: {
					resource: "ai-chat:message",
					action: "update",
				},
				[aiChatPermissions.message.retry.id]: {
					resource: "ai-chat:message",
					action: "retry",
				},
				[aiChatPermissions.attachment.send.id]: {
					resource: "ai-chat:attachment",
					action: "create",
				},
				[aiChatPermissions.tool.activate.id]: {
					resource: "ai-chat:tool",
					action: "activate",
				},
			};
			const mapped = mapping[id];
			if (!mapped) throw new TypeError(`Unknown AI Chat permission: ${id}`);
			return { ...mapped, params: facts };
		},
		execute: async (context) => {
			const prepared = streamPreparations.get(context.input as object);
			if (!prepared) {
				throw new AiChatOperationError(
					500,
					"Stream authorization context is unavailable.",
					"AUTHORIZATION_SNAPSHOT_MISSING",
				);
			}
			const uiMessages = context.input.messages as UIMessage[];
			const firstMessage = uiMessages[0] as UIMessage;
			const userId =
				config.access === "authorized"
					? await scopedUserId(context, context.input, config.getUserId)
					: undefined;
			if (config.access === "authorized") {
				assertConversationScope(
					prepared.snapshot,
					context.identity ? undefined : userId,
					"Unauthorized: Cannot access this conversation",
				);
			}

			if (config.access === "authorized" && context.input.conversationId) {
				const current = await getConversationById(
					adapter,
					context.input.conversationId,
				);
				if (!sameSnapshot(current, prepared.snapshot)) {
					throw new AiChatOperationError(
						409,
						"Conversation changed during authorization.",
						"STALE_CONVERSATION",
					);
				}
			}

			const modelMessages = await convertToModelMessages(uiMessages);
			const pageContext = context.input.pageContext?.trim();
			const pageSuffix = pageContext
				? `\n\nCurrent page context:\n${pageContext}`
				: "";
			const systemContent = config.systemPrompt
				? `${config.systemPrompt}${pageSuffix}`
				: pageSuffix || undefined;
			const messages = systemContent
				? [
						{ role: "system" as const, content: systemContent },
						...modelMessages,
					]
				: modelMessages;
			const contextForHooks = hookContext(context, { body: context.input });
			const enterChatLifecycle = async () => {
				await runBeforeHook(
					() =>
						hooks?.onBeforeChat?.(
							uiMessages.map((message) => ({
								role: message.role,
								content: textContent(message),
							})),
							contextForHooks,
						),
					"Unauthorized: Cannot start chat",
				);

				let allowedToolNames = [...prepared.toolNames];
				if (allowedToolNames.length > 0 && hooks?.onBeforeToolsActivated) {
					const onBeforeToolsActivated = hooks.onBeforeToolsActivated;
					const filtered = await runBeforeHook(
						() =>
							onBeforeToolsActivated(
								allowedToolNames,
								context.input.routeName,
								contextForHooks,
							),
						"Unauthorized: Tool activation denied",
					);
					const structurallyAllowed = new Set(allowedToolNames);
					allowedToolNames = [
						...new Set(
							filtered.filter((name) => structurallyAllowed.has(name)),
						),
					];
				}
				return buildTools(allowedToolNames, config);
			};

			const reportStreamError = async (error: unknown) => {
				try {
					await hooks?.onChatError?.(
						normalizeError(error, "Chat provider stream failed"),
						contextForHooks,
					);
				} catch (hookError) {
					console.error("[ai-chat] Error in onChatError hook:", hookError);
				}
			};

			const startModelStream = (
				mergedTools: Record<string, Tool> | undefined,
				onFinish?: (completion: { text: string }) => Promise<void>,
			) => {
				const result = streamText({
					model: config.model,
					messages,
					tools: mergedTools,
					...(mergedTools ? { stopWhen: stepCountIs(5) } : {}),
					...(onFinish ? { onFinish } : {}),
					onError: ({ error }) => reportStreamError(error),
				});
				return result.toUIMessageStreamResponse({
					originalMessages: uiMessages,
				});
			};

			if (config.access === "public") {
				const mergedTools = await enterChatLifecycle();
				return startModelStream(mergedTools);
			}
			requireAtomicConversationTransactions(adapter);
			const releaseExistingConversationClaim = prepared.snapshot
				? claimConversationMutation(prepared.snapshot.id)
				: undefined;

			const requestedMissingConversationId =
				!prepared.snapshot && context.input.conversationId
					? context.input.conversationId
					: undefined;
			if (
				requestedMissingConversationId &&
				pendingRequestedConversationClaims.has(requestedMissingConversationId)
			) {
				throw new AiChatOperationError(
					409,
					"Conversation changed during authorization.",
					"STALE_CONVERSATION",
				);
			}
			if (requestedMissingConversationId) {
				pendingRequestedConversationClaims.add(requestedMissingConversationId);
			}
			try {
				return await adapter.transaction(async (tx) => {
					let conversationId = context.input.conversationId;
					let streamClaimVersion: Date | undefined;
					const createConversation = () => {
						const now = new Date();
						return tx.create<Conversation>({
							model: "conversation",
							forceAllowId: Boolean(conversationId),
							data: {
								...(conversationId ? { id: conversationId } : {}),
								...(userId ? { userId } : {}),
								title:
									textContent(firstMessage).slice(0, 50) || "New Conversation",
								createdAt: now,
								updatedAt: now,
							} as Conversation,
						});
					};
					if (prepared.snapshot) {
						const claimedAt = nextVersion(
							new Date(prepared.snapshot.updatedAt),
						);
						const claimed = await tx.updateMany({
							model: "conversation",
							where: [
								{
									field: "id",
									value: prepared.snapshot.id,
									operator: "eq" as const,
								},
								{
									field: "updatedAt",
									value: new Date(prepared.snapshot.updatedAt),
									operator: "gte" as const,
								},
								{
									field: "updatedAt",
									value: new Date(prepared.snapshot.updatedAt),
									operator: "lte" as const,
								},
							],
							update: { updatedAt: claimedAt },
						});
						if (!didAffectRow(claimed, prepared.snapshot.id)) {
							throw new AiChatOperationError(
								409,
								"Conversation changed during authorization.",
								"STALE_CONVERSATION",
							);
						}
						conversationId = prepared.snapshot.id;
						streamClaimVersion = claimedAt;
					} else if (conversationId) {
						// A caller-selected id is also the atomic absence claim. Creating it
						// inside the transaction ensures a concurrent loser fails before any
						// ordinary lifecycle hook runs; hook failures roll the claim back.
						const current = await getConversationById(tx, conversationId);
						if (current) {
							throw new AiChatOperationError(
								409,
								"Conversation changed during authorization.",
								"STALE_CONVERSATION",
							);
						}
						const created = await createConversation();
						conversationId = created.id;
						streamClaimVersion = created.updatedAt;
					}
					const mergedTools = await enterChatLifecycle();
					if (!prepared.snapshot && !conversationId) {
						const created = await createConversation();
						conversationId = created.id;
						streamClaimVersion = created.updatedAt;
					}
					if (!conversationId || !streamClaimVersion) {
						throw new AiChatOperationError(
							500,
							"Conversation id was not created.",
							"CONVERSATION_CREATE_FAILED",
						);
					}
					const existingMessages = await tx.findMany<Message>({
						model: "message",
						where: [
							{
								field: "conversationId",
								value: conversationId,
								operator: "eq",
							},
						],
						sortBy: { field: "createdAt", direction: "asc" },
					});
					const lastIncoming = uiMessages[uiMessages.length - 1];
					const targetIndex = prepared.messageId
						? existingMessages.findIndex(
								(message) => message.id === prepared.messageId,
							)
						: -1;
					if (
						(prepared.intent === "retry" || prepared.intent === "edit") &&
						targetIndex === -1
					) {
						throw new AiChatOperationError(
							409,
							"The authorized message changed before persistence.",
							"STALE_MESSAGE",
						);
					}
					const deleteFrom =
						prepared.intent === "edit"
							? targetIndex
							: prepared.intent === "retry"
								? targetIndex + 1
								: existingMessages.length;
					for (const message of existingMessages.slice(deleteFrom)) {
						await tx.delete({
							model: "message",
							where: [{ field: "id", value: message.id }],
						});
					}
					if (
						(prepared.intent === "send" || prepared.intent === "edit") &&
						lastIncoming?.role === "user"
					) {
						await tx.create<Message>({
							model: "message",
							data: {
								conversationId,
								role: "user",
								content: serializedParts(lastIncoming),
								createdAt: new Date(),
							},
						});
					}

					const completionConversationId = conversationId;
					const completionClaimVersion = streamClaimVersion;
					const response = startModelStream(mergedTools, async ({ text }) => {
						try {
							requireAtomicConversationTransactions(adapter);
							const persisted = await adapter.transaction(
								async (completionTx) => {
									const completedAt = nextVersion(completionClaimVersion);
									const claimed = await completionTx.updateMany({
										model: "conversation",
										where: [
											{
												field: "id",
												value: completionConversationId,
												operator: "eq" as const,
											},
											{
												field: "updatedAt",
												value: completionClaimVersion,
												operator: "gte" as const,
											},
											{
												field: "updatedAt",
												value: completionClaimVersion,
												operator: "lte" as const,
											},
										],
										update: { updatedAt: completedAt },
									});
									if (!didAffectRow(claimed, completionConversationId)) {
										throw new AiChatOperationError(
											409,
											"A newer stream owns this conversation.",
											"STALE_STREAM",
										);
									}
									await completionTx.create<Message>({
										model: "message",
										data: {
											conversationId: completionConversationId,
											role: "assistant",
											content: JSON.stringify(
												text ? [{ type: "text", text }] : [],
											),
											createdAt: new Date(),
										},
									});
									return completionTx.findMany<Message>({
										model: "message",
										where: [
											{
												field: "conversationId",
												value: completionConversationId,
												operator: "eq",
											},
										],
										sortBy: { field: "createdAt", direction: "asc" },
									});
								},
							);
							if (hooks?.onAfterChat) {
								await hooks.onAfterChat(
									completionConversationId,
									persisted.map(serializeMessage),
									contextForHooks,
								);
							}
						} catch (error) {
							console.error("[ai-chat] Error in stream completion:", error);
							try {
								await hooks?.onChatError?.(
									normalizeError(error, "Chat completion persistence failed"),
									contextForHooks,
								);
							} catch (hookError) {
								console.error(
									"[ai-chat] Error in onChatError hook:",
									hookError,
								);
							}
						}
					});
					const headers = new Headers(response.headers);
					headers.set("X-Conversation-Id", completionConversationId);
					return new Response(response.body, {
						status: response.status,
						statusText: response.statusText,
						headers,
					});
				});
			} finally {
				releaseExistingConversationClaim?.();
				if (requestedMissingConversationId) {
					pendingRequestedConversationClaims.delete(
						requestedMissingConversationId,
					);
				}
			}
		},
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onChatError, error, context, {
				body: context.input,
			});
		},
	});

	return {
		startStream,
		listConversations,
		getConversation,
		createConversation,
		updateConversation,
		deleteConversation,
	};
}
