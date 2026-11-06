import { FeedbackPostPage } from "../client/components/pages/post-page.internal";
import { FeedbackBoardPage } from "../client/components/pages/feedback-page.internal";
import { FeedbackRoadmapPage } from "../client/components/pages/roadmap-page.internal";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { feedbackClientPlugin } from "../client/plugin";
import type { FeedbackPluginOverrides } from "../client/overrides";
import { FeedbackPostCard } from "../client/components/post-card";

vi.mock("../client/hooks", () => ({
	useToggleFeedbackVote: () => ({ isPending: false }),
	useFeedbackPost: () => ({ data: props.post }),
	useUpdateFeedbackStatus: () => ({ isPending: false }),
	useFeedbackPosts: () => ({ data: { items: [props.post], total: 1 } }),
	useCreateFeedbackPost: () => ({ isPending: false }),
	useFeedbackRoadmap: () => ({
		data: { planned: [props.post], in_progress: [], shipped: [] },
	}),
}));

const props: ComponentProps<typeof FeedbackPostCard> = {
	post: {
		id: "request",
		slug: "saved-views",
		title: "Saved views",
		body: "Save reporting views",
		category: "Reports",
		status: "planned",
		authorId: "reader",
		kanbanTaskId: null,
		voteCount: 3,
		isVoted: false,
		createdAt: "2026-11-06T00:00:00Z",
		updatedAt: "2026-11-06T00:00:00Z",
	},
};
const pages = ["feedback", "feedbackRoadmap"] as const;
type SlotProps = ComponentProps<
	NonNullable<
		NonNullable<
			NonNullable<
				FeedbackPluginOverrides["pageOverrides"]
			>[(typeof pages)[number]]
		>["PostCard"]
	>
>;
const custom = (name: string) => (props: SlotProps) => (
	<output data-slot-override={name}>{props.post.title}</output>
);

function render(page: ReactElement, overrides: FeedbackPluginOverrides = {}) {
	const stack = createClientStack({
		api: { baseURL: "https://test.local", basePath: "/api/data" },
		site: { baseURL: "https://test.local", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins: { feedback: feedbackClientPlugin() },
	});
	return renderToStaticMarkup(
		<StackProvider stack={stack} overrides={{ feedback: overrides }}>
			{page}
		</StackProvider>,
	);
}

describe("feedback page presentation overrides", () => {
	it("selects each explicitly scoped page's component", () => {
		const overrides = {
			pageOverrides: Object.fromEntries(
				pages.map((page) => [page, { PostCard: custom(page) }]),
			),
		};
		for (const page of pages) {
			const html = render(
				<FeedbackPostCard {...props} page={page} />,
				overrides,
			);
			expect(html).toContain(`data-slot-override="${page}"`);
			for (const other of pages.filter((key) => key !== page))
				expect(html).not.toContain(`data-slot-override="${other}"`);
		}
	});

	it("isolates one page and preserves built-ins for unconfigured scopes", () => {
		const overrides = {
			pageOverrides: { [pages[0]]: { PostCard: custom("specific") } },
		};
		expect(
			render(<FeedbackPostCard {...props} page={pages[0]} />, overrides),
		).toContain('data-slot-override="specific"');
		for (const page of pages.slice(1)) {
			const html = render(
				<FeedbackPostCard {...props} page={page} />,
				overrides,
			);
			expect(html).toContain("feedback-post-card");
			expect(html).not.toContain("data-slot-override");
		}
		const standalone = render(<FeedbackPostCard {...props} />, overrides);
		expect(standalone).toContain("feedback-post-card");
		expect(standalone).not.toContain("data-slot-override");
	});

	it("preserves unchanged defaults and empty page configuration", () => {
		for (const page of pages) {
			const html = render(<FeedbackPostCard {...props} page={page} />);
			expect(html).toContain("feedback-post-card");
			expect(
				render(<FeedbackPostCard {...props} page={page} />, {
					pageOverrides: { [page]: {} },
				}),
			).toBe(html);
		}
	});
});

it("built-in pages supply their own route scope", () => {
	const builtInPages = [<FeedbackBoardPage />, <FeedbackRoadmapPage />];
	const scopes = pages;
	const overrides = {
		pageOverrides: Object.fromEntries(
			scopes.map((page) => [page, { PostCard: custom(page) }]),
		),
	};
	for (const [index, page] of builtInPages.entries()) {
		expect(render(page, overrides)).toContain(
			`data-slot-override="${scopes[index]}"`,
		);
	}
});

it("keeps task and comment bridges alongside page-specific cards", () => {
	const html = render(
		<>
			<FeedbackBoardPage />
			<FeedbackPostPage slug={props.post.slug} />
		</>,
		{
			pageOverrides: { feedback: { PostCard: custom("board") } },
			kanbanTaskSlot: (post) => (
				<aside data-bridge="kanban">{post.title}</aside>
			),
			postBottomSlot: (post) => (
				<aside data-bridge="comments">{post.title}</aside>
			),
		},
	);
	expect(html).toContain('data-slot-override="board"');
	expect(html).toContain('data-bridge="kanban"');
	expect(html).toContain('data-bridge="comments"');
	expect(html.indexOf('data-bridge="comments"')).toBeGreaterThan(
		html.indexOf('data-bridge="kanban"'),
	);
});
