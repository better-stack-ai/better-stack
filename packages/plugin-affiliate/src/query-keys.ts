import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type {
	Affiliate,
	AffiliatePortal,
	AffiliateStats,
	Commission,
	CreateAffiliateInput,
	CreatePayoutInput,
	ListParams,
	ListResult,
	Payout,
	UpdateAffiliateInput,
} from "./types";

export type AffiliateApplicationInput = Omit<CreateAffiliateInput, "userId">;
export type AffiliatePortalInput = Pick<
	UpdateAffiliateInput,
	"name" | "email" | "code" | "payoutDetails"
>;

const invalidates = [
	"affiliates",
	"affiliatePortal",
	"affiliateCommissions",
	"affiliatePayouts",
];

/** Shared declarations keep client hooks and server query consumers on the same keys. */
export const affiliateResources = {
	affiliates: {
		queries: {
			list: {
				path: "/affiliate/affiliates",
				query: (params: ListParams = {}, _partition?: unknown) => ({
					...params,
				}),
				select: (data: unknown): ListResult<Affiliate> =>
					data as ListResult<Affiliate>,
			},
			detail: {
				path: "/affiliate/affiliates/:id",
				params: (id: string, _partition?: unknown) => ({ id }),
				select: (
					data: unknown,
				): { affiliate: Affiliate; stats: AffiliateStats } =>
					data as { affiliate: Affiliate; stats: AffiliateStats },
			},
		},
		mutations: {
			create: {
				path: "@post/affiliate/affiliates",
				method: "POST",
				input: (body: CreateAffiliateInput) => ({ body }),
				select: (data: unknown): Affiliate => data as Affiliate,
				invalidates,
				refresh: false,
			},
			update: {
				path: "@put/affiliate/affiliates/:id",
				method: "PUT",
				input: ({ id, data }: { id: string; data: UpdateAffiliateInput }) => ({
					params: { id },
					body: data,
				}),
				select: (data: unknown): Affiliate => data as Affiliate,
				invalidates,
				refresh: false,
			},
			delete: {
				path: "@delete/affiliate/affiliates/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates,
				refresh: false,
			},
		},
	},
	affiliatePortal: {
		queries: {
			detail: {
				path: "/affiliate/portal",
				key: (partition?: unknown) => [partition],
				select: (data: unknown): AffiliatePortal => data as AffiliatePortal,
			},
		},
		mutations: {
			apply: {
				path: "@post/affiliate/apply",
				method: "POST",
				input: (body: AffiliateApplicationInput) => ({ body }),
				select: (data: unknown): Affiliate => data as Affiliate,
				invalidates,
				refresh: false,
			},
			update: {
				path: "@put/affiliate/portal",
				method: "PUT",
				input: (body: AffiliatePortalInput) => ({ body }),
				select: (data: unknown): Affiliate => data as Affiliate,
				invalidates,
				refresh: false,
			},
		},
	},
	affiliateCommissions: {
		queries: {
			list: {
				path: "/affiliate/commissions",
				query: (params: ListParams = {}, _partition?: unknown) => ({
					...params,
				}),
				select: (data: unknown): ListResult<Commission> =>
					data as ListResult<Commission>,
			},
		},
		mutations: {
			update: {
				path: "@put/affiliate/commissions/:id",
				method: "PUT",
				input: ({
					id,
					status,
				}: {
					id: string;
					status: "approved" | "voided";
				}) => ({ params: { id }, body: { status } }),
				select: (data: unknown): Commission => data as Commission,
				invalidates,
				refresh: false,
			},
		},
	},
	affiliatePayouts: {
		queries: {
			list: {
				path: "/affiliate/payouts",
				query: (params: ListParams = {}, _partition?: unknown) => ({
					...params,
				}),
				select: (data: unknown): ListResult<Payout> =>
					data as ListResult<Payout>,
			},
			export: {
				path: "/affiliate/payouts/export",
				query: (params: ListParams = {}, _partition?: unknown) => ({
					...params,
				}),
				select: (data: unknown): { csv: string } => data as { csv: string },
			},
		},
		mutations: {
			create: {
				path: "@post/affiliate/payouts",
				method: "POST",
				input: (body: CreatePayoutInput) => ({ body }),
				select: (data: unknown): Payout => data as Payout,
				invalidates,
				refresh: false,
			},
			update: {
				path: "@put/affiliate/payouts/:id",
				method: "PUT",
				input: ({
					id,
					...body
				}: {
					id: string;
					status: "sent" | "failed";
					reference?: string;
				}) => ({ params: { id }, body }),
				select: (data: unknown): Payout => data as Payout,
				invalidates,
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createAffiliateQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, affiliateResources, headers);
}
