export type AffiliateStatus = "pending" | "approved" | "suspended";
export type CommissionType = "percent" | "flat";
export type CommissionStatus = "pending" | "approved" | "paid" | "voided";
export type PayoutStatus = "pending" | "sent" | "failed";

export interface Affiliate {
	id: string;
	userId: string;
	name: string;
	email: string;
	code: string;
	status: AffiliateStatus;
	payoutDetails?: string | null;
	notes?: string | null;
	commissionType?: CommissionType | null;
	commissionValue?: number | null;
	createdAt: string;
	updatedAt: string;
}
export interface ReferralClick {
	id: string;
	affiliateId: string;
	code: string;
	landingPath?: string | null;
	referrer?: string | null;
	createdAt: string;
}
export interface Conversion {
	id: string;
	affiliateId: string;
	clickId?: string | null;
	externalRef?: string | null;
	amount: number;
	currency: string;
	status: "pending" | "approved" | "rejected";
	createdAt: string;
}
export interface Commission {
	id: string;
	affiliateId: string;
	conversionId: string;
	payoutId?: string | null;
	amount: number;
	currency: string;
	status: CommissionStatus;
	createdAt: string;
	updatedAt: string;
}
export interface Payout {
	id: string;
	affiliateId: string;
	amount: number;
	currency: string;
	status: PayoutStatus;
	reference?: string | null;
	paidAt?: string | null;
	createdAt: string;
}
export interface ListParams {
	limit?: number;
	offset?: number;
	affiliateId?: string;
	status?: string;
	currency?: string;
}
export interface ListResult<T> {
	items: T[];
	total: number;
	limit: number;
	offset: number;
}
export interface AffiliateStats {
	clicks: number;
	conversions: number;
	totals: {
		currency: string;
		pending: number;
		approved: number;
		paid: number;
		voided: number;
	}[];
}
export interface MarketingAsset {
	name: string;
	url: string;
	description?: string;
	bannerUrl?: string;
}
export interface AffiliatePortal {
	affiliate: Affiliate | null;
	stats: AffiliateStats;
	commissions: Commission[];
	payouts: Payout[];
	assets: MarketingAsset[];
}
export interface CreateAffiliateInput {
	userId: string;
	name: string;
	email: string;
	code?: string;
	payoutDetails?: string;
}
export interface UpdateAffiliateInput {
	name?: string;
	email?: string;
	code?: string;
	status?: AffiliateStatus;
	payoutDetails?: string | null;
	notes?: string | null;
	commissionType?: CommissionType | null;
	commissionValue?: number | null;
}
export interface TrackClickInput {
	code: string;
	landingPath?: string;
	referrer?: string;
}
export interface CreateConversionInput {
	externalRef?: string;
	amount: number;
	currency?: string;
	attribution?: { code?: string; clickId?: string };
}
export interface CreatePayoutInput {
	affiliateId: string;
	currency: string;
	commissionIds?: string[];
}
export interface AffiliateOptions {
	/** Number of days a stored referral click remains eligible. Defaults to 30. */
	attributionWindowDays?: number;
	/** Whether a new tracked referral replaces the existing cookie. Defaults to last_touch. */
	attributionMode?: "first_touch" | "last_touch";
	/** Default commission rule, unless the affiliate has an override. Defaults to percent. */
	defaultCommissionType?: CommissionType;
	/** Percentage (up to two decimals) or integer minor units for flat rules. Defaults to 20. */
	defaultCommissionValue?: number;
	/** Optional landing page templates and banner metadata displayed in the portal. */
	marketingAssets?: MarketingAsset[];
}
