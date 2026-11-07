export type Post = {
	id: string;
	/** Server-maintained optimistic concurrency token; legacy posts start at zero. */
	revisionVersion?: number;
	authorId?: string;
	defaultLocale?: string;
	slug: string;
	title: string;
	content: string;
	excerpt: string;
	image?: string;
	published: boolean;
	status?: "DRAFT" | "PUBLISHED";
	tags: Tag[];
	publishedAt?: Date;
	createdAt: Date;
	updatedAt: Date;
};

export type Tag = {
	id: string;
	slug: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
};

/**
 * Post with joined postTag relationships from the database
 */
export type PostWithPostTag = Post & {
	postTag?: Array<{ postId: string; tagId: string }>;
};

export interface SerializedPost
	extends Omit<Post, "createdAt" | "updatedAt" | "publishedAt" | "tags"> {
	tags: SerializedTag[];
	publishedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export interface SerializedTag extends Omit<Tag, "createdAt" | "updatedAt"> {
	createdAt: string;
	updatedAt: string;
}

export type PostRevisionTag = Pick<Tag, "id" | "name" | "slug">;

export type PostRevision = Pick<
	Post,
	| "title"
	| "content"
	| "excerpt"
	| "slug"
	| "image"
	| "published"
	| "publishedAt"
> & {
	id: string;
	postId: string;
	version: number;
	actorId?: string;
	createdAt: Date;
	tags: PostRevisionTag[];
};

export interface SerializedPostRevision
	extends Omit<PostRevision, "createdAt" | "publishedAt"> {
	createdAt: string;
	publishedAt?: string;
}
