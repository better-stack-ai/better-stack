import type { SearchProvider, SearchProviderResult } from "./types";

interface PublicPost {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly content: string;
	readonly excerpt: string;
	readonly published: boolean;
}
interface PublicCourse {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly description: string;
	readonly status: string;
}
interface PublicProduct {
	readonly id: string;
	readonly slug: string;
	readonly name: string;
	readonly description: string;
	readonly status: string;
}

/** Request-bound source operations, not raw getters or trusted operations. */
export interface BlogSearchOperations {
	listPosts(input: {
		query: string;
		published: true;
		limit: number;
		offset: number;
	}): Promise<{
		readonly items: readonly PublicPost[];
		readonly total: number;
	}>;
}
export interface SchoolSearchOperations {
	listCourses(input: {
		query: string;
	}): Promise<{ readonly items: readonly PublicCourse[] }>;
}
export interface EcommerceSearchOperations {
	listProducts(input: {
		search: string;
		limit: number;
		offset: number;
	}): Promise<{
		readonly items: readonly PublicProduct[];
		readonly total: number;
	}>;
}
interface SourceOptions<Operations> {
	operations(request: Request): Operations;
	/** Complete site-relative mount, including the framework page prefix. */
	basePath?: string;
}

/**
 * Convert the first 2,000 UTF-16 code units of source markup to plain text.
 * Bound input before regex work so malformed markup cannot trigger unbounded scans.
 */
export function searchSnippet(value: string): string {
	return value
		.slice(0, 2000)
		.replace(/<[^>]*>/g, " ")
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*_#>~]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 240);
}
function destination(basePath: string, slug: string) {
	return `${basePath.replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
}

/** Reuses Blog's publication filter and domain text matching. */
export function blogSearchProvider(
	options: SourceOptions<BlogSearchOperations>,
): SearchProvider {
	return {
		id: "blog",
		label: "Blog",
		async search({ q, limit, request }) {
			const operations = options.operations(request);
			const items: SearchProviderResult[] = [];
			let omittedDestination = false;
			let total = 0;
			for (let offset = 0; offset < limit; offset += 100) {
				const page = await operations.listPosts({
					query: q,
					published: true,
					limit: Math.min(100, limit - offset),
					offset,
				});
				total = page.total;
				for (const post of page.items) {
					if (!post.published) continue;
					const href = destination(
						options.basePath ?? "/pages/blog",
						post.slug,
					);
					if (href.length > 2000) {
						omittedDestination = true;
						continue;
					}
					items.push({
						resourceId: post.id,
						title: post.title.slice(0, 500),
						snippet: searchSnippet(post.excerpt || post.content),
						href,
					});
				}
				if (offset + page.items.length >= total || page.items.length === 0)
					break;
			}
			return { items, hasMore: total > limit || omittedDestination };
		},
	};
}

/** Uses only the public School catalog; lessons never participate. */
export function schoolSearchProvider(
	options: SourceOptions<SchoolSearchOperations>,
): SearchProvider {
	return {
		id: "school",
		label: "Courses",
		async search({ q, limit, request }) {
			const page = await options.operations(request).listCourses({ query: q });
			const courses = page.items
				.filter((course) => course.status === "published")
				.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
			return {
				items: courses.slice(0, limit).map((course) => ({
					resourceId: course.id,
					title: course.title,
					snippet: searchSnippet(course.description),
					href: destination(options.basePath ?? "/pages/learn", course.slug),
				})),
				hasMore: courses.length > limit,
			};
		},
	};
}

/** Uses Ecommerce's public product projection, including its visibility rules. */
export function ecommerceSearchProvider(
	options: SourceOptions<EcommerceSearchOperations>,
): SearchProvider {
	return {
		id: "ecommerce",
		label: "Products",
		async search({ q, limit, request }) {
			const operations = options.operations(request);
			const items: SearchProviderResult[] = [];
			let total = 0;
			for (let offset = 0; offset < limit; offset += 100) {
				const page = await operations.listProducts({
					search: q,
					limit: Math.min(100, limit - offset),
					offset,
				});
				total = page.total;
				for (const product of page.items) {
					if (product.status !== "published") continue;
					items.push({
						resourceId: product.id,
						title: product.name,
						snippet: searchSnippet(product.description),
						href: destination(
							options.basePath ?? "/pages/shop/products",
							product.slug,
						),
					});
				}
				if (offset + page.items.length >= total || page.items.length === 0)
					break;
			}
			return { items, hasMore: total > limit };
		},
	};
}

/**
 * An explicit application-owned CMS public projection. No content types are
 * searchable by default; domain-owned types must use their domain provider.
 */
export function cmsSearchProvider(options: {
	typeSlug: string;
	label: string;
	search: SearchProvider["search"];
}): SearchProvider {
	if (
		/^(school-|ecommerce-|job-|helpdesk-|crm-|ai-chat|knowledge-base)/.test(
			options.typeSlug,
		)
	) {
		throw new Error(
			"Domain-owned content types require their public domain projection",
		);
	}
	return {
		id: `cms-${options.typeSlug}`,
		label: options.label,
		search: options.search,
	};
}
