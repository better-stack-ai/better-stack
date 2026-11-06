import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as authorization from "@btst/stack/authorization";
import * as server from "@btst/stack/authorization/server";
import * as blog from "@btst/plugin-blog/api";
import * as newsletter from "@btst/plugin-newsletter/api";
import * as blogPermissions from "@btst/plugin-blog/permissions";
import * as newsletterPermissions from "@btst/plugin-newsletter/permissions";
import { z } from "zod";

export const esm = {
	...core,
	...authorization,
	...server,
	...blog,
	...newsletter,
	...blogPermissions,
	...newsletterPermissions,
};
export async function createFixture(modules = esm) {
	const {
		createBackendStack,
		defineAuthorization,
		createServerAuth,
		blogBackendPlugin,
		newsletterBackendPlugin,
		blogPermissions,
		newsletterPermissions,
	} = modules;
	const emails = [];
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization: defineAuthorization({
				identity: z.object({ id: z.string() }),
				permissions: [blogPermissions, newsletterPermissions],
				rules: ({ blog, newsletter }) => [
					blog.post.read.when(({ identity }) => identity?.id !== "no-blog"),
					newsletter.campaign.create.when(
						({ identity }) => identity?.id !== "no-create",
					),
					newsletter.campaign.read.allow(),
					newsletter.campaign.update.allow(),
					newsletter.campaign.send.when(
						({ identity }) => identity?.id !== "no-send",
					),
					newsletter.subscriber.create.allow(),
				],
			}),
			getIdentity: ({ request }) => ({
				id: request.headers.get("x-user") ?? "editor",
			}),
		}),
		plugins: {
			blog: blogBackendPlugin(),
			newsletter: newsletterBackendPlugin({
				emailAdapter: {
					async send(email) {
						emails.push(email);
						return { messageId: `stub-${emails.length}` };
					},
				},
				unsubscribeBaseURL: "https://example.test/api/newsletter",
			}),
		},
	});
	await stack.adapter.create({
		model: "post",
		forceAllowId: true,
		data: {
			id: "existing-post-id",
			slug: "existing-post",
			title: "Existing Blog edition",
			content: "# Existing Blog body",
			published: true,
			createdAt: new Date("2020-01-02T03:04:05Z"),
			updatedAt: new Date("2020-01-02T03:04:05Z"),
		},
	});
	const request = (id) =>
		new Request("https://example.test/api", { headers: { "x-user": id } });
	const editor = stack.forRequest(request("editor")).operations;
	await editor.newsletter.createSubscriber({
		email: "reader@example.test",
		tags: ["readers"],
	});
	await editor.newsletter.createSubscriber({
		email: "other@example.test",
		tags: ["other"],
	});
	await editor.newsletter.createSubscriber({
		email: "optout@example.test",
		tags: ["readers"],
		status: "unsubscribed",
	});
	return { stack, request, editor, emails };
}
