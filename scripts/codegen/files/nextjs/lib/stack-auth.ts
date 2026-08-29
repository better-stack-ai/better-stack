import "server-only";

import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack";
import { createServerAuth } from "@btst/stack/authorization/server";
import {
	blogBackendPlugin,
	type BlogBackendHooks,
} from "@btst/stack/plugins/blog/api";
import { authorization } from "./authorization";

const exampleServerAuth = createServerAuth({
	authorization,
	getIdentityFromHeaders: ({ headers }) => {
		const cookie = headers.get("cookie") ?? "";
		const token = cookie
			.split(";")
			.map((part) => part.trim())
			.find((part) => part.startsWith("better-auth.session_token="))
			?.slice("better-auth.session_token=".length);
		if (!token?.startsWith("mock-session-")) return null;
		const id = token.slice("mock-session-".length);
		return {
			id,
			role: id.startsWith("admin") ? ("admin" as const) : ("user" as const),
			organizationIds: [],
		};
	},
});

const blogLifecycleHooks: BlogBackendHooks = {
	onAfterCreatePost: (post, context) => {
		console.log(
			`Post created: ${post.id} by ${context.identity?.id ?? "anonymous-or-trusted"}`,
		);
	},
	onAfterUpdatePost: (post, context) => {
		console.log(
			`Post updated: ${post.id} by ${context.identity?.id ?? "anonymous-or-trusted"}`,
		);
	},
	onAfterDeletePost: (postId, context) => {
		console.log(
			`Post deleted: ${postId} by ${context.identity?.id ?? "anonymous-or-trusted"}`,
		);
	},
	onErrorListPosts: (error, context) => {
		console.error(
			`List posts failed for ${context.identity?.id ?? "anonymous-or-trusted"}:`,
			error.message,
		);
	},
	onErrorCreatePost: (error, context) => {
		console.error(
			`Create post failed for ${context.identity?.id ?? "anonymous-or-trusted"}:`,
			error.message,
		);
	},
	onErrorUpdatePost: (error, context) => {
		console.error(
			`Update post failed for ${context.identity?.id ?? "anonymous-or-trusted"}:`,
			error.message,
		);
	},
	onErrorDeletePost: (error, context) => {
		console.error(
			`Delete post failed for ${context.identity?.id ?? "anonymous-or-trusted"}:`,
			error.message,
		);
	},
};

const { handler, dbSchema } = createBackendStack({
	basePath: "/api/example-auth",
	auth: exampleServerAuth,
	plugins: { blog: blogBackendPlugin({ hooks: blogLifecycleHooks }) },
	adapter: (db) => createMemoryAdapter(db)({}),
});

export { handler, dbSchema };
