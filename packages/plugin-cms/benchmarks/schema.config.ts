import { defineDb } from "@btst/db";
import { cmsSchema } from "../src/db";

export const dbSchema = defineDb({}).use(cmsSchema);
