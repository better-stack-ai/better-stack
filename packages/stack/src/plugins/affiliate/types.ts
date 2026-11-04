/** Application review and referral eligibility state. */
export type AffiliateStatus = "pending" | "approved" | "suspended";
/** Percentage points or a fixed amount in currency minor units. */
export type CommissionType = "percent" | "flat";
/** Review and settlement state; payouts alone move commissions to paid. */
export type CommissionStatus = "pending" | "approved" | "paid" | "voided";
/** Manual payment outcome; failed batches release their reserved commissions. */
export type PayoutStatus = "pending" | "sent" | "failed";

/** Partner profile with ISO timestamp strings and optional administrative notes. */
export interface Affiliate {
	id: string;
	/** Authenticated account that exclusively owns this profile's portal. */
	userId: string;
	name: string;
	email: string;
	code: string;
	status: AffiliateStatus;
	/** Payment instructions stored as text, without processor-specific validation. */
	payoutDetails?: string | null;
	/** Administrative notes, omitted from portal responses. */
	notes?: string | null;
	commissionType?: CommissionType | null;
	commissionValue?: number | null;
	createdAt: string;
	updatedAt: string;
}
/** Recorded visit; its stored ISO timestamp determines cookie attribution eligibility. */
export interface ReferralClick {
	id: string;
	affiliateId: string;
	code: string;
	landingPath?: string | null;
	referrer?: string | null;
	/** Optional hash supplied by a trusted integration; HTTP tracking does not collect IPs. */
	ipHash?: string | null;
	userAgent?: string | null;
	createdAt: string;
}
/** Attributed order/event with a safe integer amount in currency minor units. */
export interface Conversion {
	id: string;
	affiliateId: string;
	clickId?: string | null;
	/** Stable order/event identifier used to deduplicate conversion retries. */
	externalRef?: string | null;
	amount: number;
	currency: string;
	status: "pending" | "approved" | "rejected";
	createdAt: string;
}
/** Earnings from one conversion, expressed in currency minor units with ISO timestamps. */
export interface Commission {
	id: string;
	affiliateId: string;
	conversionId: string;
	/** Pending or settled payout reservation; empty when available for a new batch. */
	payoutId?: string | null;
	amount: number;
	currency: string;
	status: CommissionStatus;
	createdAt: string;
	updatedAt: string;
}
/** One affiliate's manual payment batch in one currency; dates are ISO strings. */
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
/** Offset pagination and filters for affiliate administration lists. */
export interface ListParams {
	limit?: number;
	offset?: number;
	affiliateId?: string;
	status?: string;
	currency?: string;
}
/** A page of records and the total count before pagination. */
export interface ListResult<T> {
	items: T[];
	total: number;
	limit: number;
	offset: number;
}
/** Referral counts and commission minor-unit totals, grouped separately per currency. */
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
/** HTTP(S) landing-page template and optional banner link shown to partners. */
export interface MarketingAsset {
	name: string;
	url: string;
	description?: string;
	bannerUrl?: string;
}
/** One account's profile, totals, recent financial history, and program marketing assets. */
export interface AffiliatePortal {
	affiliate: Affiliate | null;
	stats: AffiliateStats;
	commissions: Commission[];
	payouts: Payout[];
	assets: MarketingAsset[];
}
/** Pending-profile input; administrators supply ownership, applications use request identity. */
export interface CreateAffiliateInput {
	userId: string;
	name: string;
	email: string;
	code?: string;
	payoutDetails?: string;
}
/** Administrative profile edits; commission override type and value must be set or cleared together. */
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
/** A referral visit and optional metadata supplied by the tracking transport or trusted caller. */
export interface TrackClickInput {
	code: string;
	landingPath?: string;
	referrer?: string;
	ipHash?: string;
	userAgent?: string;
}
/** Verified order/event amount and attribution; omitted attribution returns null without a request fallback. */
export interface CreateConversionInput {
	externalRef?: string;
	amount: number;
	currency?: string;
	attribution?: { code?: string; clickId?: string };
}
/** Reserve selected or all available approved commissions for one affiliate and currency. */
export interface CreatePayoutInput {
	affiliateId: string;
	currency: string;
	commissionIds?: string[];
}
/** Attribution window, default commission rule, and optional partner marketing assets. */
export interface AffiliateOptions {
	/** Trusted HTTP(S) site origin for tracking redirects when the API uses a separate origin. */
	siteOrigin?: string;
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
