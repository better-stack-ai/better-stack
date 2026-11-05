import api = require("@btst/plugin-crm/api");
import client = require("@btst/plugin-crm/client");
import type { Contact, Pipeline } from "@btst/plugin-crm/types";
const backend = api.crmBackendPlugin();
const frontend = client.crmClientPlugin();
const id: "crm" = frontend.id;
export { backend, frontend, id };
export type { Contact, Pipeline };
