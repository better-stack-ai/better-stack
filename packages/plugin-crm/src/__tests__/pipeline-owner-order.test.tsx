// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PipelinePage } from "../client/components/pages/pipeline-page.internal";
import type { CrmOwnerFilter } from "../query-keys";
import type { Pipeline } from "../types";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
type Tasks = Pipeline["columns"][number]["tasks"];
const state = vi.hoisted(() => ({
	move: vi.fn(async (_change: unknown) => {}),
	refetch: vi.fn(async () => {}),
	board: undefined as
		| {
				value: Record<string, Tasks>;
				onValueChange: (value: Record<string, Tasks>) => void;
				onDragEnd: () => void;
		  }
		| undefined,
}));
const tasks = [
	{ id: "hidden", title: "Another owner's deal", order: 0 },
	{ id: "mine-a", title: "My first deal", order: 1 },
	{ id: "mine-b", title: "My second deal", order: 2 },
] as Tasks;
const pipeline = {
	id: "pipeline-1",
	name: "Sales",
	columns: [{ id: "lead", title: "Lead", tasks }],
	deals: tasks.map((task) => ({
		id: `deal-${task.id}`,
		taskId: task.id,
		title: task.title,
		pipelineId: "pipeline-1",
		stage: "lead",
		ownerId: task.id === "hidden" ? "other" : "me",
		status: "open",
		currency: "USD",
	})),
} as Pipeline;
const filteredPipeline = {
	...pipeline,
	deals: pipeline.deals.slice(1),
	columns: [{ ...pipeline.columns[0], tasks: tasks.slice(1) }],
};
vi.mock("@btst/stack/context", () => ({
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (path: string) => ({ href: path }),
	}),
}));
vi.mock("../client/hooks", () => ({
	usePipeline: (_id: string, filter: CrmOwnerFilter) => ({
		data: filter.owner || filter.ownerId ? filteredPipeline : pipeline,
		refetch: state.refetch,
	}),
	useMoveDeal: () => ({ mutateAsync: state.move, isPending: false }),
}));
vi.mock("../client/components/shared", () => ({
	CrmPage: ({
		children,
		description,
	}: {
		children: ReactNode;
		description: string;
	}) => (
		<div>
			<p>{description}</p>
			{children}
		</div>
	),
	Feedback: () => null,
	money: () => "$100",
	useCrmAction: () => ({ run: (run: () => Promise<void>) => run() }),
}));
vi.mock("../client/components/deal-form", () => ({ DealForm: () => null }));
vi.mock("../client/components/deal-owner", () => ({
	DealOwnerName: () => "Owner",
	DealOwnerFilter: ({
		onChange,
	}: {
		onChange: (filter: CrmOwnerFilter) => void;
	}) => (
		<div>
			<button type="button" onClick={() => onChange({ owner: "current" })}>
				My deals
			</button>
			<button type="button" onClick={() => onChange({ owner: "unassigned" })}>
				Unassigned
			</button>
			<button type="button" onClick={() => onChange({ ownerId: "me" })}>
				Specific owner
			</button>
			<button type="button" onClick={() => onChange({})}>
				All owners
			</button>
		</div>
	),
}));
vi.mock("@workspace/ui/components/kanban", () => ({
	Root: (props: NonNullable<typeof state.board> & { children: ReactNode }) => {
		state.board = props;
		return props.children;
	},
	Board: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	Column: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	Item: ({ children }: { children: ReactNode }) => children,
	ItemHandle: ({ children }: { children: ReactNode }) => children,
	Overlay: () => null,
}));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	state.move.mockClear();
	state.refetch.mockClear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});
const choose = (text: string) =>
	Array.from(container.querySelectorAll("button"))
		.find((button) => button.textContent === text)!
		.click();

describe("owner-filtered pipeline ordering", () => {
	it.each(["My deals", "Unassigned", "Specific owner"])(
		"preserves global ordering while %s is selected and restores dragging for all owners",
		async (filter) => {
			await act(async () =>
				root.render(<PipelinePage pipelineId="pipeline-1" />),
			);
			expect(
				container.querySelector<HTMLButtonElement>(
					'[aria-label="Move deal My first deal"]',
				)?.disabled,
			).toBe(false);
			await act(async () => choose(filter));
			expect(container.textContent).toContain(
				"Clear the owner filter to drag deals",
			);
			expect(
				container.querySelector<HTMLButtonElement>(
					'[aria-label="Move deal My first deal"]',
				)?.disabled,
			).toBe(true);
			expect(
				container.querySelector('a[href="crm/deals/deal-mine-a"]'),
			).not.toBeNull();
			await act(async () => {
				state.board!.onValueChange({ lead: [tasks[2]!, tasks[1]!] });
				state.board!.onDragEnd();
			});
			expect(state.move).not.toHaveBeenCalled();
			await act(async () => choose("All owners"));
			expect(
				container.querySelector<HTMLButtonElement>(
					'[aria-label="Move deal My first deal"]',
				)?.disabled,
			).toBe(false);
			await act(async () => {
				state.board!.onValueChange({ lead: [tasks[0]!, tasks[2]!, tasks[1]!] });
				state.board!.onDragEnd();
				await Promise.resolve();
			});
			expect(state.move.mock.calls.map(([change]) => change)).toEqual([
				{ id: "deal-mine-b", stage: "lead", order: 1 },
				{ id: "deal-mine-a", stage: "lead", order: 2 },
			]);
		},
	);
});
