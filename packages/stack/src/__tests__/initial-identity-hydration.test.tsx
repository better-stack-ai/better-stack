// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import { StackProvider } from "../context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const permissions = definePermissions("documents", {
	delete: permission(z.object({ id: z.string() })),
});

const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
	permissions: [permissions] as const,
	rules: ({ documents }) => [
		documents.delete.when(
			({ identity }) => identity !== null && identity.role === "admin",
		),
	],
});

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
});

afterEach(async () => {
	if (root) await act(async () => root?.unmount());
	root = undefined;
	container.remove();
	vi.restoreAllMocks();
});

describe("initial identity SSR hydration", () => {
	it("keeps authenticated gated UI stable and skips a duplicate browser identity request", async () => {
		const getIdentity = vi.fn(() => ({
			id: "browser-user",
			role: "user" as const,
		}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
		const ui = (
			<StackProvider
				basePath="/pages"
				auth={clientAuth}
				initialIdentity={{ id: "server-user", role: "admin" }}
			>
				<clientAuth.CanAccess
					permission={permissions.delete({ id: "document-1" })}
					loading={<span>Checking</span>}
					fallback={<span>No access</span>}
				>
					<button type="button">Delete</button>
				</clientAuth.CanAccess>
			</StackProvider>
		);

		const serverHtml = renderToString(ui);
		expect(serverHtml).toContain("Delete");
		expect(serverHtml).not.toContain("Checking");
		expect(getIdentity).not.toHaveBeenCalled();

		container.innerHTML = serverHtml;
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		await act(async () => {
			root = hydrateRoot(container, ui);
		});

		expect(container.textContent).toBe("Delete");
		expect(getIdentity).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
	});

	it("keeps an anonymous server snapshot settled across hydration", async () => {
		const getIdentity = vi.fn(() => ({
			id: "browser-user",
			role: "admin" as const,
		}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
		const ui = (
			<StackProvider basePath="/pages" auth={clientAuth} initialIdentity={null}>
				<clientAuth.CanAccess
					permission={permissions.delete({ id: "document-1" })}
					loading={<span>Checking</span>}
					fallback={<span>No access</span>}
				>
					<button type="button">Delete</button>
				</clientAuth.CanAccess>
			</StackProvider>
		);

		const serverHtml = renderToString(ui);
		expect(serverHtml).toContain("No access");
		container.innerHTML = serverHtml;
		await act(async () => {
			root = hydrateRoot(container, ui);
		});

		expect(container.textContent).toBe("No access");
		expect(getIdentity).not.toHaveBeenCalled();
	});
});
