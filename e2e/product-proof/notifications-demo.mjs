import { fileURLToPath } from "node:url";

const recipientId = "notifications-demo358";
const userCookie = `btst.example_session=mock-session-${recipientId}`;
const notifications = [
	{
		category: "updates",
		title: "Your project export is ready",
		body: "The November workspace export is ready to download.",
	},
	{
		category: "activity",
		title: "Review requested on the launch plan",
		body: "A teammate asked for your feedback before Friday’s launch.",
	},
	{
		category: "updates",
		title: "Weekly workspace summary",
		body: "Three projects shipped this week. View the latest workspace activity.",
	},
];

export const config = {
	baseURL: process.env.PRODUCT_PROOF_BASE_URL ?? "http://localhost:3006",
	outDir: fileURLToPath(
		new URL("../../docs/assets/notifications", import.meta.url),
	),
	videoName: "notifications-demo",
	viewport: { width: 1440, height: 900 },
	captionHold: 2400,
	captionStyle: { accent: "#2563eb" },
	async signIn({ context, baseURL }) {
		const api = `${baseURL}/api/data/notifications`;
		async function request(path, method = "GET", body, admin = false) {
			const response = await fetch(`${api}${path}`, {
				method,
				headers: {
					cookie: admin
						? "btst.example_session=mock-session-admin-e2e"
						: userCookie,
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
				signal: AbortSignal.timeout(10000),
			});
			if (!response.ok)
				throw new Error(`${method} ${path}: ${response.status}`);
			return response.json();
		}
		const previous = await request("?limit=100");
		for (const item of previous.items)
			await request(`/${item.id}/archive`, "POST", {});
		await request("/preferences", "PUT", {
			preferences: ["activity", "updates"].map((category) => ({
				category,
				inApp: true,
				email: false,
			})),
		});
		for (const notification of notifications)
			await request("/send", "POST", { recipientId, ...notification }, true);
		await context.addCookies([
			{
				name: "btst.example_session",
				value: `mock-session-${recipientId}`,
				url: baseURL,
				httpOnly: true,
				sameSite: "Lax",
			},
		]);
	},
};

export const beats = [
	{
		name: "Notification inbox",
		async run({ page, goto, caption }) {
			await goto("/pages/notifications");
			await page
				.getByLabel("3 unread notifications", { exact: true })
				.waitFor();
			await caption(
				"A personal inbox keeps project updates and activity together.",
			);
		},
	},
	{
		name: "Navigation bell",
		async run({ page, caption }) {
			await page
				.getByRole("button", { name: "Notifications", exact: true })
				.click();
			await page
				.getByRole("dialog", { name: "Recent notifications" })
				.waitFor();
			await caption(
				"The navigation bell opens recent notifications without leaving the page.",
			);
		},
	},
	{
		name: "Read notifications",
		async run({ page, caption }) {
			await page.keyboard.press("Escape");
			await page
				.getByRole("button", { name: "Mark all as read", exact: true })
				.click();
			await page
				.getByLabel("3 unread notifications", { exact: true })
				.waitFor({ state: "detached" });
			await caption(
				"Marking the inbox as read also clears the bell’s unread badge.",
			);
		},
	},
	{
		name: "Delivery preferences",
		async run({ page, goto, caption }) {
			await caption("", 0);
			await goto("/pages/notifications/preferences");
			await page
				.getByRole("heading", { name: "Notification preferences", exact: true })
				.waitFor();
			await caption(
				"Choose in-app and email delivery separately for each category.",
			);
		},
	},
	{
		name: "Saved email preference",
		async run({ page, caption }) {
			await page
				.getByLabel("updates email notifications", { exact: true })
				.check();
			await page
				.getByRole("button", { name: "Save preferences", exact: true })
				.click();
			await page
				.getByRole("status")
				.filter({ hasText: "Preferences saved." })
				.waitFor();
			await caption(
				"Updates now allow email delivery; activity keeps its own settings.",
			);
		},
	},
];
