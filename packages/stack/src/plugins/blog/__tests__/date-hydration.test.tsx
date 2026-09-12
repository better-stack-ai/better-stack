// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createTestClientStack } from "../../../__tests__/client-stack-test-utils";
import { blogClientPlugin } from "../client/plugin";
import { PostCard } from "../client/components/shared/post-card";
import type { SerializedPost } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const post = {
	id: "date-post",
	title: "Timezone regression",
	content: "Article content",
	excerpt: "Article excerpt",
	slug: "timezone-regression",
	published: true,
	image: "",
	tags: [],
	authorId: undefined,
	publishedAt: "2026-04-28T18:30:00.000Z",
	createdAt: "2026-01-01T00:30:00.000Z",
	updatedAt: "2026-04-28T18:30:00.000Z",
} satisfies SerializedPost;

describe("public blog date hydration", () => {
	for (const published of [true, false]) {
		for (const timezone of ["America/Los_Angeles", "Pacific/Auckland"]) {
			it(`hydrates a ${published ? "published post" : "draft"} in ${timezone} from UTC HTML`, async () => {
				const previousTZ = process.env.TZ;
				const item = {
					...post,
					published,
					publishedAt: published ? post.publishedAt : undefined,
				};
				const timestamp = item.publishedAt || item.createdAt;
				const expected = published ? "April 28, 2026" : "January 1, 2026";
				const stack = createTestClientStack({ blog: blogClientPlugin() });
				const ui = (
					<StackProvider stack={stack}>
						<PostCard post={item} />
					</StackProvider>
				);
				const container = document.createElement("div");
				const errors: unknown[] = [];
				let root: ReturnType<typeof hydrateRoot> | undefined;
				try {
					process.env.TZ = "UTC";
					const html = renderToString(ui);
					container.innerHTML = html;
					document.body.appendChild(container);
					process.env.TZ = timezone;
					// Both the card's text and machine-readable date must match across hosts.
					expect(renderToString(ui)).toBe(html);
					await act(async () => {
						root = hydrateRoot(container, ui, {
							onRecoverableError: (error) => errors.push(error),
						});
					});
					expect(errors).toEqual([]);
					expect(container.querySelector("time")?.textContent).toBe(expected);
					expect(
						container.querySelector("time")?.getAttribute("datetime"),
					).toBe(timestamp);
				} finally {
					if (root) await act(async () => root!.unmount());
					container.remove();
					if (previousTZ === undefined)
						Reflect.deleteProperty(process.env, "TZ");
					else process.env.TZ = previousTZ;
				}
			});
		}
	}
});
