import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { AiChatApiRouter } from "./api/plugin";
import type { StackIdentity } from "@btst/stack/context";
import type { SerializedConversation, SerializedMessage } from "./types";

/** Identity partition for protected AI Chat history caches. */
export type AiChatIdentityPartition =
	| Readonly<StackIdentity>
	| "anonymous"
	| `pending:${number}`
	| `error:${number}`;

const legacyObjectTokens = new WeakMap<object, number>();
const legacySymbolTokens = new WeakMap<symbol, number>();
let nextLegacyIdentityToken = 0;

function legacyObjectToken(value: object) {
	let token = legacyObjectTokens.get(value);
	if (token === undefined) {
		token = ++nextLegacyIdentityToken;
		legacyObjectTokens.set(value, token);
	}
	return token;
}

function legacySymbolToken(value: symbol) {
	const registeredKey = Symbol.keyFor(value);
	if (registeredKey !== undefined) {
		return `registered:${JSON.stringify(registeredKey)}`;
	}
	let token = legacySymbolTokens.get(value);
	if (token === undefined) {
		token = ++nextLegacyIdentityToken;
		legacySymbolTokens.set(value, token);
	}
	return `local:${token}`;
}

function stableIdentityValue(
	value: unknown,
	seen: Map<object, number>,
): string {
	if (value === null) return "null";
	switch (typeof value) {
		case "string":
			return `string:${JSON.stringify(value)}`;
		case "number":
			return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
		case "boolean":
			return `boolean:${value}`;
		case "bigint":
			return `bigint:${value}`;
		case "undefined":
			return "undefined";
		case "symbol":
			return `symbol:${legacySymbolToken(value)}`;
		case "function":
			return `function:${legacyObjectToken(value)}`;
	}

	const object = value as object;
	const reference = seen.get(object);
	if (reference !== undefined) return `reference:${reference}`;
	seen.set(object, seen.size);
	if (value instanceof Date) {
		const timestamp = value.getTime();
		return `date:${Number.isNaN(timestamp) ? "invalid" : value.toISOString()}`;
	}
	if (value instanceof RegExp) {
		return `regexp:${JSON.stringify(value.source)}:${value.flags}`;
	}
	if (value instanceof Set) {
		return `set:{${[...value]
			.map((item) => stableIdentityValue(item, seen))
			.sort()
			.join(",")}}`;
	}
	if (value instanceof Map) {
		return `map:{${[...value]
			.map(
				([key, item]) =>
					`${stableIdentityValue(key, seen)}=>${stableIdentityValue(item, seen)}`,
			)
			.sort()
			.join(",")}}`;
	}
	if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
		const bytes =
			value instanceof ArrayBuffer
				? new Uint8Array(value)
				: new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
		return `bytes:${value.constructor.name}:${legacyObjectToken(value)}:${[
			...bytes,
		]
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("")}`;
	}
	if (Array.isArray(value)) {
		return `array:${value.length}:[${Array.from(
			{ length: value.length },
			(_, index) =>
				index in value ? stableIdentityValue(value[index], seen) : "array-hole",
		).join(",")}]`;
	}
	const prototype = Object.getPrototypeOf(value);
	const kind =
		prototype === Object.prototype || prototype === null
			? "object"
			: `object:${value.constructor?.name ?? "unknown"}:${legacyObjectToken(value)}`;
	return `${kind}:{${Object.keys(value as Record<string, unknown>)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${stableIdentityValue(
					(value as Record<string, unknown>)[key],
					seen,
				)}`,
		)
		.join(",")}}`;
}

function identityFingerprint(identity: Readonly<StackIdentity>): string {
	let input: string;
	try {
		input = stableIdentityValue(identity, new Map());
	} catch {
		// Legacy auth providers allow arbitrary unknown fields, including proxies
		// and getters that cannot be inspected. Keep key construction total; the
		// validated id remains the primary cache partition in this fallback.
		input = `uninspectable-identity:${legacyObjectToken(identity)}`;
	}
	let left = 0x811c9dc5;
	let right = 0x9e3779b9;
	for (let index = 0; index < input.length; index++) {
		const code = input.charCodeAt(index);
		left = Math.imul(left ^ code, 0x01000193);
		right = Math.imul(right ^ code, 0x85ebca6b);
	}
	return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0)
		.toString(16)
		.padStart(8, "0")}`;
}

/** @internal Serializable marker that never embeds arbitrary identity metadata. */
export function aiChatIdentityKey(identityPartition: AiChatIdentityPartition) {
	return typeof identityPartition === "string"
		? identityPartition
		: {
				id: identityPartition.id,
				fingerprint: identityFingerprint(identityPartition),
			};
}

export type ConversationWithMessages = SerializedConversation & {
	messages: SerializedMessage[];
};

export interface CreateConversationInput {
	id?: string;
	title?: string;
}

export interface RenameConversationInput {
	id: string;
	title: string;
}

/** Single source of truth for conversation HTTP mappings and cache behavior. */
export const aiChatResources = {
	conversations: {
		queries: {
			list: {
				path: "/chat/conversations",
				key: (identityPartition?: AiChatIdentityPartition) =>
					identityPartition === undefined
						? ["all"]
						: ["all", { identity: aiChatIdentityKey(identityPartition) }],
				select: (
					data: any,
					_identityPartition?: AiChatIdentityPartition,
				): SerializedConversation[] => data ?? [],
				skip: (identityPartition?: AiChatIdentityPartition) =>
					identityPartition !== undefined &&
					typeof identityPartition === "string" &&
					(identityPartition.startsWith("pending:") ||
						identityPartition.startsWith("error:")),
			},
			detail: {
				path: "/chat/conversations/:id",
				params: (id: string, _identityPartition?: AiChatIdentityPartition) => ({
					id,
				}),
				key: (id: string, identityPartition?: AiChatIdentityPartition) =>
					identityPartition === undefined
						? [id]
						: [id, { identity: aiChatIdentityKey(identityPartition) }],
				select: (
					data: any,
					_id?: string,
					_identityPartition?: AiChatIdentityPartition,
				): ConversationWithMessages | null => data,
				skip: (id: string, identityPartition?: AiChatIdentityPartition) =>
					!id ||
					(identityPartition !== undefined &&
						typeof identityPartition === "string" &&
						(identityPartition.startsWith("pending:") ||
							identityPartition.startsWith("error:"))),
			},
		},
		mutations: {
			create: {
				path: "@post/chat/conversations",
				method: "POST" as const,
				input: (input: CreateConversationInput) => ({ body: input }),
				select: (data: any): SerializedConversation | null => data,
				refresh: false,
			},
			rename: {
				path: "@put/chat/conversations/:id",
				method: "PUT" as const,
				input: (input: RenameConversationInput) => ({
					params: { id: input.id },
					body: { title: input.title },
				}),
				select: (data: any): SerializedConversation | null => data,
				refresh: false,
			},
			delete: {
				path: "@delete/chat/conversations/:id",
				method: "DELETE" as const,
				input: (input: { id: string }) => ({ params: { id: input.id } }),
				select: (data: any): { success: boolean } => data,
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createAiChatQueryKeys(
	client: ReturnType<typeof createApiClient<AiChatApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, aiChatResources, headers);
}

export type AiChatQueryKeys = ReturnType<typeof createAiChatQueryKeys>;
