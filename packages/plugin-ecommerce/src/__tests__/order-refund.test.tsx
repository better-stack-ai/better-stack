import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DigitalGrant } from "../types";
import { OrderDetailPage } from "../client/components/pages/order-detail-page.internal";

const state = vi.hoisted(() => ({
	supported: true,
	grantStatus: "revoking" as DigitalGrant["status"],
	canReconcile: true,
}));
vi.mock("@btst/stack/context", () => ({
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (path: string) => ({ href: path }),
	}),
	PermissionAccess: ({
		permission,
		children,
	}: {
		permission: { id: string };
		children: ReactNode;
	}) => {
		if (permission.id === "ecommerce:order.update") return null;
		if (
			permission.id === "ecommerce:order.reconcileRefund" &&
			!state.canReconcile
		)
			return null;
		return children;
	},
}));
vi.mock("../client/components/storefront", () => ({
	Storefront: ({ children }: { children: ReactNode }) => children,
	ErrorMessage: () => null,
	formatMoney: () => "$25.00",
}));
vi.mock("../client/components/order-summary", () => ({
	OrderSummary: () => null,
}));
vi.mock("../client/components/digital-deliveries", () => ({
	DigitalDeliveries: () => null,
}));
vi.mock("../client/hooks/use-orders", () => ({
	useOrder: () => ({
		data: { status: "paid", deliveryGrants: [{ status: state.grantStatus }] },
		refetch: vi.fn(),
	}),
	useUpdateOrderStatus: () => ({}),
	useOrderRefund: () => ({
		data: {
			supported: state.supported,
			eligible: false,
			amount: 2500,
			currency: "USD",
			attempt: {
				status: "confirmed",
				amount: 2500,
				currency: "USD",
				history: [],
			},
		},
		refetch: vi.fn(),
	}),
	useRefundOrder: () => ({}),
	useReconcileOrderRefund: () => ({}),
}));

beforeEach(() => {
	state.supported = true;
	state.grantStatus = "revoking";
	state.canReconcile = true;
});

describe("confirmed refund digital revocation recovery", () => {
	it.each([true, false])(
		"allows refund administrators to retry digital revocation with payment support %s",
		(supported) => {
			state.supported = supported;
			const html = renderToStaticMarkup(<OrderDetailPage id="order-1" />);
			expect(html).toContain("Retry digital revocation");
			expect(html).not.toContain("Save status");
			expect(html).not.toContain("Check provider status");
		},
	);
	it("hides recovery after digital revocation completes", () => {
		state.grantStatus = "revoked";
		expect(
			renderToStaticMarkup(<OrderDetailPage id="order-1" />),
		).not.toContain("Retry digital revocation");
	});
	it("requires the dedicated refund reconciliation permission", () => {
		state.canReconcile = false;
		expect(
			renderToStaticMarkup(<OrderDetailPage id="order-1" />),
		).not.toContain("Retry digital revocation");
	});
});
