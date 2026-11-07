import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { PostCard } from "../client/components/shared/post-card";
import { blogClientPlugin } from "../client/plugin";
import { blogPermissions } from "../permissions";
import type { SerializedPost } from "../types";
import { createTestClientStack } from "./helpers/client-stack-test-utils";

const post: SerializedPost = {
	id: "draft-navigation",
	title: "Private draft",
	slug: "private-draft",
	content: "Draft body",
	excerpt: "Draft summary",
	authorId: "author",
	published: false,
	image: null,
	tags: [],
	createdAt: "2026-11-07T12:00:00.000Z",
	updatedAt: "2026-11-07T12:00:00.000Z",
};

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.update.when(
			({ identity, facts }) => identity?.id === facts.authorId,
		),
	],
});

function render(published: boolean, identity: { id: string } | null) {
	return renderToStaticMarkup(
		<StackProvider
			stack={createTestClientStack({ blog: blogClientPlugin() })}
			auth={createClientAuth({ authorization, getIdentity: () => identity })}
			initialIdentity={identity}
		>
			<PostCard post={{ ...post, published }} />
		</StackProvider>,
	);
}

describe("draft card navigation", () => {
	it("opens an editable draft in its request-aware editor", () => {
		const html = render(false, { id: "author" });
		expect(
			html.match(/href="\/pages\/blog\/private-draft\/edit"/g),
		).toHaveLength(2);
	});

	it.each([{ id: "reader" }, null])(
		"retains the post route without update permission: %j",
		(identity) => {
			const html = render(false, identity);
			expect(html).toContain('href="/pages/blog/private-draft"');
			expect(html).not.toContain('href="/pages/blog/private-draft/edit"');
		},
	);

	it("retains the public post route for published posts", () => {
		const html = render(true, { id: "author" });
		expect(html).toContain('href="/pages/blog/private-draft"');
		expect(html).not.toContain('href="/pages/blog/private-draft/edit"');
	});
});
