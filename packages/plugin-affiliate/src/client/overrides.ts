/** Affiliate-specific page labels; shared services come from StackProvider. */
export interface AffiliatePluginOverrides {
	localization?: Partial<{
		affiliates: string;
		commissions: string;
		payouts: string;
		portal: string;
		apply: string;
	}>;
}
