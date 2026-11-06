import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobBoardPluginOverrides } from "../client/overrides";
import { JobRow } from "../client/components/pages/job-list-page.internal";

const state = vi.hoisted(() => ({ overrides: {} as JobBoardPluginOverrides }));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => state.overrides,
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));
import { jobSchema } from "../schemas";
const job = {
	...jobSchema.parse({
		title: "Engineer",
		department: "Engineering",
		location: "Remote",
		employmentType: "full-time",
		description: "Build things",
		requirements: "TypeScript",
	}),
	id: "job-1",
	slug: "engineer",
	createdAt: "2026-11-06",
	updatedAt: "2026-11-06",
};
vi.mock("../client/hooks", () => ({
	useJobBoardLocalization: () => ({
		fullTime: "Full time",
		viewRole: "View role",
	}),
}));
const props = { job };
const pages = ["jobBoardList", "jobBoardDepartment"] as const;
const render = (page?: (typeof pages)[number]) =>
	renderToStaticMarkup(<JobRow {...props} page={page} />);

beforeEach(() => {
	state.overrides = {};
});

describe("job-board page-scoped JobRow", () => {
	it("selects the explicit page and forwards the existing presentation props", () => {
		for (const page of pages) {
			const slot = vi.fn((_: unknown) => (
				<section data-slot-override={page}>Custom presentation</section>
			));
			state.overrides = { pageOverrides: { [page]: { JobRow: slot } } };
			expect(render(page)).toContain(`data-slot-override="${page}"`);
			const presentationProps = props;
			expect(slot.mock.calls[0]?.[0]).toEqual(presentationProps);
			for (const other of pages.filter((key) => key !== page)) {
				expect(render(other)).not.toContain("data-slot-override");
				expect(render(other)).toContain("Engineer");
			}
			expect(render()).not.toContain("data-slot-override");
			expect(render()).toContain("Engineer");
		}
	});
	it("preserves built-in presentation when no slot is configured or a page entry is empty", () => {
		for (const page of pages) {
			const unchanged = render(page);
			expect(unchanged).toContain("Engineer");
			state.overrides = { pageOverrides: { [page]: {} } };
			expect(render(page)).toBe(unchanged);
		}
	});
});
