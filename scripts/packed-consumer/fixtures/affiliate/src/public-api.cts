import components = require("@btst/plugin-affiliate/client/components");
import hooks = require("@btst/plugin-affiliate/client/hooks");
import queries = require("@btst/plugin-affiliate/query-keys");
import permissions = require("@btst/plugin-affiliate/permissions");
import api = require("@btst/plugin-affiliate/api");
import client = require("@btst/plugin-affiliate/client");
import attribution = require("@btst/plugin-affiliate/attribution");
import type { Affiliate, Commission } from "@btst/plugin-affiliate/types";
import type { AffiliatePluginOverrides } from "@btst/plugin-affiliate/client";
const backend = api.affiliateBackendPlugin();
const frontend = client.affiliateClientPlugin();
const id: "affiliate" = frontend.id;
export {
	backend,
	frontend,
	id,
	attribution,
	components,
	hooks,
	queries,
	permissions,
};
export type { Affiliate, Commission, AffiliatePluginOverrides };
