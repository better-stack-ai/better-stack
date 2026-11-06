import {
	ecommerceBackendPlugin,
	PRODUCT_CONTENT_TYPE,
	stripeAdapter,
	lemonSqueezyAdapter,
} from "@btst/plugin-ecommerce/api";
import {
	ecommerceClientPlugin,
	type EcommercePluginOverrides,
} from "@btst/plugin-ecommerce/client";
import {
	ProductImagesField,
	ProductListPageComponent,
	CartDrawer,
} from "@btst/plugin-ecommerce/client/components";
import {
	useProducts,
	useCheckout,
	useCart,
} from "@btst/plugin-ecommerce/client/hooks";
import { createEcommerceQueryKeys } from "@btst/plugin-ecommerce/query-keys";
import { ecommercePermissions } from "@btst/plugin-ecommerce/permissions";
import type {
	Product,
	Order,
	CheckoutInput,
} from "@btst/plugin-ecommerce/types";

export type PackedEcommerce = {
	backend: typeof ecommerceBackendPlugin;
	contentType: typeof PRODUCT_CONTENT_TYPE;
	stripe: typeof stripeAdapter;
	lemonSqueezy: typeof lemonSqueezyAdapter;
	client: typeof ecommerceClientPlugin;
	overrides: EcommercePluginOverrides;
	images: typeof ProductImagesField;
	products: typeof ProductListPageComponent;
	cart: typeof CartDrawer;
	hooks: [typeof useProducts, typeof useCheckout, typeof useCart];
	queries: typeof createEcommerceQueryKeys;
	permissions: typeof ecommercePermissions;
	product: Product;
	order: Order;
	checkout: CheckoutInput;
};
