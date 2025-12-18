import {
	defineClientPlugin,
	createApiClient,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { BlogApiRouter } from "../api";
import { createBlogQueryKeys } from "../query-keys";
import type { Post, SerializedPost, SerializedTag } from "../types";
import { HomePageComponent } from "./components/pages/home-page";
import { NewPostPageComponent } from "./components/pages/new-post-page";
import { EditPostPageComponent } from "./components/pages/edit-post-page";
import { TagPageComponent } from "./components/pages/tag-page";
import { PostPageComponent } from "./components/pages/post-page";

/**
 * Context passed to route hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { slug: "my-post" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: any;
}

/**
 * Context passed to loader hooks
 */
export interface LoaderContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { slug: "my-post" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Base URL for API calls */
	apiBaseURL: string;
	/** Path where the API is mounted */
	apiBasePath: string;
	/** Optional headers for the request */
	headers?: Headers;
	/** Additional context properties */
	[key: string]: any;
}

/**
 * Configuration for blog client plugin
 * Note: queryClient is passed at runtime to both loader and meta (for SSR isolation)
 */
export interface BlogClientConfig {
	/** Base URL for API calls (e.g., "http://localhost:3000") */
	apiBaseURL: string;
	/** Path where the API is mounted (e.g., "/api/data") */
	apiBasePath: string;
	/** Base URL of your site for SEO meta tags */
	siteBaseURL: string;
	/** Path where pages are mounted (e.g., "/pages") */
	siteBasePath: string;
	/** React Query client instance for caching */
	queryClient: QueryClient;

	/** Optional SEO configuration for meta tags */
	seo?: {
		/** Site name for Open Graph tags */
		siteName?: string;
		/** Default author name */
		author?: string;
		/** Twitter handle (e.g., "@yourhandle") */
		twitterHandle?: string;
		/** Locale for Open Graph (e.g., "en_US") */
		locale?: string;
		/** Default image URL for social sharing */
		defaultImage?: string;
	};

	/** Optional hooks for customizing behavior */
	hooks?: BlogClientHooks;

	/** Optional headers for SSR (e.g., forwarding cookies) */
	headers?: Headers;
}

/**
 * Hooks for blog client plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface BlogClientHooks {
	/**
	 * Called before loading posts list. Return false to cancel loading.
	 * @param filter - Filter parameters including published status
	 * @param context - Loader context with path, params, etc.
	 */
	beforeLoadPosts?: (
		filter: { published: boolean },
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called after posts are loaded. Return false to cancel further processing.
	 * @param posts - Array of loaded posts or null
	 * @param filter - Filter parameters used
	 * @param context - Loader context
	 */
	afterLoadPosts?: (
		posts: Post[] | null,
		filter: { published: boolean },
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before loading a single post. Return false to cancel loading.
	 * @param slug - Post slug being loaded
	 * @param context - Loader context
	 */
	beforeLoadPost?: (
		slug: string,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called after a post is loaded. Return false to cancel further processing.
	 * @param post - Loaded post or null if not found
	 * @param slug - Post slug that was requested
	 * @param context - Loader context
	 */
	afterLoadPost?: (
		post: Post | null,
		slug: string,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called before loading the new post page. Return false to cancel.
	 * @param context - Loader context
	 */
	beforeLoadNewPost?: (context: LoaderContext) => Promise<boolean> | boolean;
	/**
	 * Called after the new post page is loaded. Return false to cancel.
	 * @param context - Loader context
	 */
	afterLoadNewPost?: (context: LoaderContext) => Promise<boolean> | boolean;
	/**
	 * Called when a loading error occurs
	 * @param error - The error that occurred
	 * @param context - Loader context
	 */
	onLoadError?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

// Loader for SSR prefetching with hooks - configured once
function createPostsLoader(published: boolean, config: BlogClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: published ? "/blog" : "/blog/drafts",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook
				if (hooks?.beforeLoadPosts) {
					const canLoad = await hooks.beforeLoadPosts({ published }, context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadPosts hook");
					}
				}

				const limit = 10;
				const client = createApiClient<BlogApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});

				// note: for a module not to be bundled with client, and to be shared by client and server we need to add it to build.config.ts as an entry
				const queries = createBlogQueryKeys(client, headers);
				const listQuery = queries.posts.list({
					query: undefined,
					limit,
					published: published,
				});

				await queryClient.prefetchInfiniteQuery({
					...listQuery,
					initialPageParam: 0,
				});

				// Prefetch tags
				const tagsQuery = queries.tags.list();
				await queryClient.prefetchQuery(tagsQuery);

				// Don't throw errors during SSR - let Error Boundaries catch them when components render
				// React Query stores errors in query state, and Suspense/Error Boundaries handle them
				// Note: We still call hooks so consumers can log/track errors

				// After hook - get data from queryClient if needed
				if (hooks?.afterLoadPosts) {
					const posts =
						queryClient.getQueryData<Post[]>(listQuery.queryKey) || null;
					const canContinue = await hooks.afterLoadPosts(
						posts,
						{ published },
						context,
					);
					if (canContinue === false) {
						throw new Error("Load prevented by afterLoadPosts hook");
					}
				}

				// Check if there was an error after afterLoadPosts hook
				const queryState = queryClient.getQueryState(listQuery.queryKey);
				if (queryState?.error) {
					// Call error hook but don't throw - let Error Boundary handle it during render
					if (hooks?.onLoadError) {
						const error =
							queryState.error instanceof Error
								? queryState.error
								: new Error(String(queryState.error));
						await hooks.onLoadError(error, context);
					}
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
				// Don't re-throw - let Error Boundary catch it during render
			}
		}
	};
}

function createPostLoader(
	slug: string,
	config: BlogClientConfig,
	path?: string,
) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: path ?? `/blog/${slug}`,
				params: { slug },
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook
				if (hooks?.beforeLoadPost) {
					const canLoad = await hooks.beforeLoadPost(slug, context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadPost hook");
					}
				}

				const client = createApiClient<BlogApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createBlogQueryKeys(client, headers);
				const postQuery = queries.posts.detail(slug);
				await queryClient.prefetchQuery(postQuery);

				// Don't throw errors during SSR - let Error Boundaries catch them when components render
				// React Query stores errors in query state, and Suspense/Error Boundaries handle them
				// Note: We still call hooks so consumers can log/track errors

				// After hook
				if (hooks?.afterLoadPost) {
					const post =
						queryClient.getQueryData<Post>(postQuery.queryKey) || null;
					const canContinue = await hooks.afterLoadPost(post, slug, context);
					if (canContinue === false) {
						throw new Error("Load prevented by afterLoadPost hook");
					}
				}

				// Check if there was an error after afterLoadPost hook
				const queryState = queryClient.getQueryState(postQuery.queryKey);
				if (queryState?.error) {
					// Call error hook but don't throw - let Error Boundary handle it during render
					if (hooks?.onLoadError) {
						const error =
							queryState.error instanceof Error
								? queryState.error
								: new Error(String(queryState.error));
						await hooks.onLoadError(error, context);
					}
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
				// Don't re-throw - let Error Boundary catch it during render
			}
		}
	};
}

function createNewPostLoader(config: BlogClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: "/blog/new",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook
				if (hooks?.beforeLoadNewPost) {
					const canLoad = await hooks.beforeLoadNewPost(context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadNewPost hook");
					}
				}

				// After hook
				if (hooks?.afterLoadNewPost) {
					const canContinue = await hooks.afterLoadNewPost(context);
					if (canContinue === false) {
						throw new Error("Load prevented by afterLoadNewPost hook");
					}
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				// Let Error Boundaries handle errors when components render
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
				// Don't re-throw - let Error Boundary catch it during render
			}
		}
	};
}

function createTagLoader(tagSlug: string, config: BlogClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, hooks, headers } = config;

			const context: LoaderContext = {
				path: `/blog/tag/${tagSlug}`,
				params: { tagSlug },
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				const limit = 10;
				const client = createApiClient<BlogApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});

				const queries = createBlogQueryKeys(client, headers);
				const listQuery = queries.posts.list({
					query: undefined,
					limit,
					published: true,
					tagSlug: tagSlug,
				});

				await queryClient.prefetchInfiniteQuery({
					...listQuery,
					initialPageParam: 0,
				});

				const tagsQuery = queries.tags.list();
				await queryClient.prefetchQuery(tagsQuery);

				// Check if there was an error in either query
				const listState = queryClient.getQueryState(listQuery.queryKey);
				const tagsState = queryClient.getQueryState(tagsQuery.queryKey);
				const queryError = listState?.error || tagsState?.error;
				if (queryError && hooks?.onLoadError) {
					const error =
						queryError instanceof Error
							? queryError
							: new Error(String(queryError));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

// Meta generators with SEO optimization
function createPostsListMeta(published: boolean, config: BlogClientConfig) {
	return () => {
		const { siteBaseURL, siteBasePath, seo } = config;
		const path = published ? "/blog" : "/blog/drafts";
		const fullUrl = `${siteBaseURL}${siteBasePath}${path}`;
		const title = published ? "Blog" : "Draft Posts";
		const description = published
			? "Read our latest articles, insights, and updates on web development, technology, and more."
			: "View and manage your draft blog posts.";

		return [
			// Primary meta tags
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			{
				name: "keywords",
				content: "blog, articles, technology, web development, insights",
			},
			...(seo?.author ? [{ name: "author", content: seo.author }] : []),
			{
				name: "robots",
				content: published ? "index, follow" : "noindex, nofollow",
			},

			// Open Graph / Facebook
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: fullUrl },
			...(seo?.siteName
				? [{ property: "og:site_name", content: seo.siteName }]
				: []),
			...(seo?.locale ? [{ property: "og:locale", content: seo.locale }] : []),
			...(seo?.defaultImage
				? [{ property: "og:image", content: seo.defaultImage }]
				: []),

			// Twitter Card
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			...(seo?.twitterHandle
				? [{ name: "twitter:site", content: seo.twitterHandle }]
				: []),
		];
	};
}

function createPostMeta(slug: string, config: BlogClientConfig) {
	return () => {
		// Use queryClient passed at runtime (same as loader!)
		const { queryClient } = config;
		const { apiBaseURL, apiBasePath, siteBaseURL, siteBasePath, seo } = config;
		const queries = createBlogQueryKeys(
			createApiClient<BlogApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			}),
		);
		const post = queryClient.getQueryData<Post>(
			queries.posts.detail(slug).queryKey,
		);

		if (!post) {
			// Fallback if post not loaded
			return [
				{ title: "Unknown route" },
				{ name: "title", content: "Unknown route" },
				{ name: "robots", content: "noindex" },
			];
		}

		const fullUrl = `${siteBaseURL}${siteBasePath}/blog/${post.slug}`;
		const title = post.title;
		const description = post.excerpt || post.content.substring(0, 160);
		const publishedTime = post.publishedAt
			? new Date(post.publishedAt).toISOString()
			: new Date(post.createdAt).toISOString();
		const modifiedTime = new Date(post.updatedAt).toISOString();
		const image = post.image || seo?.defaultImage;

		return [
			// Primary meta tags
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			...(post.authorId || seo?.author
				? [{ name: "author", content: post.authorId || seo?.author }]
				: []),
			{
				name: "robots",
				content: post.published ? "index, follow" : "noindex, nofollow",
			},
			{
				name: "keywords",
				content: `blog, article, ${post.slug.replace(/-/g, ", ")}`,
			},

			// Open Graph / Facebook
			{ property: "og:type", content: "article" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: fullUrl },
			...(seo?.siteName
				? [{ property: "og:site_name", content: seo.siteName }]
				: []),
			...(seo?.locale ? [{ property: "og:locale", content: seo.locale }] : []),
			...(image ? [{ property: "og:image", content: image }] : []),
			...(image
				? [
						{ property: "og:image:width", content: "1200" },
						{ property: "og:image:height", content: "630" },
						{ property: "og:image:alt", content: title },
					]
				: []),

			// Article-specific Open Graph tags
			{ property: "article:published_time", content: publishedTime },
			{ property: "article:modified_time", content: modifiedTime },
			...(post.authorId
				? [{ property: "article:author", content: post.authorId }]
				: []),

			// Twitter Card
			{
				name: "twitter:card",
				content: image ? "summary_large_image" : "summary",
			},
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			...(seo?.twitterHandle
				? [{ name: "twitter:site", content: seo.twitterHandle }]
				: []),
			...(post.authorId || seo?.twitterHandle
				? [
						{
							name: "twitter:creator",
							content: post.authorId || seo?.twitterHandle,
						},
					]
				: []),
			...(image ? [{ name: "twitter:image", content: image }] : []),
			...(image ? [{ name: "twitter:image:alt", content: title }] : []),

			// Additional SEO tags
			{ name: "publish_date", content: publishedTime },
		];
	};
}

function createTagMeta(tagSlug: string, config: BlogClientConfig) {
	return () => {
		const { queryClient } = config;
		const { apiBaseURL, apiBasePath, siteBaseURL, siteBasePath, seo } = config;
		const queries = createBlogQueryKeys(
			createApiClient<BlogApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			}),
		);
		const tags = queryClient.getQueryData<SerializedTag[]>(
			queries.tags.list().queryKey,
		);
		const tag = tags?.find((t) => t.slug === tagSlug);

		if (!tag) {
			return [
				{ title: "Unknown route" },
				{ name: "title", content: "Unknown route" },
				{ name: "robots", content: "noindex" },
			];
		}

		const fullUrl = `${siteBaseURL}${siteBasePath}/blog/tag/${tag.slug}`;
		const title = `${tag.name} Posts`;
		const description = `Browse all ${tag.name} posts`;

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			{ name: "robots", content: "index, follow" },
			{ name: "keywords", content: `blog, ${tag.name}, articles` },
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: fullUrl },
			...(seo?.siteName
				? [{ property: "og:site_name", content: seo.siteName }]
				: []),
			...(seo?.defaultImage
				? [{ property: "og:image", content: seo.defaultImage }]
				: []),
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
		];
	};
}

function createNewPostMeta(config: BlogClientConfig) {
	return () => {
		const { siteBaseURL, siteBasePath } = config;
		const fullUrl = `${siteBaseURL}${siteBasePath}/blog/new`;

		const title = "Create New Post";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: "Write and publish a new blog post." },
			{ name: "robots", content: "noindex, nofollow" },

			// Open Graph
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{
				property: "og:description",
				content: "Write and publish a new blog post.",
			},
			{ property: "og:url", content: fullUrl },

			// Twitter
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
		];
	};
}

function createEditPostMeta(slug: string, config: BlogClientConfig) {
	return () => {
		// Use queryClient passed at runtime (same as loader!)
		const { queryClient } = config;
		const { apiBaseURL, apiBasePath, siteBaseURL, siteBasePath } = config;
		const queries = createBlogQueryKeys(
			createApiClient<BlogApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			}),
		);
		const post = queryClient.getQueryData<Post>(
			queries.posts.detail(slug).queryKey,
		);
		const fullUrl = `${siteBaseURL}${siteBasePath}/blog/${slug}/edit`;

		const title = post ? `Edit: ${post.title}` : "Unknown route";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: "Edit your blog post." },
			{ name: "robots", content: "noindex, nofollow" },

			// Open Graph
			{ property: "og:type", content: "website" },
			{ property: "og:title", content: title },
			{ property: "og:url", content: fullUrl },

			// Twitter
			{ name: "twitter:card", content: "summary" },
			{ name: "twitter:title", content: title },
		];
	};
}

/**
 * Blog client plugin
 * Provides routes, components, and React Query hooks for blog posts
 *
 * @param config - Configuration including queryClient, baseURL, and optional hooks
 */
export const blogClientPlugin = (config: BlogClientConfig) =>
	defineClientPlugin({
		name: "blog",

		routes: () => ({
			posts: createRoute("/blog", () => {
				return {
					PageComponent: () => <HomePageComponent published={true} />,
					loader: createPostsLoader(true, config),
					meta: createPostsListMeta(true, config),
				};
			}),
			drafts: createRoute("/blog/drafts", () => {
				return {
					PageComponent: () => <HomePageComponent published={false} />,
					loader: createPostsLoader(false, config),
					meta: createPostsListMeta(false, config),
				};
			}),
			newPost: createRoute("/blog/new", () => {
				return {
					PageComponent: NewPostPageComponent,
					loader: createNewPostLoader(config),
					meta: createNewPostMeta(config),
				};
			}),
			editPost: createRoute("/blog/:slug/edit", ({ params: { slug } }) => {
				return {
					PageComponent: () => <EditPostPageComponent slug={slug} />,
					loader: createPostLoader(slug, config, `/blog/${slug}/edit`),
					meta: createEditPostMeta(slug, config),
				};
			}),
			tag: createRoute("/blog/tag/:tagSlug", ({ params: { tagSlug } }) => {
				return {
					PageComponent: () => <TagPageComponent tagSlug={tagSlug} />,
					loader: createTagLoader(tagSlug, config),
					meta: createTagMeta(tagSlug, config),
				};
			}),
			post: createRoute("/blog/:slug", ({ params: { slug } }) => {
				return {
					PageComponent: () => <PostPageComponent slug={slug} />,
					loader: createPostLoader(slug, config),
					meta: createPostMeta(slug, config),
				};
			}),
		}),

		sitemap: async () => {
			const origin = `${config.siteBaseURL}${config.siteBasePath}`;
			const indexUrl = `${origin}/blog`;

			// Fetch all published posts via API, with pagination
			const client = createApiClient<BlogApiRouter>({
				baseURL: config.apiBaseURL,
				basePath: config.apiBasePath,
			});

			const limit = 100;
			let offset = 0;
			const posts: SerializedPost[] = [];
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const res = await client("/posts", {
					method: "GET",
					query: {
						offset,
						limit,
						published: "true",
					},
				});
				const page = (res.data ?? []) as unknown as SerializedPost[];
				posts.push(...page);
				if (page.length < limit) break;
				offset += limit;
			}

			// Fetch all tags
			const tagsRes = await client("/tags", {
				method: "GET",
			});
			const tags = (tagsRes.data ?? []) as unknown as SerializedTag[];

			const getLastModified = (p: SerializedPost): Date | undefined => {
				const dates = [p.updatedAt, p.publishedAt, p.createdAt].filter(
					Boolean,
				) as string[];
				if (dates.length === 0) return undefined;
				const times = dates
					.map((d) => new Date(d).getTime())
					.filter((t) => !Number.isNaN(t));
				if (times.length === 0) return undefined;
				return new Date(Math.max(...times));
			};

			const latestTime = posts
				.map((p) => getLastModified(p)?.getTime() ?? 0)
				.reduce((a, b) => Math.max(a, b), 0);

			const entries = [
				{
					url: indexUrl,
					lastModified: latestTime ? new Date(latestTime) : undefined,
					changeFrequency: "daily" as const,
					priority: 0.7,
				},
				...posts.map((p) => ({
					url: `${origin}/blog/${p.slug}`,
					lastModified: getLastModified(p),
					changeFrequency: "monthly" as const,
					priority: 0.6,
				})),
				...tags.map((t) => ({
					url: `${origin}/blog/tag/${t.slug}`,
					lastModified: t.updatedAt ? new Date(t.updatedAt) : undefined,
					changeFrequency: "weekly" as const,
					priority: 0.5,
				})),
			];

			return entries;
		},
	});
