import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { cmsBackendPlugin } from "@btst/stack/plugins/cms/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { z } from "zod";
import { seedCmsData } from "./seed";
const globalForStack = global as typeof global & {
	__btst_stack__?: ReturnType<typeof createStack>;
};

// Simple article content type
const ArticleSchema = z
	.object({
		title: z.string().min(1).meta({ fieldType: "text" }),
		summary: z.string().min(1).meta({ fieldType: "textarea" }),
		body: z.string().meta({ fieldType: "richtext" }),
		publishedAt: z.string().optional().meta({ fieldType: "date" }),
		published: z.boolean().default(false).meta({ fieldType: "switch" }),
	})
	.meta({ description: "A simple article content type" });

function createStack() {
	return stack({
		basePath: "/api/data",
		plugins: {
			cms: cmsBackendPlugin({
				contentTypes: [
					{
						name: "Article",
						slug: "article",
						description: "Blog-style articles",
						schema: ArticleSchema,
					},
				],
			}),
			openApi: openApiBackendPlugin({
				title: "BTST CMS Demo API",
				description: "API for the BTST CMS plugin demo",
				theme: "kepler",
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});
}

export const myStack = (globalForStack.__btst_stack__ ??= createStack());

// Seed demo data — uses api.cms.createContentItem which calls ensureSynced internally
seedCmsData(myStack.api).catch(console.error);

export const { handler, dbSchema } = myStack;
