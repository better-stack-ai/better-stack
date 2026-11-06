import type { ComponentType } from "react";

/** Real employer information used in JobPosting structured data. */
export interface JobBoardOrganization {
	name: string;
	url?: string;
	logo?: string;
}

/** Public route being prefetched on the server. */
export interface JobBoardLoaderContext {
	routeName: "list" | "detail" | "department";
	path: string;
	params?: Record<string, string>;
	isSSR: boolean;
}

/** Optional server-prefetch lifecycle callbacks; errors remain in the query cache. */
export interface JobBoardClientHooks {
	beforeLoad?: (context: JobBoardLoaderContext) => void | Promise<void>;
	afterLoad?: (context: JobBoardLoaderContext) => void | Promise<void>;
	onErrorLoad?: (
		error: Error,
		context: JobBoardLoaderContext,
	) => void | Promise<void>;
}

/** Job Board choices; shared API, site and QueryClient values come from the stack. */
export interface JobBoardClientConfig {
	/** Supply the actual employer to include hiringOrganization in structured data. */
	organization?: JobBoardOrganization;
	hooks?: JobBoardClientHooks;
	/** Replace public pages while preserving their routes, loaders and metadata. */
	pageComponents?: {
		list?: ComponentType;
		detail?: ComponentType<{ params: { slug: string } }>;
		department?: ComponentType<{ params: { dept: string } }>;
	};
}

/** Serializable factory values available to the built-in public pages. */
export interface JobBoardProviderConfig {
	organization?: JobBoardOrganization;
}
