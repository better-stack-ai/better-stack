import type { ComponentType } from "react";
import type { Product } from "../types";

/** Consumer-specific storefront presentation. API and navigation come from StackProvider. */
export interface EcommercePluginOverrides {
	/** Catalog product-card presentation; cart and checkout controls remain built-in. */
	pageOverrides?: {
		shop?: { ProductCard?: ComponentType<{ product: Product }> };
	};
	/** Resolve a media asset ID to a public image URL when using custom storage. */
	resolveImage?: (image: string) => string | undefined;
	/** Render a provider-specific payment form for adapters returning a client secret. */
	PaymentForm?: import("react").ComponentType<{
		clientSecret: string;
		orderId: string;
		onComplete: () => void;
	}>;
}
