import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { createBackendStack } from "../../../api";
import {
	newsletterBackendPlugin,
	type NewsletterBackendOptions,
} from "../api/plugin";
import type { EmailOptions } from "../api/email-adapter";
import { claimCampaign } from "../api/mutations";
import { parseSubscriberCsv, exportSubscriberCsv } from "../api/csv";

const base = "https://example.test/api/newsletter";
const draft = {
	subject: "Field notes",
	fromName: "The editor",
	fromEmail: "editor@example.test",
	body: "# A new edition\n\n[Read the article](https://example.test/post?one=1&two=2)",
	tags: ["readers"],
};
function setup(overrides: Partial<NewsletterBackendOptions> = {}) {
	const emails: EmailOptions[] = [];
	let adapter!: DBAdapter;
	const send = vi.fn(async (email: EmailOptions) => {
		emails.push(email);
		return { messageId: `message-${emails.length}` };
	});
	const stack = createBackendStack({
		basePath: "/api",
		plugins: {
			newsletter: newsletterBackendPlugin({
				emailAdapter: { send },
				unsubscribeBaseURL: base,
				...overrides,
			}),
		},
		adapter: (db) => {
			adapter = createMemoryAdapter(db)({});
			return adapter;
		},
	});
	return {
		stack,
		adapter: () => adapter,
		emails,
		send,
		operations: stack.trusted.newsletter,
	};
}
function tokenFrom(html: string, route: string): string {
	const match = html.match(new RegExp(`${route}\\?token=([a-f0-9]{64})`));
	if (!match?.[1]) throw new Error(`Missing ${route} token`);
	return match[1];
}
function publicRequest(path: string, method = "GET", body?: unknown) {
	return new Request(`https://example.test/api/newsletter/${path}`, {
		method,
		...(body
			? {
					body: JSON.stringify(body),
					headers: { "content-type": "application/json" },
				}
			: {}),
	});
}

describe("newsletter operation flows", () => {
	it("requires management authorization while allowing the public form without admin token disclosure", async () => {
		const { stack, operations } = setup();
		expect((await stack.handler(publicRequest("subscribers"))).status).toBe(
			401,
		);
		const response = await stack.handler(
			publicRequest("subscribe", "POST", {
				email: "reader@example.test",
				tags: ["readers"],
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			message: expect.any(String),
		});
		const result = await operations.listSubscribers({});
		expect(result.items[0]).toMatchObject({
			email: "reader@example.test",
			status: "subscribed",
			tags: ["readers"],
		});
		expect(JSON.stringify(result)).not.toMatch(/Token|token/);
	});

	it("sends one targeted copy under concurrent sends and keeps old unsubscribe links valid", async () => {
		const { operations, emails, stack, send } = setup();
		await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
		});
		await operations.createSubscriber({
			email: "other@example.test",
			tags: ["other"],
		});
		await operations.createSubscriber({
			email: "optout@example.test",
			tags: ["readers"],
			status: "unsubscribed",
		});
		const first = await operations.createCampaign(draft);
		const results = await Promise.allSettled([
			operations.sendCampaign({ id: first.id }),
			operations.sendCampaign({ id: first.id }),
		]);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(send).toHaveBeenCalledTimes(1);
		expect(emails[0]).toMatchObject({
			to: "reader@example.test",
			idempotencyKey: expect.any(String),
		});
		expect(emails[0]?.html).toContain("<h1>A new edition</h1>");
		const oldUnsubscribe = tokenFrom(emails[0]?.html ?? "", "unsubscribe");
		const second = await operations.createCampaign(draft);
		await operations.sendCampaign({ id: second.id });
		expect(send).toHaveBeenCalledTimes(2);
		const response = await stack.handler(
			publicRequest(`unsubscribe?token=${oldUnsubscribe}`),
		);
		expect(response.status).toBe(200);
		expect(
			(await operations.listSubscribers({ query: "reader@" })).items[0]?.status,
		).toBe("unsubscribed");
		await operations.subscribe({
			email: "reader@example.test",
			tags: ["other"],
			name: "Injected",
		});
		expect(
			(await operations.listSubscribers({ query: "reader@" })).items[0],
		).toMatchObject({ status: "unsubscribed", tags: ["readers"] });
		await expect(
			operations.sendCampaign({ id: first.id }),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it("tracks unique opens and clicks, and redirects only to stored links", async () => {
		const { operations, emails, stack } = setup();
		await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
		});
		const campaign = await operations.createCampaign(draft);
		await operations.sendCampaign({ id: campaign.id });
		const token = tokenFrom(emails[0]?.html ?? "", "track/open");
		for (let i = 0; i < 2; i++)
			expect(
				(
					await stack.handler(publicRequest(`track/open?token=${token}`))
				).headers.get("content-type"),
			).toBe("image/gif");
		const clicked = await stack.handler(
			publicRequest(`track/click?token=${token}&link=0&url=https://evil.test`),
		);
		expect(clicked.status).toBe(302);
		expect(clicked.headers.get("location")).toBe(
			"https://example.test/post?one=1&two=2",
		);
		expect(
			(await stack.handler(publicRequest(`track/click?token=${token}&link=1`)))
				.status,
		).toBe(404);
		expect(
			await operations.getCampaignStats({ id: campaign.id }),
		).toMatchObject({
			delivered: 1,
			opened: 1,
			clicked: 1,
			openRate: 1,
			clickRate: 1,
		});
		expect(
			(
				await stack.handler(
					publicRequest(`unsubscribe?token=${"0".repeat(64)}`),
				)
			).status,
		).toBe(404);
	});

	it("confirms opt-in once, rejects expired links, and retries failed confirmation without altering subscriber tags", async () => {
		let failFirst = true;
		const confirmations: string[] = [];
		const { operations, adapter } = setup({
			doubleOptIn: true,
			hooks: {
				onConfirmationRequired: async ({ url }) => {
					if (failFirst) {
						failFirst = false;
						throw new Error("temporary transport failure");
					}
					confirmations.push(url);
				},
			},
		});
		await expect(
			operations.subscribe({ email: "reader@example.test", tags: ["readers"] }),
		).rejects.toThrow("temporary transport failure");
		await operations.subscribe({
			email: "reader@example.test",
			tags: ["injected"],
			name: "Injected",
		});
		expect(confirmations).toHaveLength(1);
		let reader = (await operations.listSubscribers({})).items[0];
		expect(reader).toMatchObject({ status: "unsubscribed", tags: ["readers"] });
		const token = new URL(confirmations[0]!).searchParams.get("token")!;
		await operations.confirmSubscription({ token });
		await expect(
			operations.confirmSubscription({ token }),
		).rejects.toMatchObject({ statusCode: 400 });
		await operations.updateSubscriber({
			id: reader!.id,
			data: { status: "unsubscribed" },
		});
		await adapter().update({
			model: "newsletterSubscriber",
			where: [{ field: "id", value: reader!.id, operator: "eq" }],
			update: { confirmationSentAt: new Date(0) },
		});
		await operations.subscribe({
			email: "reader@example.test",
			tags: ["injected"],
		});
		expect(confirmations).toHaveLength(2);
		const expired = new URL(confirmations[1]!).searchParams.get("token")!;
		await adapter().update({
			model: "newsletterSubscriber",
			where: [{ field: "id", value: reader!.id, operator: "eq" }],
			update: { confirmationExpiresAt: new Date(0) },
		});
		await expect(
			operations.confirmSubscription({ token: expired }),
		).rejects.toMatchObject({ statusCode: 400 });
		reader = (await operations.listSubscribers({})).items[0];
		expect(reader).toMatchObject({ status: "unsubscribed", tags: ["readers"] });
	});

	it("does not claim a campaign rescheduled after a scheduler snapshot", async () => {
		const { operations, adapter, send } = setup();
		const campaign = await operations.createCampaign(draft);
		await operations.scheduleCampaign({
			id: campaign.id,
			scheduledAt: new Date(Date.now() + 60_000).toISOString(),
		});
		expect(
			await claimCampaign(adapter(), campaign.id, "scheduled", new Date()),
		).toBeNull();
		expect(await operations.sendScheduledCampaigns({})).toEqual({ sent: 0 });
		await adapter().update({
			model: "newsletterCampaign",
			where: [{ field: "id", value: campaign.id, operator: "eq" }],
			update: { scheduledAt: new Date(Date.now() - 1000) },
		});
		await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
		});
		expect(await operations.sendScheduledCampaigns({})).toEqual({ sent: 1 });
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("rejects malformed CSV before writes and preserves imported opt-outs", async () => {
		const { operations } = setup();
		await expect(
			operations.importSubscribers({
				csv: 'email,tags\nvalid@example.test,[]\nother@example.test,"[bad"',
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		expect((await operations.listSubscribers({})).total).toBe(0);
		await expect(
			operations.importSubscribers({
				csv: "email\nvalid@example.test\ninvalid",
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		expect((await operations.listSubscribers({})).total).toBe(0);
		await operations.createSubscriber({
			email: "reader@example.test",
			status: "unsubscribed",
			tags: ["original"],
		});
		await operations.importSubscribers({
			csv: 'email,name,status,tags\nreader@example.test,New,subscribed,[]\nnew@example.test,"Reader, two",subscribed,"[""readers""]"',
		});
		expect(
			(await operations.listSubscribers({ query: "reader@" })).items[0],
		).toMatchObject({ status: "unsubscribed", tags: ["original"] });
		expect((await operations.listSubscribers({})).total).toBe(2);
		const exported = await operations.exportSubscribers({});
		expect(parseSubscriberCsv(exported.csv)).toHaveLength(2);
	});

	it("renders provider failures as failed receipts and never automatically sends them again", async () => {
		const { operations, send } = setup();
		await operations.createSubscriber({
			email: "reader@example.test",
			tags: ["readers"],
		});
		const campaign = await operations.createCampaign(draft);
		send.mockRejectedValueOnce(new Error("provider unavailable"));
		await operations.sendCampaign({ id: campaign.id });
		expect(
			await operations.getCampaignStats({ id: campaign.id }),
		).toMatchObject({ delivered: 0, failed: 1, recipientCount: 1 });
		await expect(
			operations.sendCampaign({ id: campaign.id }),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("exports formula-safe names and keeps CSV multiline values", () => {
		const csv = exportSubscriberCsv([
			{
				id: "one",
				email: "reader@example.test",
				name: "=HYPERLINK(1)",
				status: "subscribed",
				tags: [],
				createdAt: new Date().toISOString(),
			},
		]);
		expect(parseSubscriberCsv(csv)[0]?.name).toBe("'=HYPERLINK(1)");
		expect(
			parseSubscriberCsv('email,name\r\nreader@example.test,"First\nSecond"')[0]
				?.name,
		).toBe("First\nSecond");
	});
});
