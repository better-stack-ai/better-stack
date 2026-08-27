import { createMemoryAdapter } from "@btst/adapter-memory";
import { stack } from "@btst/stack";
import { createServerAuth } from "@btst/stack/authorization/server";
import {
	blogBackendPlugin,
	type BlogBackendHooks,
} from "@btst/stack/plugins/blog/api";
import { authorization } from "./authorization";

const exampleServerAuth = createServerAuth({
	authorization,
	getIdentityFromHeaders: ({ headers }) => {
		const token = (headers.get("cookie") ?? "")
			.split(";")
			.map((part) => part.trim())
			.find((part) => part.startsWith("better-auth.session_token="))
			?.slice("better-auth.session_token=".length);
		if (!token?.startsWith("mock-session-")) return null;
		const id = token.slice("mock-session-".length);
		return {
			id,
			role: id.startsWith("admin") ? ("admin" as const) : ("user" as const),
		};
	},
});

const blogLifecycleHooks: BlogBackendHooks = {
	onPostCreated: (post, context) => {
		console.log(
			`Post created: ${post.id} by ${context.identity?.id ?? "internal"}`,
		);
	},
	onPostUpdated: (post, context) => {
		console.log(
			`Post updated: ${post.id} by ${context.identity?.id ?? "internal"}`,
		);
	},
	onPostDeleted: (postId, context) => {
		console.log(
			`Post deleted: ${postId} by ${context.identity?.id ?? "internal"}`,
		);
	},
	onListPostsError: (error, context) => {
		console.error(
			`List posts failed for ${context.identity?.id ?? "internal"}:`,
			error.message,
		);
	},
	onCreatePostError: (error, context) => {
		console.error(
			`Create post failed for ${context.identity?.id ?? "internal"}:`,
			error.message,
		);
	},
	onUpdatePostError: (error, context) => {
		console.error(
			`Update post failed for ${context.identity?.id ?? "internal"}:`,
			error.message,
		);
	},
	onDeletePostError: (error, context) => {
		console.error(
			`Delete post failed for ${context.identity?.id ?? "internal"}:`,
			error.message,
		);
	},
};

const { handler, dbSchema } = stack({
	basePath: "/api/example-auth",
	auth: exampleServerAuth,
	plugins: { blog: blogBackendPlugin(blogLifecycleHooks) },
	adapter: (db) => createMemoryAdapter(db)({}),
});

export { handler, dbSchema };
