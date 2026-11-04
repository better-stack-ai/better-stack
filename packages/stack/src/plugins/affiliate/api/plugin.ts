import {
	createEndpoint,
	defineBackendPlugin,
	type DeepReadonly,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { calculateCommission } from "../commission";
import { affiliateSchema } from "../db";
import {
	affiliateListSchema,
	applicationSchema,
	createAffiliateSchema,
	createConversionSchema,
	createPayoutSchema,
	listSchema,
	updateAffiliateSchema,
	updateCommissionSchema,
	updatePayoutSchema,
	updatePortalSchema,
} from "../schemas";
import type {
	Affiliate,
	AffiliateOptions,
	Commission,
	Conversion,
	CreatePayoutInput,
	Payout,
} from "../types";
import { createAffiliateOperations } from "./operations";

/** Authorized request context shared by affiliate lifecycle callbacks. */
export interface AffiliateHookContext {
	readonly request?: Request;
	readonly identity: { readonly id: string } | null;
}

/** Lifecycle callbacks run after the operation permission is authorized. */
export interface AffiliatePluginHooks {
	onBeforeApproveAffiliate?: (
		affiliate: DeepReadonly<Affiliate>,
		context: AffiliateHookContext,
	) => Promise<void> | void;
	onAfterConversion?: (
		conversion: DeepReadonly<Conversion>,
		commission: DeepReadonly<Commission>,
		context: AffiliateHookContext,
	) => Promise<void> | void;
	onBeforePayout?: (
		batch: DeepReadonly<CreatePayoutInput>,
		context: AffiliateHookContext,
	) => Promise<void> | void;
	onAfterPayout?: (
		payout: DeepReadonly<Payout>,
		context: AffiliateHookContext,
	) => Promise<void> | void;
}

/** Affiliate attribution, commission rules, marketing assets, and lifecycle callbacks. */
export interface AffiliateBackendOptions extends AffiliateOptions {
	hooks?: AffiliatePluginHooks;
}

/** Processor-independent affiliate operations and identity-scoped portal API. */
export const affiliateBackendPlugin = (
	options: AffiliateBackendOptions = {},
) => {
	const assetURL = z.url({ protocol: /^https?$/ });
	z.object({
		attributionWindowDays: z.number().int().min(1).max(3650).optional(),
		attributionMode: z.enum(["first_touch", "last_touch"]).optional(),
		defaultCommissionType: z.enum(["percent", "flat"]).optional(),
		defaultCommissionValue: z.number().finite().nonnegative().optional(),
		marketingAssets: z
			.array(
				z.object({
					name: z.string().min(1),
					url: assetURL,
					description: z.string().optional(),
					bannerUrl: assetURL.optional(),
				}),
			)
			.optional(),
	}).parse(options);
	calculateCommission(
		0,
		options.defaultCommissionType ?? "percent",
		options.defaultCommissionValue ?? 20,
	);
	return defineBackendPlugin({
		id: "affiliate",
		dbPlugin: affiliateSchema,
		operations: (adapter, context) => {
			if (!context?.auth)
				throw new Error(
					"Affiliate requires a server auth adapter configured with affiliatePermissions",
				);
			return createAffiliateOperations(adapter, options);
		},
		routes: (_adapter, _context, operations) => ({
			listAffiliates: createEndpoint(
				"/affiliate/affiliates",
				{ method: "GET", query: affiliateListSchema, requireRequest: true },
				operations.listAffiliates.route((ctx) => ctx.query),
			),
			getAffiliate: createEndpoint(
				"/affiliate/affiliates/:id",
				{ method: "GET", requireRequest: true },
				operations.getAffiliate.route((ctx) => ({ id: ctx.params.id })),
			),
			createAffiliate: createEndpoint(
				"/affiliate/affiliates",
				{ method: "POST", body: createAffiliateSchema, requireRequest: true },
				operations.createAffiliate.route((ctx) => ctx.body),
			),
			updateAffiliate: createEndpoint(
				"/affiliate/affiliates/:id",
				{ method: "PUT", body: updateAffiliateSchema, requireRequest: true },
				operations.updateAffiliate.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteAffiliate: createEndpoint(
				"/affiliate/affiliates/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteAffiliate.route((ctx) => ({ id: ctx.params.id })),
			),
			apply: createEndpoint(
				"/affiliate/apply",
				{ method: "POST", body: applicationSchema, requireRequest: true },
				operations.apply.route((ctx) => ctx.body),
			),
			getPortal: createEndpoint(
				"/affiliate/portal",
				{ method: "GET", requireRequest: true },
				operations.getPortal.route(() => ({})),
			),
			updatePortal: createEndpoint(
				"/affiliate/portal",
				{ method: "PUT", body: updatePortalSchema, requireRequest: true },
				operations.updatePortal.route((ctx) => ctx.body),
			),
			trackClick: createEndpoint(
				"/affiliate/track/:code",
				{
					method: "GET",
					query: z.object({ to: z.string().max(2048).optional() }),
					requireRequest: true,
				},
				operations.trackClick.route((ctx) => ({
					code: ctx.params.code,
					landingPath: ctx.query.to,
				})),
			),
			createConversion: createEndpoint(
				"/affiliate/conversions",
				{ method: "POST", body: createConversionSchema, requireRequest: true },
				operations.createConversion.route((ctx) => ctx.body),
			),
			listCommissions: createEndpoint(
				"/affiliate/commissions",
				{ method: "GET", query: listSchema, requireRequest: true },
				operations.listCommissions.route((ctx) => ctx.query),
			),
			updateCommission: createEndpoint(
				"/affiliate/commissions/:id",
				{ method: "PUT", body: updateCommissionSchema, requireRequest: true },
				operations.updateCommission.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			listPayouts: createEndpoint(
				"/affiliate/payouts",
				{ method: "GET", query: listSchema, requireRequest: true },
				operations.listPayouts.route((ctx) => ctx.query),
			),
			createPayout: createEndpoint(
				"/affiliate/payouts",
				{ method: "POST", body: createPayoutSchema, requireRequest: true },
				operations.createPayout.route((ctx) => ctx.body),
			),
			updatePayout: createEndpoint(
				"/affiliate/payouts/:id",
				{ method: "PUT", body: updatePayoutSchema, requireRequest: true },
				operations.updatePayout.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			exportPayouts: createEndpoint(
				"/affiliate/payouts/export",
				{ method: "GET", query: listSchema, requireRequest: true },
				operations.exportPayouts.route((ctx) => ctx.query),
			),
		}),
	});
};

export type AffiliateApiRouter = ReturnType<
	ReturnType<typeof affiliateBackendPlugin>["routes"]
>;
