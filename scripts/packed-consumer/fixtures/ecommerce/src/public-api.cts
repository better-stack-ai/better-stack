import api = require("@btst/plugin-ecommerce/api");
import client = require("@btst/plugin-ecommerce/client");
import types = require("@btst/plugin-ecommerce/types");
import queries = require("@btst/plugin-ecommerce/query-keys");
export type CommonJSEcommerce = {
	backend: typeof api.ecommerceBackendPlugin;
	client: typeof client.ecommerceClientPlugin;
	product: types.Product;
	queries: typeof queries.createEcommerceQueryKeys;
};
