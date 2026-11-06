import api = require("@btst/plugin-school/api");
import client = require("@btst/plugin-school/client");
import type { Course, Lesson } from "@btst/plugin-school/types";
const backend = api.schoolBackendPlugin();
const frontend = client.schoolClientPlugin();
const id: "school" = frontend.id;
export { backend, frontend, id };
export type { Course, Lesson };
