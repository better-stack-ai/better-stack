import { createMemoryAdapter } from "@btst/adapter-memory"
import { stack } from "@btst/stack"
import { blogBackendPlugin, type BlogBackendHooks } from "@btst/stack/plugins/blog/api"

/**
 * Mock session validation for testing
 * In production, replace with:
 * 
 * import { auth } from "./auth"
 * const session = await auth.api.getSession({ headers: context.headers })
 * return session?.user
 */
async function validateSession(headers?: Headers): Promise<{
	userId: string;
	role: string;
} | null> {
	if (!headers) {
		console.log("[Auth] No headers provided");
		return null;
	}

	// Get cookie header
	const cookieHeader = headers.get("cookie");
	if (!cookieHeader) {
		console.log("[Auth] No cookie header found");
		return null;
	}

	console.log("[Auth] Cookie header:", cookieHeader);

	// Parse cookies
	const cookies = cookieHeader.split(";").reduce(
		(acc, cookie) => {
			const [key, value] = cookie.trim().split("=");
			acc[key] = value;
			return acc;
		},
		{} as Record<string, string>,
	);

	// Check for auth cookie
	const sessionToken = cookies["better-auth.session_token"];
	if (!sessionToken) {
		console.log("[Auth] No session token found in cookies");
		return null;
	}

	console.log("[Auth] Session token found:", sessionToken);

	// Mock validation - in production, validate against your database
	if (sessionToken.startsWith("mock-session-")) {
		const userId = sessionToken.replace("mock-session-", "");

		// Mock role determination
		const role = userId.startsWith("admin") ? "admin" : "user";

		console.log(`[Auth] Session valid - User: ${userId}, Role: ${role}`);
		return { userId, role };
	}

	console.log("[Auth] Invalid session token");
	return null;
}

/**
 * Blog backend hooks with authentication
 * Demonstrates how headers (including cookies) are passed from loaders to API routes
 */
const authenticatedBlogHooks: BlogBackendHooks = {
	/**
	 * List posts - allow public posts without auth, require auth for drafts
	 */
	onBeforeListPosts: async (filter, context) => {
		console.log("[Auth Hook] onBeforeListPosts called");
		console.log("[Auth Hook] Filter:", filter);
		console.log("[Auth Hook] Has headers:", !!context.headers);

		// Public posts are always allowed
		if (filter.published === true) {
			console.log("[Auth Hook] ✅ Allowing public posts (no auth required)");
			return true;
		}

		// Drafts require authentication
		if (filter.published === false) {
			const session = await validateSession(context.headers);

			if (!session) {
				console.log("[Auth Hook] ❌ Blocking drafts - not authenticated");
				return false;
			}

			console.log(
				`[Auth Hook] ✅ Allowing drafts for user ${session.userId} (${session.role})`,
			);
			return true;
		}

		return true;
	},

	/**
	 * Create post - require authentication
	 */
	onBeforeCreatePost: async (data, context) => {
		console.log("[Auth Hook] onBeforeCreatePost called");
		console.log("[Auth Hook] Has headers:", !!context.headers);

		const session = await validateSession(context.headers);

		if (!session) {
			console.log("[Auth Hook] ❌ Blocking post creation - not authenticated");
			return false;
		}

		console.log(
			`[Auth Hook] ✅ Allowing post creation for user ${session.userId}`,
		);
		return true;
	},

	/**
	 * Update post - require authentication
	 */
	onBeforeUpdatePost: async (postId, data, context) => {
		console.log(`[Auth Hook] onBeforeUpdatePost called for post ${postId}`);
		console.log("[Auth Hook] Has headers:", !!context.headers);

		const session = await validateSession(context.headers);

		if (!session) {
			console.log("[Auth Hook] ❌ Blocking post update - not authenticated");
			return false;
		}

		// Optional: Check post ownership
		// const post = await getPostFromDatabase(postId);
		// if (post.authorId !== session.userId && session.role !== 'admin') {
		//   console.log('[Auth Hook] ❌ Blocking post update - not owner or admin');
		//   return false;
		// }

		console.log(
			`[Auth Hook] ✅ Allowing post update for user ${session.userId}`,
		);
		return true;
	},

	/**
	 * Delete post - require authentication
	 */
	onBeforeDeletePost: async (postId, context) => {
		console.log(`[Auth Hook] onBeforeDeletePost called for post ${postId}`);
		console.log("[Auth Hook] Has headers:", !!context.headers);

		const session = await validateSession(context.headers);

		if (!session) {
			console.log("[Auth Hook] ❌ Blocking post deletion - not authenticated");
			return false;
		}

		// Optional: Require admin role for deletion
		// if (session.role !== 'admin') {
		//   console.log('[Auth Hook] ❌ Blocking post deletion - not admin');
		//   return false;
		// }

		console.log(
			`[Auth Hook] ✅ Allowing post deletion for user ${session.userId}`,
		);
		return true;
	},

	/**
	 * Lifecycle hooks - log authenticated actions
	 */
	onPostCreated: async (post, context) => {
		const session = await validateSession(context.headers);
		console.log(
			`[Audit] Post created: ${post.id} by user ${session?.userId || "unknown"}`,
		);
	},

	onPostUpdated: async (post, context) => {
		const session = await validateSession(context.headers);
		console.log(
			`[Audit] Post updated: ${post.id} by user ${session?.userId || "unknown"}`,
		);
	},

	onPostDeleted: async (postId, context) => {
		const session = await validateSession(context.headers);
		console.log(
			`[Audit] Post deleted: ${postId} by user ${session?.userId || "unknown"}`,
		);
	},

	/**
	 * Error hooks - log authentication failures
	 */
	onListPostsError: async (error, context) => {
		const session = await validateSession(context.headers);
		console.error(
			`[Error] List posts failed for user ${session?.userId || "unknown"}:`,
			error.message,
		);
	},

	onCreatePostError: async (error, context) => {
		const session = await validateSession(context.headers);
		console.error(
			`[Error] Create post failed for user ${session?.userId || "unknown"}:`,
			error.message,
		);
	},

	onUpdatePostError: async (error, context) => {
		const session = await validateSession(context.headers);
		console.error(
			`[Error] Update post failed for user ${session?.userId || "unknown"}:`,
			error.message,
		);
	},

	onDeletePostError: async (error, context) => {
		const session = await validateSession(context.headers);
		console.error(
			`[Error] Delete post failed for user ${session?.userId || "unknown"}:`,
			error.message,
		);
	},
};

// Create BTST instance with authentication
const { handler, dbSchema } = stack({
	basePath: "/api/example-auth",
	plugins: {
		blog: blogBackendPlugin(authenticatedBlogHooks),
	},
	adapter: (db) => createMemoryAdapter(db)({}),
});

export { handler, dbSchema };

