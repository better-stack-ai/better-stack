import { FlagsPage } from "../client/components/pages/flags-page.internal";
import { EditFlagPage } from "../client/components/pages/edit-flag-page.internal";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { featureFlagsClientPlugin } from "../client/plugin";
import type { FeatureFlagsPluginOverrides } from "../client/overrides";
import { Rollout } from "../client/components/shared";

const flag = {
	key: "rollout",
	name: "Release",
	description: "Gradual release",
	type: "rollout",
	rolloutPct: 42,
	enabled: true,
	tags: [],
	segments: [],
	variants: [],
	archivedAt: null,
};
vi.mock("../client/hooks", () => ({
	useSuspenseFlags: () => ({
		data: [flag],
		isFetching: false,
		refetch: vi.fn(),
	}),
	useToggleFlag: () => ({ isPending: false }),
	useFlagDefinition: () => ({ data: flag }),
	useCreateFlag: () => ({ isPending: false }),
	useUpdateFlag: () => ({ isPending: false }),
	useArchiveFlag: () => ({ isPending: false }),
}));

const props: ComponentProps<typeof Rollout> = { percent: 42 };
const pages = ["flags", "newFlag", "editFlag"] as const;
type SlotProps = ComponentProps<
	NonNullable<
		NonNullable<
			NonNullable<
				FeatureFlagsPluginOverrides["pageOverrides"]
			>[(typeof pages)[number]]
		>["Rollout"]
	>
>;
const custom = (name: string) => (props: SlotProps) => (
	<output data-slot-override={name}>{props.percent}</output>
);

function render(
	page: ReactElement,
	overrides: FeatureFlagsPluginOverrides = {},
) {
	const stack = createClientStack({
		api: { baseURL: "https://test.local", basePath: "/api/data" },
		site: { baseURL: "https://test.local", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins: { featureFlags: featureFlagsClientPlugin() },
	});
	return renderToStaticMarkup(
		<StackProvider stack={stack} overrides={{ featureFlags: overrides }}>
			{page}
		</StackProvider>,
	);
}

describe("feature-flags page presentation overrides", () => {
	it("selects each explicitly scoped page's component", () => {
		const overrides = {
			pageOverrides: Object.fromEntries(
				pages.map((page) => [page, { Rollout: custom(page) }]),
			),
		};
		for (const page of pages) {
			const html = render(<Rollout {...props} page={page} />, overrides);
			expect(html).toContain(`data-slot-override="${page}"`);
			for (const other of pages.filter((key) => key !== page))
				expect(html).not.toContain(`data-slot-override="${other}"`);
		}
	});

	it("isolates one page and preserves built-ins for unconfigured scopes", () => {
		const overrides = {
			pageOverrides: { [pages[0]]: { Rollout: custom("specific") } },
		};
		expect(render(<Rollout {...props} page={pages[0]} />, overrides)).toContain(
			'data-slot-override="specific"',
		);
		for (const page of pages.slice(1)) {
			const html = render(<Rollout {...props} page={page} />, overrides);
			expect(html).toContain("42% rollout");
			expect(html).not.toContain("data-slot-override");
		}
		const standalone = render(<Rollout {...props} />, overrides);
		expect(standalone).toContain("42% rollout");
		expect(standalone).not.toContain("data-slot-override");
	});

	it("preserves unchanged defaults and empty page configuration", () => {
		for (const page of pages) {
			const html = render(<Rollout {...props} page={page} />);
			expect(html).toContain("42% rollout");
			expect(
				render(<Rollout {...props} page={page} />, {
					pageOverrides: { [page]: {} },
				}),
			).toBe(html);
		}
	});
});

it("built-in pages supply their own route scope", () => {
	const builtInPages = [<FlagsPage />, <EditFlagPage flagKey="rollout" />];
	const scopes = ["flags", "editFlag"];
	const overrides = {
		pageOverrides: Object.fromEntries(
			scopes.map((page) => [page, { Rollout: custom(page) }]),
		),
	};
	for (const [index, page] of builtInPages.entries()) {
		expect(render(page, overrides)).toContain(
			`data-slot-override="${scopes[index]}"`,
		);
	}
});

it("preserves standalone rendering without StackProvider", () => {
	expect(renderToStaticMarkup(<Rollout {...props} />)).toContain("42% rollout");
});
