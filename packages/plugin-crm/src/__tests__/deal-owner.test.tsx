// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DealOwnerEditor,
	DealOwnerFilter,
} from "../client/components/deal-owner";
import type { Deal } from "../types";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const state = vi.hoisted(() => ({
	directoryAllowed: true,
	owners: vi.fn(() => ({
		data: {
			items: [{ id: "sales-1", name: "Alex Sales" }],
			currentUserId: "sales-1",
		},
	})),
	assign: vi.fn(),
}));
vi.mock("@btst/stack/context", () => ({
	PermissionAccess: ({
		permission,
		children,
		fallback,
	}: {
		permission: { id: string };
		children: ReactNode;
		fallback?: ReactNode;
	}) =>
		permission.id === "crm:owner.read" && !state.directoryAllowed
			? fallback
			: children,
}));
vi.mock("../client/hooks", () => ({
	useDealOwners: () => state.owners(),
	useAssignDealOwner: () => ({ mutateAsync: state.assign, isPending: false }),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	state.directoryAllowed = true;
	state.owners.mockClear();
	state.assign.mockReset();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});
const deal = {
	id: "deal-1",
	taskId: "task-1",
	pipelineId: "pipeline-1",
	ownerId: null,
	title: "Contract",
} as Deal;

function select(value: string) {
	const element = container.querySelector("select")!;
	element.value = value;
	element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("deal ownership controls", () => {
	it("enables owner controls only after their event handlers hydrate", async () => {
		const props = { deal, onReload: vi.fn(async () => {}) };
		const server = document.createElement("div");
		server.innerHTML = renderToStaticMarkup(
			<>
				<DealOwnerFilter value={{}} onChange={vi.fn()} />
				<DealOwnerEditor {...props} />
			</>,
		);
		expect(
			Array.from(
				server.querySelectorAll("select"),
				(element) => element.disabled,
			),
		).toEqual([true, true]);
		expect(server.querySelector("button")?.disabled).toBe(true);
		await act(async () =>
			root.render(
				<>
					<DealOwnerFilter value={{}} onChange={vi.fn()} />
					<DealOwnerEditor {...props} />
				</>,
			),
		);
		expect(
			Array.from(
				container.querySelectorAll("select"),
				(element) => element.disabled,
			),
		).toEqual([false, false]);
	});

	it("keeps basic filters available when the staff directory is not authorized", async () => {
		state.directoryAllowed = false;
		const onChange = vi.fn();
		await act(async () =>
			root.render(<DealOwnerFilter value={{}} onChange={onChange} />),
		);
		expect(state.owners).not.toHaveBeenCalled();
		expect(
			Array.from(
				container.querySelectorAll("option"),
				(option) => option.textContent,
			),
		).toEqual(["All owners", "My deals", "Unassigned"]);
		await act(async () => select("current"));
		expect(onChange).toHaveBeenLastCalledWith({ owner: "current" });
		await act(async () => select("unassigned"));
		expect(onChange).toHaveBeenLastCalledWith({ owner: "unassigned" });
	});

	it("keeps staff IDs distinct from special filter choices", async () => {
		const onChange = vi.fn();
		await act(async () =>
			root.render(<DealOwnerFilter value={{}} onChange={onChange} />),
		);
		await act(async () => select("owner:sales-1"));
		expect(onChange).toHaveBeenLastCalledWith({ ownerId: "sales-1" });
	});

	it("submits the observed owner and offers reload after a concurrent reassignment", async () => {
		state.assign.mockRejectedValueOnce(
			new Error("Deal owner changed; reload before assigning"),
		);
		const onReload = vi.fn(async () => {});
		await act(async () =>
			root.render(<DealOwnerEditor deal={deal} onReload={onReload} />),
		);
		await act(async () => select("sales-1"));
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(state.assign).toHaveBeenCalledWith({
			id: "deal-1",
			ownerId: "sales-1",
			expectedOwnerId: null,
		});
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Deal owner changed",
		);
		const reload = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Reload owner",
		)!;
		await act(async () => reload.click());
		expect(onReload).toHaveBeenCalledOnce();
	});

	it("preserves an unavailable staff member until ownership is explicitly cleared", async () => {
		const onReload = vi.fn(async () => {});
		await act(async () =>
			root.render(
				<DealOwnerEditor
					deal={{ ...deal, ownerId: "former-staff" }}
					onReload={onReload}
				/>,
			),
		);
		expect(container.querySelector("select")?.value).toBe("former-staff");
		expect(container.textContent).toContain(
			"Unavailable staff member (former-staff)",
		);
		await act(async () => select(""));
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(state.assign).toHaveBeenCalledWith({
			id: "deal-1",
			ownerId: null,
			expectedOwnerId: "former-staff",
		});
	});
});
