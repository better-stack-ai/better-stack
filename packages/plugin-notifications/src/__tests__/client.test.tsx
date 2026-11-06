// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { notificationsPermissions } from "../permissions";
import { updatePreferencesSchema } from "../schemas";
import { notificationsClientPlugin } from "../client/plugin";
import { NotificationBell } from "../client/components/notification-bell";
import { InboxPage } from "../client/components/pages/inbox-page.internal";
import { NotificationPreferencesPageComponent } from "../client/components/pages";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [notificationsPermissions],
	rules: ({ notifications }) => [
		notifications.inbox.read.allow(),
		notifications.inbox.markAllAsRead.allow(),
		notifications.notification.markAsRead.allow(),
		notifications.notification.archive.allow(),
		notifications.preferences.read.allow(),
		notifications.preferences.update.allow(),
	],
});

async function waitFor(check: () => boolean) {
	const deadline = Date.now() + 3000;
	while (!check()) {
		if (Date.now() > deadline)
			throw new Error("Notification client did not settle");
		await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
	}
}

describe("notification UI and cache updates", () => {
	let host: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	beforeEach(() => {
		host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
		queryClient = new QueryClient();
	});
	afterEach(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
		host.remove();
		vi.restoreAllMocks();
	});

	async function render(
		page: "inbox" | "preferences",
		identity: { id: string } | null = { id: "alice" },
	) {
		const stack = createClientStack({
			api: { baseURL: "https://app.test", basePath: "/api" },
			site: { baseURL: "https://app.test", basePath: "/pages" },
			queryClient,
			plugins: { notifications: notificationsClientPlugin() },
		});
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});
		await act(async () =>
			root.render(
				<StackProvider stack={stack} auth={auth} initialIdentity={identity}>
					<QueryClientProvider client={queryClient}>
						<NotificationBell />
						{identity && (
							<Suspense fallback={<p>Loading</p>}>
								{page === "inbox" ? (
									<InboxPage />
								) : (
									<NotificationPreferencesPageComponent />
								)}
							</Suspense>
						)}
					</QueryClientProvider>
				</StackProvider>,
			),
		);
	}

	it("updates the bell and inbox after read/archive operations and hides private data when signed out", async () => {
		let read = false;
		let archived = false;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (init?.method === "POST") {
				if (url.pathname.endsWith("archive")) archived = true;
				else read = true;
				return Response.json({});
			}
			return Response.json({
				items: archived
					? []
					: [
							{
								id: "n1",
								recipientId: "alice",
								category: "activity",
								title: "Your report is ready",
								body: "Open the latest report.",
								href: null,
								createdAt: "2026-11-06T12:00:00Z",
								readAt: read ? "2026-11-06T12:01:00Z" : null,
								archivedAt: null,
							},
						],
				total: archived ? 0 : 1,
				unreadCount: read || archived ? 0 : 1,
			});
		});
		await render("inbox");
		await waitFor(
			() =>
				!!host.querySelector('[aria-label="1 unread notifications"]') &&
				host.textContent?.includes("Your report is ready") === true,
		);
		const mark = [...host.querySelectorAll("button")].find(
			(button) => button.textContent === "Mark as read",
		)!;
		await act(async () => mark.click());
		await waitFor(
			() =>
				!host.querySelector('[aria-label="1 unread notifications"]') &&
				![...host.querySelectorAll("button")].some(
					(button) => button.textContent === "Mark as read",
				),
		);
		const archive = [...host.querySelectorAll("button")].find(
			(button) => button.textContent === "Archive",
		)!;
		await act(async () => archive.click());
		await waitFor(
			() => host.textContent?.includes("You're all caught up.") === true,
		);
		await render("inbox", null);
		expect(host.querySelector('[aria-label="Notifications"]')).toBeNull();
		expect(host.textContent).not.toContain("Your report is ready");
	});

	it("saves both channels for a category and preserves the response on remount", async () => {
		let preference = {
			id: "p1",
			recipientId: "alice",
			category: "activity",
			inApp: true,
			email: false,
			updatedAt: "2026-11-06T12:00:00Z",
		};
		let saved: unknown;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (!url.pathname.endsWith("preferences"))
				return Response.json({ items: [], total: 0, unreadCount: 0 });
			if (init?.method === "PUT") {
				saved = JSON.parse(String(init.body));
				preference = {
					...preference,
					...(saved as { preferences: object[] }).preferences[0],
				};
			}
			return Response.json([preference]);
		});
		await render("preferences");
		await waitFor(
			() => !!host.querySelector('[aria-label="activity email notifications"]'),
		);
		await act(async () =>
			(
				host.querySelector(
					'[aria-label="activity email notifications"]',
				) as HTMLInputElement
			).click(),
		);
		await act(async () =>
			host
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		await waitFor(
			() => host.textContent?.includes("Preferences saved.") === true,
		);
		expect(saved).toEqual({
			preferences: [{ category: "activity", inApp: true, email: true }],
		});
		await render("inbox");
		await render("preferences");
		await waitFor(
			() =>
				(
					host.querySelector(
						'[aria-label="activity email notifications"]',
					) as HTMLInputElement | null
				)?.checked === true,
		);
	});
	it("renders and saves a constructor category alongside ordinary preferences", async () => {
		let preferences = ["constructor", "activity"].map((category) => ({
			id: `preference-${category}`,
			recipientId: "alice",
			category,
			inApp: true,
			email: false,
			updatedAt: "2026-11-06T12:00:00Z",
		}));
		let saved: unknown;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (!url.pathname.endsWith("preferences"))
				return Response.json({ items: [], total: 0, unreadCount: 0 });
			if (init?.method === "PUT") {
				saved = JSON.parse(String(init.body));
				preferences = preferences.map((preference, index) => ({
					...preference,
					...(saved as { preferences: object[] }).preferences[index],
				}));
			}
			return Response.json(preferences);
		});
		const checkbox = (label: string) =>
			host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement | null;
		await render("preferences");
		await waitFor(() => !!checkbox("constructor in-app notifications"));
		expect(checkbox("constructor in-app notifications")?.checked).toBe(true);
		expect(checkbox("constructor email notifications")?.checked).toBe(false);
		await act(async () =>
			checkbox("constructor in-app notifications")!.click(),
		);
		await act(async () => checkbox("activity email notifications")!.click());
		await act(async () =>
			host
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		await waitFor(
			() => host.textContent?.includes("Preferences saved.") === true,
		);
		expect(saved).toEqual({
			preferences: [
				{ category: "constructor", inApp: false, email: false },
				{ category: "activity", inApp: true, email: true },
			],
		});
		await render("inbox");
		await render("preferences");
		await waitFor(() => !!checkbox("constructor in-app notifications"));
		expect(checkbox("constructor in-app notifications")?.checked).toBe(false);
		expect(checkbox("activity email notifications")?.checked).toBe(true);
	});
	it.each([
		{ edits: 1, failSecondBatch: false },
		{ edits: 101, failSecondBatch: true },
	])(
		"saves $edits edited categories from a large preference list and retains failed batches",
		async ({ edits, failSecondBatch }) => {
			let preferences = Array.from({ length: 101 }, (_, index) => ({
				id: `preference-${index}`,
				recipientId: "alice",
				category: `category-${index}`,
				inApp: true,
				email: false,
				updatedAt: "2026-11-06T12:00:00Z",
			}));
			const submitted: {
				category: string;
				inApp: boolean;
				email: boolean;
			}[][] = [];
			vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
				const url = new URL(
					input instanceof Request ? input.url : String(input),
				);
				if (!url.pathname.endsWith("preferences"))
					return Response.json({ items: [], total: 0, unreadCount: 0 });
				if (init?.method === "PUT") {
					const result = updatePreferencesSchema.safeParse(
						JSON.parse(String(init.body)),
					);
					if (!result.success)
						return Response.json(
							{ message: "Too many preferences" },
							{ status: 400 },
						);
					submitted.push(result.data.preferences);
					if (failSecondBatch && submitted.length === 2)
						return Response.json(
							{ message: "Second batch failed" },
							{ status: 500 },
						);
					preferences = preferences.map((preference) => ({
						...preference,
						...result.data.preferences.find(
							(value) => value.category === preference.category,
						),
					}));
				}
				return Response.json(preferences);
			});
			const checkbox = (index: number) =>
				host.querySelector(
					`[aria-label="category-${index} email notifications"]`,
				) as HTMLInputElement | null;
			const submit = async () =>
				act(async () =>
					host
						.querySelector("form")!
						.dispatchEvent(
							new Event("submit", { bubbles: true, cancelable: true }),
						),
				);
			await render("preferences");
			await waitFor(() => !!checkbox(100));
			for (let index = 0; index < edits; index++)
				await act(async () => checkbox(index)!.click());
			await submit();
			if (failSecondBatch) {
				await waitFor(
					() =>
						host
							.querySelector('[role="alert"]')
							?.textContent?.includes("Second batch failed") === true,
				);
				expect(host.textContent).not.toContain("Preferences saved.");
				expect(
					preferences.filter((preference) => preference.email),
				).toHaveLength(100);
				for (let index = 0; index < edits; index++)
					expect(checkbox(index)?.checked).toBe(true);
				await submit();
			}
			await waitFor(
				() => host.textContent?.includes("Preferences saved.") === true,
			);
			expect(submitted.map((batch) => batch.length)).toEqual(
				failSecondBatch ? [100, 1, 100, 1] : [1],
			);
			if (edits === 1)
				expect(submitted[0]).toEqual([
					{ category: "category-0", inApp: true, email: true },
				]);
			expect(preferences.filter((preference) => preference.email)).toHaveLength(
				edits,
			);
			await render("inbox");
			await render("preferences");
			await waitFor(() => !!checkbox(100));
			for (let index = 0; index < 101; index++)
				expect(checkbox(index)?.checked).toBe(index < edits);
		},
	);
	it("stops remaining preference batches when the account changes during a save", async () => {
		const createPreferences = (recipientId: string) =>
			Array.from({ length: 101 }, (_, index) => ({
				id: `${recipientId}-${index}`,
				recipientId,
				category: `category-${index}`,
				inApp: true,
				email: false,
				updatedAt: "2026-11-06T12:00:00Z",
			}));
		const server = {
			alice: createPreferences("alice"),
			bob: createPreferences("bob"),
		};
		let recipientId: "alice" | "bob" = "alice";
		const submittedRecipients: string[] = [];
		let releaseFirst: (() => void) | undefined;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (!url.pathname.endsWith("preferences"))
				return Response.json({ items: [], total: 0, unreadCount: 0 });
			const owner = recipientId;
			if (init?.method === "PUT") {
				const { preferences } = updatePreferencesSchema.parse(
					JSON.parse(String(init.body)),
				);
				submittedRecipients.push(owner);
				server[owner] = server[owner].map((preference) => ({
					...preference,
					...preferences.find(
						(value) => value.category === preference.category,
					),
				}));
				if (submittedRecipients.length === 1)
					return new Promise<Response>((resolve) => {
						releaseFirst = () => resolve(Response.json(server[owner]));
					});
			}
			return Response.json(server[owner]);
		});
		queryClient.setQueryData(
			["notificationPreferences", "list", { id: "bob" }],
			server.bob,
		);
		await render("preferences");
		await waitFor(
			() => host.querySelectorAll('input[type="checkbox"]').length === 202,
		);
		for (let index = 0; index < 101; index++)
			await act(async () =>
				(
					host.querySelector(
						`[aria-label="category-${index} email notifications"]`,
					) as HTMLInputElement
				).click(),
			);
		await act(async () =>
			host
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		await waitFor(() => !!releaseFirst);
		recipientId = "bob";
		await render("preferences", { id: "bob" });
		await waitFor(
			() =>
				!!host.querySelector('[aria-label="category-100 email notifications"]'),
		);
		await act(async () => releaseFirst!());
		await waitFor(() =>
			queryClient
				.getMutationCache()
				.getAll()
				.every((mutation) => mutation.state.status === "success"),
		);
		expect(submittedRecipients).toEqual(["alice"]);
		expect(server.alice.filter((preference) => preference.email)).toHaveLength(
			100,
		);
		expect(server.bob.every((preference) => !preference.email)).toBe(true);
		expect(
			(
				host.querySelector(
					'[aria-label="category-100 email notifications"]',
				) as HTMLInputElement
			).checked,
		).toBe(false);
	});
	it("discards unsaved preferences when a cached second identity replaces the first", async () => {
		let recipientId = "alice";
		const preference = {
			id: "p1",
			recipientId: "alice",
			category: "activity",
			inApp: true,
			email: false,
			updatedAt: "2026-11-06T12:00:00Z",
		};
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			return Response.json(
				url.pathname.endsWith("preferences")
					? [{ ...preference, recipientId }]
					: { items: [], total: 0, unreadCount: 0 },
			);
		});
		queryClient.setQueryData(
			["notificationPreferences", "list", { id: "bob" }],
			[{ ...preference, id: "p2", recipientId: "bob" }],
		);
		await render("preferences");
		await waitFor(
			() => !!host.querySelector('[aria-label="activity email notifications"]'),
		);
		await act(async () =>
			(
				host.querySelector(
					'[aria-label="activity email notifications"]',
				) as HTMLInputElement
			).click(),
		);
		expect(
			(
				host.querySelector(
					'[aria-label="activity email notifications"]',
				) as HTMLInputElement
			).checked,
		).toBe(true);
		recipientId = "bob";
		await render("preferences", { id: "bob" });
		await waitFor(
			() => !!host.querySelector('[aria-label="activity email notifications"]'),
		);
		expect(
			(
				host.querySelector(
					'[aria-label="activity email notifications"]',
				) as HTMLInputElement
			).checked,
		).toBe(false);
	});
});
