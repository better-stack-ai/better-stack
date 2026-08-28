import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import { createServerAuth } from "../authorization/server";
import { createNextLayout } from "../next/server";
import { stack } from "../api";
import {
	createDbPlugin,
	type DeepReadonly,
	defineBackendPlugin,
	defineOperation,
	definePassthroughOperation,
} from "../plugins/api";
import { blogBackendPlugin, type BlogBackendHooks } from "../plugins/blog/api";
import { blogPermissions } from "../plugins/blog/permissions";
import {
	commentsBackendPlugin,
	type CommentsBackendHooks,
} from "../plugins/comments/api";
import { commentsPermissions } from "../plugins/comments/permissions";
import { aiChatPermissions } from "../plugins/ai-chat/permissions";
import type { KanbanBackendHooks } from "../plugins/kanban/api";
import type { StackIdentity } from "../shared/auth-types";
import type { DatabaseDefinition, DBAdapter } from "@btst/db";

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <
	T,
>() => T extends TRight ? 1 : 2
	? (<T>() => T extends TRight ? 1 : 2) extends <T>() => T extends TLeft ? 1 : 2
		? true
		: false
	: false;
type Expect<T extends true> = T;

const registered = definePermissions("registered", {
	article: {
		delete: permission(
			z.object({ id: z.string(), authorId: z.string().optional() }),
		),
	},
});

const unregistered = definePermissions("unregistered", {
	article: {
		delete: permission(z.object({ id: z.string() })),
	},
});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [registered] as const,
	rules: ({ registered }) => [
		registered.article.delete.when(({ identity, facts }) => {
			const identityIsExact: Expect<
				Equal<typeof identity, { id: string; role: "user" | "admin" } | null>
			> = true;
			const factsAreExact: Expect<
				Equal<typeof facts, { id: string; authorId?: string }>
			> = true;
			void identityIsExact;
			void factsAreExact;
			return identity !== null && identity.id === facts.authorId;
		}),
	],
});

authorization.can(registered.article.delete({ id: "article-1" }), {
	id: "user-1",
	role: "user",
});

const clientAuth = createClientAuth({
	authorization,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});

const clientResolverIsExact: Expect<
	Equal<
		ReturnType<typeof clientAuth.getIdentity>,
		Promise<{ id: string; role: "user" | "admin" } | null>
	>
> = true;
const clientHookIsExact: Expect<
	Equal<
		ReturnType<typeof clientAuth.useIdentity>["identity"],
		{ id: string; role: "user" | "admin" } | null
	>
> = true;
void clientResolverIsExact;
void clientHookIsExact;
clientAuth.useCan(registered.article.delete({ id: "article-1" }));
void clientAuth.CanAccess({
	permission: registered.article.delete({ id: "article-1" }),
});

const serverAuth = createServerAuth({
	authorization,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});

createNextLayout({
	// @ts-expect-error request-only server adapters cannot hydrate a headers-only Next layout
	auth: serverAuth,
	ClientLayout: () => null,
});

const headerServerAuth = createServerAuth({
	authorization,
	getIdentityFromHeaders: () => ({ id: "user-1", role: "user" as const }),
});

createNextLayout({ auth: headerServerAuth, ClientLayout: () => null });

const serverResolverIsExact: Expect<
	Equal<
		ReturnType<typeof serverAuth.getIdentity>,
		Promise<{ id: string; role: "user" | "admin" } | null>
	>
> = true;
void serverResolverIsExact;

// @ts-expect-error permission fact id must be a string
registered.article.delete({ id: 1 });

aiChatPermissions.message.retry({
	conversationId: "conversation-1",
	// @ts-expect-error AI Chat message ids are runtime-schema-backed strings
	messageId: 1,
});
// @ts-expect-error stream facts must state whether persistence creates a conversation
aiChatPermissions.stream.start({ intent: "send" });

authorization.can(registered.article.delete({ id: "article-1" }), {
	id: "user-1",
	// @ts-expect-error the identity is inferred from the identity schema
	role: "owner",
});

// @ts-expect-error permissions outside the registered catalogs are rejected
authorization.can(unregistered.article.delete({ id: "article-1" }), {
	id: "user-1",
	role: "user",
});

// @ts-expect-error bound hooks reject permissions outside the registered catalogs
clientAuth.useCan(unregistered.article.delete({ id: "article-1" }));

void clientAuth.CanAccess({
	// @ts-expect-error bound components reject permissions outside the registered catalogs
	permission: unregistered.article.delete({ id: "article-1" }),
});

// @ts-expect-error server identity resolver uses the same inferred identity contract
createServerAuth({
	authorization,
	getIdentityFromHeaders: () => ({
		id: "user-1",
		role: "owner",
	}),
});

const operation = defineOperation({
	input: z.object({ id: z.string() }),
	permission: registered.article.delete,
	facts: ({ input }) => ({ id: input.id }),
	execute: ({ input }) => input.id,
});

const plainLifecyclePermissions = definePermissions("plain-lifecycle", {
	read: permission(),
});
defineOperation({
	// @ts-expect-error Date input cannot cross the immutable lifecycle boundary
	input: z.object({ at: z.date() }),
	permission: plainLifecyclePermissions.read,
	facts: () => undefined,
	execute: () => "ok",
});
defineOperation({
	// @ts-expect-error Map input cannot cross the immutable lifecycle boundary
	input: z.object({ values: z.map(z.string(), z.string()) }),
	permission: plainLifecyclePermissions.read,
	facts: () => undefined,
	execute: () => "ok",
});
defineOperation({
	// @ts-expect-error typed arrays cannot cross the immutable lifecycle boundary
	input: z.object({ bytes: z.instanceof(Uint8Array) }),
	permission: plainLifecyclePermissions.read,
	facts: () => undefined,
	execute: () => "ok",
});
defineOperation({
	input: z.object({ id: z.string() }),
	permission: plainLifecyclePermissions.read,
	facts: () => undefined,
	// @ts-expect-error operation results must also use plain immutable data
	execute: () => new Date(),
});

// @ts-expect-error operation internals are only reachable through stack transports
operation.run({ id: "article-1" }, { internal: true });

const blogHooks: BlogBackendHooks = {
	onBeforeListPosts: (_filter, context) => {
		const readFactsAreExact: Expect<
			Equal<
				typeof context.facts,
				| { readonly scope: "published" }
				| { readonly scope: "drafts" }
				| {
						readonly scope: "post";
						readonly slug: string;
						readonly exists: boolean;
						readonly id?: string;
						readonly authorId?: string;
						readonly published: boolean;
				  }
			>
		> = true;
		void readFactsAreExact;
	},
	onBeforeUpdatePost: (_id, _data, context) => {
		const updateFactsAreExact: Expect<
			Equal<
				typeof context.facts,
				{
					readonly id: string;
					readonly authorId?: string;
					readonly publish: "unchanged" | "publish" | "unpublish";
				}
			>
		> = true;
		void updateFactsAreExact;
		// @ts-expect-error trusted publish transitions are readonly
		context.facts.publish = "publish";
	},
	onBeforeDeletePost: (_id, context) => {
		const identityIsHonest: Expect<
			Equal<typeof context.identity, DeepReadonly<StackIdentity> | null>
		> = true;
		const inputIsExact: Expect<
			Equal<typeof context.input, { readonly id: string }>
		> = true;
		const factsAreExact: Expect<
			Equal<
				typeof context.facts,
				{ readonly id: string; readonly authorId?: string }
			>
		> = true;
		const requestIsExact: Expect<
			Equal<typeof context.request, Request | undefined>
		> = true;
		void identityIsHonest;
		void inputIsExact;
		void factsAreExact;
		void requestIsExact;
		// @ts-expect-error authorized input cannot be changed after policy evaluation
		context.input.id = "another-post";
		if (context.identity) {
			// @ts-expect-error authorized identity cannot be changed by lifecycle hooks
			context.identity.id = "another-user";
		}
	},
	onPostDeleted: (_id, context) => {
		const resultIsExact: Expect<
			Equal<typeof context.result, { readonly success: true }>
		> = true;
		void resultIsExact;
		// @ts-expect-error lifecycle result references are readonly
		context.result = { success: true };
	},
	onDeletePostError: (_error, context) => {
		const errorInputIsExact: Expect<
			Equal<typeof context.input, { readonly id: string }>
		> = true;
		const errorFactsAreExact: Expect<
			Equal<
				typeof context.facts,
				{ readonly id: string; readonly authorId?: string }
			>
		> = true;
		void errorInputIsExact;
		void errorFactsAreExact;
	},
};
void blogHooks;

blogPermissions.post.read({ scope: "published" });
blogPermissions.post.read({
	scope: "post",
	slug: "hello",
	exists: true,
	id: "post-1",
	published: false,
});
// @ts-expect-error a post read needs server/browser visibility facts
blogPermissions.post.read({ scope: "post", slug: "hello" });
// @ts-expect-error publish transitions are a closed vocabulary
blogPermissions.post.update({ id: "post-1", publish: "toggle" });
blogPermissions.post.create({ publish: "draft" });
// @ts-expect-error create must declare the requested initial publish state
blogPermissions.post.create();
// @ts-expect-error create publish state is a closed vocabulary
blogPermissions.post.create({ publish: "publish" });

type BlogRouteOperations = Parameters<
	ReturnType<typeof blogBackendPlugin>["routes"]
>[2];
const declaredRouteOperationsAreRequired: Expect<
	Equal<undefined extends BlogRouteOperations ? true : false, false>
> = true;
void declaredRouteOperationsAreRequired;

const fakeAdapter = (_db: DatabaseDefinition) => ({}) as DBAdapter;

const passthroughOperation = definePassthroughOperation({
	input: z.object({ id: z.string() }),
	permission: registered.article.delete,
	access: "public",
	facts: ({ input }) => ({ id: input.id }),
	execute: () => new Response("stream"),
	after: ({ result }) => {
		const exactResponse: Expect<Equal<typeof result, Response>> = true;
		void exactResponse;
	},
});
const passthroughPlugin = defineBackendPlugin({
	name: "passthrough-fixture",
	dbPlugin: createDbPlugin("passthrough-fixture", {}),
	operations: () => ({ stream: passthroughOperation }),
	routes: () => ({}),
});
const passthroughStack = stack({
	basePath: "/api",
	plugins: { passthrough: passthroughPlugin },
	adapter: fakeAdapter,
	auth: serverAuth,
});
const passthroughResponse = passthroughStack
	.forRequest(new Request("https://example.test"))
	.api.passthrough.stream({ id: "article-1" });
const passthroughResponseIsExact: Expect<
	Equal<Awaited<typeof passthroughResponse>, Response>
> = true;
void passthroughResponseIsExact;
const blogAuthorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [blog.post.delete.allow()],
});
const blogServerAuth = createServerAuth({
	authorization: blogAuthorization,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});

const blogStack = stack({
	basePath: "/api",
	plugins: { blog: blogBackendPlugin() },
	adapter: fakeAdapter,
	auth: blogServerAuth,
});

type BlogOperationKeys = keyof typeof blogStack.internal.blog;
const blogOperationKeysAreExact: Expect<
	Equal<
		BlogOperationKeys,
		| "listPosts"
		| "createPost"
		| "updatePost"
		| "deletePost"
		| "getNextPreviousPosts"
		| "listTags"
	>
> = true;
void blogOperationKeysAreExact;

commentsPermissions.thread.read({
	scope: "public",
	resourceId: "post-1",
	resourceType: "post",
});
commentsPermissions.thread.read({ scope: "own", authorId: "user-1" });
commentsPermissions.thread.read({
	scope: "moderation",
	status: "pending",
});
// @ts-expect-error public reads require one concrete thread
commentsPermissions.thread.read({ scope: "public", resourceId: "post-1" });
// @ts-expect-error scopes are a closed vocabulary
commentsPermissions.thread.read({ scope: "team", authorId: "user-1" });
commentsPermissions.comment.moderate({
	commentId: "comment-1",
	resourceId: "post-1",
	resourceType: "post",
	currentStatus: "pending",
	// @ts-expect-error moderation status is schema-backed
	nextStatus: "published",
});

const commentsHooks: CommentsBackendHooks = {
	onBeforeEdit: (_id, _data, context) => {
		const editFactsAreExact: Expect<
			Equal<
				typeof context.facts,
				{
					readonly commentId: string;
					readonly authorId: string;
					readonly status: "pending" | "approved" | "spam";
				}
			>
		> = true;
		const inputIsExact: Expect<
			Equal<
				typeof context.input,
				{ readonly id: string; readonly data: { readonly body: string } }
			>
		> = true;
		void editFactsAreExact;
		void inputIsExact;
		// @ts-expect-error trusted ownership facts are readonly
		context.facts.authorId = "spoofed-owner";
	},
	onBeforeStatusChange: (_id, _status, context) => {
		const moderationFactsAreExact: Expect<
			Equal<
				typeof context.facts,
				{
					readonly commentId: string;
					readonly resourceId: string;
					readonly resourceType: string;
					readonly currentStatus: "pending" | "approved" | "spam";
					readonly nextStatus: "pending" | "approved" | "spam";
				}
			>
		> = true;
		void moderationFactsAreExact;
	},
};
void commentsHooks;

const kanbanHooks: KanbanBackendHooks = {
	onBoardsRead: (_boards, _query, context) => {
		const limit: number | undefined = context.result.limit;
		const offset: number | undefined = context.result.offset;
		void limit;
		void offset;
	},
};
void kanbanHooks;

const commentsAuthorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.enum(["user", "moderator"]) }),
	permissions: [commentsPermissions] as const,
	rules: ({ comments }) => [comments.comment.edit.allow()],
});
const commentsServerAuth = createServerAuth({
	authorization: commentsAuthorization,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});
const commentsStack = stack({
	basePath: "/api",
	plugins: { comments: commentsBackendPlugin() },
	adapter: fakeAdapter,
	auth: commentsServerAuth,
});

type CommentsOperationKeys = keyof typeof commentsStack.internal.comments;
const commentsOperationKeysAreExact: Expect<
	Equal<
		CommentsOperationKeys,
		| "listComments"
		| "getCommentCount"
		| "createComment"
		| "updateComment"
		| "toggleLike"
		| "updateCommentStatus"
		| "deleteComment"
	>
> = true;
void commentsOperationKeysAreExact;

commentsStack
	.forRequest(new Request("https://example.test"))
	.api.comments.updateComment({ id: "comment-1", data: { body: "Updated" } });
commentsStack.internal.comments.createComment({
	resourceId: "post-1",
	resourceType: "post",
	body: "Job comment",
	authorId: "job-1",
});
const requestComments = commentsStack.forRequest(
	new Request("https://example.test"),
).api.comments;
// @ts-expect-error raw getters are not exposed through request operations
requestComments.getCommentById("comment-1");
// @ts-expect-error raw getters are not exposed through the internal operation namespace
commentsStack.internal.comments.getCommentById("comment-1");
// @ts-expect-error raw mutation exports are not exposed through request operations
requestComments.toggleCommentLike("comment-1", "user-1");
// @ts-expect-error raw mutation exports are not exposed through the internal operation namespace
commentsStack.internal.comments.toggleCommentLike("comment-1", "user-1");
// @ts-expect-error app-authored raw prefetch is not a maintained request operation
requestComments.prefetchForRoute("/comments");
// @ts-expect-error app-authored raw prefetch is not an internal operation
commentsStack.internal.comments.prefetchForRoute("/comments");

stack({
	basePath: "/api",
	plugins: { comments: commentsBackendPlugin() },
	adapter: fakeAdapter,
	// @ts-expect-error Comments operations require the Comments permission catalog
	auth: unregisteredServerAuth,
});

blogStack.forRequest(new Request("https://example.test")).api.blog.listPosts({
	published: true,
});
blogStack.internal.blog.updatePost({
	id: "post-1",
	data: {
		title: "Title",
		content: "Content",
		excerpt: "Excerpt",
		slug: "title",
		published: false,
		tags: [],
	},
});
blogStack.forRequest(new Request("https://example.test")).api.blog.deletePost({
	id: "post-1",
	// @ts-expect-error request operations do not accept browser-supplied trusted facts
	authorId: "spoofed-owner",
});

const unregisteredAuthorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [unregistered] as const,
	rules: () => [],
});
const unregisteredServerAuth = createServerAuth({
	authorization: unregisteredAuthorization,
	getIdentity: () => ({ id: "user-1" }),
});

stack({
	basePath: "/api",
	plugins: { blog: blogBackendPlugin() },
	adapter: fakeAdapter,
	// @ts-expect-error Blog operations require the Blog permission catalog
	auth: unregisteredServerAuth,
});

const operationPlugin = defineBackendPlugin({
	name: "operation-fixture",
	dbPlugin: createDbPlugin("operation-fixture", {}),
	operations: () => ({ deleteArticle: operation }),
	routes: () => ({}),
});

stack({
	basePath: "/api",
	plugins: { operationFixture: operationPlugin },
	adapter: fakeAdapter,
	auth: serverAuth,
});

const incompatibleRegistered = definePermissions("registered", {
	article: {
		delete: permission(
			z.object({ id: z.string(), authorId: z.number().optional() }),
		),
	},
});
const incompatibleAuthorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [incompatibleRegistered] as const,
	rules: ({ registered }) => [registered.article.delete.allow()],
});
const incompatibleServerAuth = createServerAuth({
	authorization: incompatibleAuthorization,
	getIdentity: () => ({ id: "user-1" }),
});

stack({
	basePath: "/api",
	plugins: { operationFixture: operationPlugin },
	adapter: fakeAdapter,
	// @ts-expect-error matching ids with incompatible fact schemas are rejected
	auth: incompatibleServerAuth,
});
