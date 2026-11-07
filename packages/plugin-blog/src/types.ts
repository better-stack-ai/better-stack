export type Post = {
	id: string;
	/** Server-maintained optimistic concurrency token; legacy posts start at zero. */
	revisionVersion?: number;
	/** Persisted protection marker. Disabling configuration never exposes working content. */
	editorialEnabled?: boolean;
	/** Changes on every review transition and content save. */
	editorialVersion?: number;
	editorialStatus?: EditorialStatus;
	editorialSubmittedRevisionId?: string | null;
	editorialApprovedRevisionId?: string | null;
	editorialLiveRevisionId?: string | null;
	editorialLiveSlug?: string | null;
	editorialActorId?: string | null;
	editorialUpdatedAt?: Date | null;
	editorialComment?: string | null;
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
	extends Omit<
		Post,
		| "createdAt"
		| "updatedAt"
		| "publishedAt"
		| "tags"
		| "editorialEnabled"
		| "editorialVersion"
		| "editorialStatus"
		| "editorialSubmittedRevisionId"
		| "editorialApprovedRevisionId"
		| "editorialLiveRevisionId"
		| "editorialLiveSlug"
		| "editorialActorId"
		| "editorialUpdatedAt"
		| "editorialComment"
	> {
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

/** Current review state; publication is tracked separately by the live revision. */
export type EditorialStatus =
	| "draft"
	| "submitted"
	| "changes-requested"
	| "approved";
/** Authorized editorial operation emitted through lifecycle hooks. */
export type EditorialAction =
	| "submit"
	| "requestChanges"
	| "approve"
	| "publish";
/** Private review metadata returned only through editor operations and writes. */
export interface EditorialState {
	enabled: boolean;
	status: EditorialStatus;
	version: number;
	revisionId?: string;
	submittedRevisionId?: string;
	approvedRevisionId?: string;
	liveRevisionId?: string;
	liveSlug?: string;
	/** Identity responsible for the most recent save or editorial transition. */
	actorId?: string;
	/** Server timestamp of that save or transition, rather than an approval timestamp. */
	updatedAt?: string;
	comment?: string;
}
/** Working content and its revision-bound review state. Never seed a public detail cache with this shape. */
export interface SerializedEditorialPost extends SerializedPost {
	editorial: EditorialState;
}
