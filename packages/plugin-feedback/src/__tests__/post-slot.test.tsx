import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FeedbackPostPage } from "../client/components/pages/post-page.internal";
import type { FeedbackPost } from "../types";

const post: FeedbackPost = {
	id: "request-one",
	slug: "saved-views",
	title: "Saved views",
	body: "Save a report view.",
	category: "Reporting",
	status: "planned",
	authorId: "reader-one",
	voteCount: 3,
	isVoted: false,
	createdAt: "2026-11-06T00:00:00.000Z",
	updatedAt: "2026-11-06T00:00:00.000Z",
};
vi.mock("../client/hooks", () => ({
	useFeedbackPost: () => ({ data: post }),
	useUpdateFeedbackStatus: () => ({ isPending: false }),
	useToggleFeedbackVote: () => ({ isPending: false }),
}));
vi.mock("@btst/stack/context", () => ({
	PermissionAccess: () => null,
	usePluginSiteNavigation: () => ({
		Link: (props: any) => <a {...props} />,
		resolve: (path: string) => ({ href: `/pages/${path}` }),
	}),
	usePluginOverrides: () => ({
		postBottomSlot: (request: FeedbackPost) => (
			<aside data-request-id={request.id}>Comments for {request.title}</aside>
		),
	}),
}));

it("renders the postBottomSlot below the request using the loaded post", () => {
	const html = renderToStaticMarkup(<FeedbackPostPage slug="saved-views" />);
	expect(html).toContain('data-request-id="request-one"');
	expect(html).toContain("Comments for Saved views");
	expect(html.indexOf("Comments for Saved views")).toBeGreaterThan(
		html.indexOf("Save a report view."),
	);
});
