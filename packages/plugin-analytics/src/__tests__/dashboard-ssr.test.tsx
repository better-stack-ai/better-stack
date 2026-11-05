// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsDashboardPageComponent } from "../client/components/pages/dashboard-page";

const mocks = vi.hoisted(() => ({ protectedQuery: vi.fn() }));
vi.mock("../client/components/pages/dashboard-page.internal", () => ({
	AnalyticsDashboardPage: () => {
		mocks.protectedQuery();
		return <div>Loaded dashboard</div>;
	},
}));
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("analytics dynamic dashboard", () => {
	it("defers protected dashboard queries until browser hydration", async () => {
		const html = renderToString(<AnalyticsDashboardPageComponent />);
		expect(html).toContain("Loading traffic");
		expect(mocks.protectedQuery).not.toHaveBeenCalled();
		const container = document.createElement("div");
		container.innerHTML = html;
		document.body.append(container);
		const errors: unknown[] = [];
		let root: ReturnType<typeof hydrateRoot>;
		await act(async () => {
			root = hydrateRoot(container, <AnalyticsDashboardPageComponent />, {
				onRecoverableError: (error) => errors.push(error),
			});
		});
		expect(container.textContent).toContain("Loaded dashboard");
		expect(mocks.protectedQuery).toHaveBeenCalled();
		expect(errors).toEqual([]);
		await act(async () => root!.unmount());
		container.remove();
	});
});
