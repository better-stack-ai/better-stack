import type { ComponentType } from "react";
import type { AffiliateStats } from "../types";

/** Affiliate-specific page labels; shared services come from StackProvider. */
export interface AffiliatePluginOverrides {
	/** Earnings and referral summary presentation, independently for admin and affiliate pages. */
	pageOverrides?: Partial<
		Record<
			"affiliateDetail" | "portal",
			{
				Stats?: ComponentType<{ stats: AffiliateStats }>;
			}
		>
	>;
	localization?: Partial<{
		affiliates: string;
		commissions: string;
		payouts: string;
		portal: string;
		apply: string;
	}>;
}
