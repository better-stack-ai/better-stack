import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	definePassthroughOperation,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import {
	AFFILIATE_COOKIE_NAME,
	attributionFromRequest,
	isClickWithinWindow,
	safeLandingPath,
	selectAttributionClick,
} from "../attribution";
import { affiliatePermissions as permissions } from "../permissions";
import {
	affiliateListSchema,
	applicationSchema,
	createAffiliateSchema,
	createConversionSchema,
	createPayoutSchema,
	idSchema,
	listSchema,
	trackClickSchema,
	updateAffiliateSchema,
	updateCommissionSchema,
	updatePayoutSchema,
	updatePortalSchema,
} from "../schemas";
import * as getters from "./getters";
import * as mutations from "./mutations";
import type { AffiliateBackendOptions } from "./plugin";

function fail(status: number, message: string): never {
	throw new OperationHttpError(status, message, "AFFILIATE_ERROR");
}

async function requireAffiliate(adapter: Adapter, id: string) {
	return (
		(await getters.getAffiliate(adapter, id)) ??
		fail(404, "Affiliate not found")
	);
}

async function affiliateFacts(adapter: Adapter, id: string) {
	const affiliate = await requireAffiliate(adapter, id);
	return {
		affiliateId: affiliate.id,
		userId: affiliate.userId,
		status: affiliate.status,
	};
}

function requireIdentity(identity: { readonly id: string } | null): string {
	return identity?.id ?? fail(401, "Sign in to manage your affiliate profile");
}

function attributionCookie(request?: Request): string | undefined {
	const value = request?.headers
		.get("cookie")
		?.split(";")
		.map((entry) => entry.trim())
		.find((entry) => entry.startsWith(`${AFFILIATE_COOKIE_NAME}=`))
		?.slice(AFFILIATE_COOKIE_NAME.length + 1);
	return value && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : undefined;
}

/** Shared validated operation inventory for HTTP, request scopes, and trusted jobs. */
export function createAffiliateOperations(
	adapter: Adapter,
	options: AffiliateBackendOptions,
) {
	return {
		listAffiliates: defineOperation({
			input: affiliateListSchema,
			permission: permissions.affiliate.read,
			facts: () => ({ scope: "collection" as const }),
			execute: async ({ input }) => {
				const result = await getters.listAffiliates(adapter, input);
				return {
					...result,
					items: result.items.map((affiliate) => ({ ...affiliate })),
				};
			},
		}),
		getAffiliate: defineOperation({
			input: idSchema,
			permission: permissions.affiliate.read,
			facts: ({ input }) => ({
				scope: "record" as const,
				affiliateId: input.id,
			}),
			execute: async ({ input }) => ({
				affiliate: { ...(await requireAffiliate(adapter, input.id)) },
				stats: { ...(await getters.getAffiliateStats(adapter, input.id)) },
			}),
		}),
		createAffiliate: defineOperation({
			input: createAffiliateSchema,
			permission: permissions.affiliate.create,
			facts: () => undefined,
			execute: async ({ input }) => ({
				...(await mutations.createAffiliate(adapter, input)),
			}),
		}),
		updateAffiliate: defineOperation({
			input: idSchema.extend({ data: updateAffiliateSchema }),
			permission: permissions.affiliate.update,
			facts: ({ input }) => affiliateFacts(adapter, input.id),
			before: async (context) => {
				if (context.input.data.status === "approved")
					await options.hooks?.onBeforeApproveAffiliate?.(
						await requireAffiliate(adapter, context.input.id),
						context,
					);
			},
			execute: async ({ input }) => ({
				...(await mutations.updateAffiliate(adapter, input.id, input.data)),
			}),
		}),
		deleteAffiliate: defineOperation({
			input: idSchema,
			permission: permissions.affiliate.delete,
			facts: ({ input }) => affiliateFacts(adapter, input.id),
			execute: async ({ input }) => {
				await mutations.deleteAffiliate(adapter, input.id);
				return { success: true as const };
			},
		}),
		apply: defineOperation({
			input: applicationSchema,
			permission: permissions.application.create,
			facts: () => undefined,
			execute: async ({ input, identity }) => ({
				...(await mutations.createAffiliate(adapter, {
					...input,
					userId: requireIdentity(identity),
				})),
			}),
		}),
		getPortal: defineOperation({
			input: z.object({}),
			permission: permissions.portal.read,
			facts: () => undefined,
			execute: async ({ identity }) => {
				const portal = await getters.getPortal(
					adapter,
					requireIdentity(identity),
					options.marketingAssets,
				);
				return {
					affiliate: portal.affiliate ? { ...portal.affiliate } : null,
					stats: { ...portal.stats },
					commissions: portal.commissions.map((commission) => ({
						...commission,
					})),
					payouts: portal.payouts.map((payout) => ({ ...payout })),
					assets: portal.assets.map((asset) => ({ ...asset })),
				};
			},
		}),
		updatePortal: defineOperation({
			input: updatePortalSchema,
			permission: permissions.portal.update,
			facts: () => undefined,
			execute: async ({ input, identity }) => {
				const affiliate =
					(await getters.getAffiliateByUserId(
						adapter,
						requireIdentity(identity),
					)) ?? fail(404, "Apply to the affiliate program first");
				const updated = await mutations.updateAffiliate(
					adapter,
					affiliate.id,
					input,
				);
				const { notes: _notes, ...profile } = updated;
				return profile;
			},
		}),
		trackClick: definePassthroughOperation({
			input: trackClickSchema,
			permission: permissions.tracking.track,
			access: "public",
			facts: () => undefined,
			execute: async ({ input, request }) => {
				let landingPath: string;
				try {
					landingPath = safeLandingPath(input.landingPath);
				} catch {
					fail(400, "Landing path must be a local absolute path");
				}
				const click = await mutations.trackClick(adapter, {
					...input,
					landingPath,
					referrer:
						request?.headers.get("referer")?.slice(0, 2048) ?? input.referrer,
					userAgent:
						request?.headers.get("user-agent")?.slice(0, 2048) ??
						input.userAgent,
				});
				const previousId = attributionCookie(request);
				const previous = previousId
					? await getters.getReferralClick(adapter, previousId)
					: null;
				const previousAffiliate = previous
					? await getters.getAffiliate(adapter, previous.affiliateId)
					: null;
				const selected = selectAttributionClick(
					previousAffiliate?.status === "approved" ? previous : null,
					click,
					options,
				);
				const headers = new Headers({
					Location: landingPath,
					"Cache-Control": "no-store, private",
					"Referrer-Policy": "no-referrer",
				});
				if (selected) {
					const maxAge = Math.max(
						0,
						Math.floor(
							(new Date(selected.createdAt).getTime() +
								(options.attributionWindowDays ?? 30) * 86400000 -
								Date.now()) /
								1000,
						),
					);
					headers.set(
						"Set-Cookie",
						`${AFFILIATE_COOKIE_NAME}=${selected.id}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${request && new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
					);
				}
				return new Response(null, { status: 302, headers });
			},
		}),
		createConversion: defineOperation({
			input: createConversionSchema,
			permission: permissions.conversion.create,
			facts: () => undefined,
			execute: async ({ input, request }) => {
				let requestAttribution = request
					? attributionFromRequest(request)
					: undefined;
				if (!input.attribution) {
					const cookieId = attributionCookie(request);
					const click = cookieId
						? await getters.getReferralClick(adapter, cookieId)
						: null;
					if (
						click &&
						isClickWithinWindow(click, options.attributionWindowDays) &&
						(await getters.getAffiliate(adapter, click.affiliateId))?.status ===
							"approved"
					)
						requestAttribution = { clickId: click.id };
				}
				if (
					!input.attribution &&
					!createConversionSchema.shape.attribution.safeParse(
						requestAttribution,
					).success
				)
					fail(400, "Invalid referral attribution");
				const result = await mutations.createConversion(
					adapter,
					{
						...input,
						attribution: input.attribution ?? requestAttribution,
					},
					options,
				);
				return result
					? {
							conversion: { ...result.conversion },
							commission: { ...result.commission },
						}
					: null;
			},
			after: async (context) => {
				if (context.result)
					await options.hooks?.onAfterConversion?.(
						context.result.conversion,
						context.result.commission,
						context,
					);
			},
		}),
		listCommissions: defineOperation({
			input: listSchema,
			permission: permissions.commission.read,
			facts: () => undefined,
			execute: async ({ input }) => {
				const result = await getters.listCommissions(adapter, input);
				return {
					...result,
					items: result.items.map((commission) => ({ ...commission })),
				};
			},
		}),
		updateCommission: defineOperation({
			input: idSchema.extend({ data: updateCommissionSchema }),
			permission: permissions.commission.update,
			facts: async ({ input }) => {
				const commission =
					(await getters.getCommission(adapter, input.id)) ??
					fail(404, "Commission not found");
				return {
					commissionId: commission.id,
					affiliateId: commission.affiliateId,
					status: commission.status,
				};
			},
			execute: async ({ input }) => ({
				...(await mutations.updateCommission(adapter, input.id, input.data)),
			}),
		}),
		listPayouts: defineOperation({
			input: listSchema,
			permission: permissions.payout.read,
			facts: () => undefined,
			execute: async ({ input }) => {
				const result = await getters.listPayouts(adapter, input);
				return {
					...result,
					items: result.items.map((payout) => ({ ...payout })),
				};
			},
		}),
		createPayout: defineOperation({
			input: createPayoutSchema,
			permission: permissions.payout.create,
			facts: async ({ input }) => {
				await requireAffiliate(adapter, input.affiliateId);
				return { affiliateId: input.affiliateId, currency: input.currency };
			},
			before: (context) =>
				options.hooks?.onBeforePayout?.(context.input, context),
			execute: async ({ input }) => ({
				...(await mutations.createPayout(adapter, {
					...input,
					commissionIds: input.commissionIds
						? [...input.commissionIds]
						: undefined,
				})),
			}),
		}),
		updatePayout: defineOperation({
			input: idSchema.extend({ data: updatePayoutSchema }),
			permission: permissions.payout.update,
			facts: async ({ input }) => {
				const payout =
					(await getters.getPayout(adapter, input.id)) ??
					fail(404, "Payout not found");
				return {
					payoutId: payout.id,
					affiliateId: payout.affiliateId,
					status: payout.status,
				};
			},
			execute: async ({ input }) => ({
				...(await mutations.updatePayout(adapter, input.id, input.data)),
			}),
			after: async (context) => {
				if (context.result.status === "sent")
					await options.hooks?.onAfterPayout?.(context.result, context);
			},
		}),
		exportPayouts: defineOperation({
			input: listSchema,
			permission: permissions.payout.export,
			facts: () => undefined,
			execute: async ({ input }) => ({
				csv: await getters.exportPayouts(adapter, input),
			}),
		}),
	};
}
