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
/** Shared discovery normalization; punctuation and combining marks do not affect rank. */
export function normalizeSearchText(value: string): string {
	return value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, "");
}

/** Lower values rank first. Providers still own matching and visibility. */
export function searchRelevance(
	result: SearchProviderResult,
	query: string,
): number {
	const q = normalizeSearchText(query);
	if (!q) return 9;
	const title = normalizeSearchText(result.title);
	const aliases = result.aliases?.map(normalizeSearchText) ?? [];
	if (title === q) return 0;
	if (aliases.includes(q)) return 1;
	if (title.startsWith(q)) return 2;
	if (aliases.some((alias) => alias.startsWith(q))) return 3;
	if (title.includes(q)) return 4;
	if (aliases.some((alias) => alias.includes(q))) return 5;
	// Keep word boundaries for term coverage; normalization alone joins words.
	const terms = [
		...new Set(query.split(/\s+/).map(normalizeSearchText).filter(Boolean)),
	];
	const containsTerms = (value: string) => {
		const words = value.split(/\s+/).map(normalizeSearchText);
		return terms.every((term) => words.some((word) => word.includes(term)));
	};
	if (containsTerms(result.title)) return 6;
	if (result.aliases?.some(containsTerms)) return 7;
	return normalizeSearchText(result.snippet).includes(q) ? 8 : 9;
}

function destination(basePath: string, slug: string) {
	return `${basePath.replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
}

/** Reuses Blog's publication filter and domain text matching. */
export function blogSearchProvider(
	options: SourceOptions<BlogSearchOperations> & {
		/** Opt into 201 only with a Blog release whose list operation accepts it. */
		batchSize?: 100 | 201;
	},
): SearchProvider {
	return {
		id: "blog",
		label: "Blog",
		async search({ q, limit, request }) {
			const operations = options.operations(request);
			const batchSize = options.batchSize ?? 100;
			const items: SearchProviderResult[] = [];
			let omittedDestination = false;
			let total = 0;
			for (let offset = 0; offset < limit; offset += batchSize) {
				const page = await operations.listPosts({
					query: q,
					published: true,
					limit: Math.min(batchSize, limit - offset),
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
