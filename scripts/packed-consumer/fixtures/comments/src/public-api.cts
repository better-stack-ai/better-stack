import api = require("@btst/plugin-comments/api");
import client = require("@btst/plugin-comments/client");
import type { SerializedComment } from "@btst/plugin-comments/types";
const backend = api.commentsBackendPlugin();
const frontend = client.commentsClientPlugin();
const id: "comments" = frontend.id;
export { backend, frontend, id };
export type { SerializedComment };
