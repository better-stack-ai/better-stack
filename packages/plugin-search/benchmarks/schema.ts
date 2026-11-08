import { defineDb } from "@btst/db";
import { blogSchema } from "../../plugin-blog/src/db";
import { cmsSchema } from "../../plugin-cms/src/db";

export const dbSchema = defineDb({}).use(blogSchema).use(cmsSchema);
