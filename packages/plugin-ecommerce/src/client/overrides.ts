/** Consumer-specific storefront presentation. API and navigation come from StackProvider. */
export interface EcommercePluginOverrides {
	/** Resolve a media asset ID to a public image URL when using custom storage. */
	resolveImage?: (image: string) => string | undefined;
	/** Render a provider-specific payment form for adapters returning a client secret. */
	PaymentForm?: import("react").ComponentType<{
		clientSecret: string;
		orderId: string;
		onComplete: () => void;
	}>;
}
